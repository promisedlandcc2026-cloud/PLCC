import { getSupabaseAdmin, verifyAuth } from '../auth.js';
import { isValidTimeZone, parseOfficeInstant, validateOfficeSlot } from './workflow.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const restricted = new Set(['PENDING', 'GUEST', 'KIOSK', 'ACCOUNTANT']);
const actions = new Set(['request_approval', 'approve', 'decline', 'cancel', 'complete', 'mark_no_show', 'request_reschedule']);

/** Return a redacted request list, or perform one transaction through service-only SQL. */
export async function handlePastoralRequests(req: any, res: any, injected?: { admin: any; verify: typeof verifyAuth }) {
  res.setHeader('Cache-Control', 'private, no-store');
  const admin = injected?.admin || getSupabaseAdmin();
  if (!admin) return res.status(503).json({ ok: false, error: 'Pastor’s Office is unavailable.' });
  const auth = await (injected?.verify || verifyAuth)(req, admin);
  if (auth.unavailable) return res.status(503).json({ ok: false, error: 'Sign-in verification unavailable.' });
  if (!auth.user) return res.status(401).json({ ok: false, error: 'Please sign in.' });
  if (!auth.role || restricted.has(String(auth.role).toUpperCase())) return res.status(403).json({ ok: false, error: 'Office access is not available.' });
  try {
    if (req.method === 'GET') {
      const scope = String(req.query?.scope || 'mine');
      if (scope === 'available') {
        const { data, error } = await admin.from('pastoral_offices').select('id,users!pastoral_offices_pastor_user_id_fkey(name)');
        if (error) return res.status(503).json({ ok:false, error:'Could not load available offices.' });
        const offices = (data || []).map((row: any) => ({ id: row.id, pastorName: (Array.isArray(row.users) ? row.users[0]?.name : row.users?.name) || 'Pastoral office' }));
        return res.status(200).json({ ok:true, offices });
      }
      if (scope === 'preferences') {
        const pref=await admin.from('pastoral_notification_preferences').select('reminders_enabled,reminder_hours').eq('user_id',auth.user.id).maybeSingle();
        if (pref.error) return res.status(503).json({ok:false,error:'Could not load notification preferences.'});
        return res.status(200).json({ok:true,preferences:pref.data || {reminders_enabled:true,reminder_hours:24}});
      }
      if (scope === 'private_note') {
        const requestId = String(req.query?.requestId || '');
        if (!UUID.test(requestId)) return res.status(400).json({ok:false,error:'Invalid request.'});
        const result = await admin.rpc('pastoral_private_note',{p_actor:auth.user.id,p_request:requestId,p_body:null,p_write:false});
        if (result.error) return res.status(result.error.code === '42501' ? 403 : 503).json({ok:false,error:'Private note unavailable.'});
        return res.status(200).json({ok:true,note:result.data || ''});
      }
      let query;
      let redactAssistantMessage=false;
      if (scope === 'mine') {
        query = admin.from('pastoral_requests').select('id,office_id,category,preferred_start,preferred_zone,contact_preference,status,version,created_at,pastoral_appointments(starts_at,ends_at,display_zone,status)').eq('requester_user_id', auth.user.id);
      } else if (['office','blocks','calendar'].includes(scope) && UUID.test(String(req.query?.officeId || ''))) {
        const officeId = String(req.query.officeId);
        const [owner, assistant] = await Promise.all([
          admin.from('pastoral_offices').select('id').eq('id',officeId).eq('pastor_user_id',auth.user.id).maybeSingle(),
          admin.from('pastoral_office_assignments').select('office_id').eq('office_id',officeId).eq('user_id',auth.user.id).eq('office_role','PASTORS_ASSISTANT').is('revoked_at',null).maybeSingle(),
        ]);
        if (owner.error || assistant.error) return res.status(503).json({ok:false,error:'Could not verify office access.'});
        if (!owner.data && !assistant.data) return res.status(403).json({ok:false,error:'Office access is not assigned.'});
        if (scope === 'calendar') {
          const start=String(req.query?.start || ''), end=String(req.query?.end || '');
          const from=parseOfficeInstant(start), until=parseOfficeInstant(end);
          const page=Number(req.query?.page ?? 0);
          if (from===null || until===null || until<=from || until-from>32*86400000 || !Number.isSafeInteger(page) || page<0 || page>10000) return res.status(400).json({ok:false,error:'Invalid calendar period.'});
          const size=100;
          const {data,error}=await admin.from('pastoral_appointments')
            .select('id,request_id,starts_at,ends_at,status,pastoral_requests!inner(category,requester:users!pastoral_requests_requester_user_id_fkey(name))')
            .eq('office_id',officeId).in('status',['proposed','awaiting_approval','confirmed'])
            .lt('starts_at',end).gt('ends_at',start).order('starts_at',{ascending:true}).order('id',{ascending:true}).range(page*size,page*size+size);
          if(error) return res.status(503).json({ok:false,error:'Could not load calendar.'});
          const items=Array.isArray(data)?data:[];
          return res.status(200).json({ok:true,appointments:items.slice(0,size),hasMore:items.length>size});
        }
        if (scope === 'blocks') {
          const {data,error}=await admin.from('pastoral_time_blocks').select('id,starts_at,ends_at').eq('office_id',officeId).order('starts_at',{ascending:true}).limit(500);
          if (error) return res.status(503).json({ok:false,error:'Could not load unavailable times.'});
          return res.status(200).json({ok:true,blocks:data || []});
        }
        const fields = 'id,office_id,category,preferred_start,preferred_zone,contact_preference,status,version,created_at,requester:users!pastoral_requests_requester_user_id_fkey(name),pastoral_appointments(starts_at,ends_at,display_zone,status)';
        redactAssistantMessage=!owner.data;
        query = admin.from('pastoral_requests').select(fields + ',brief_message').eq('office_id', officeId);
      } else return res.status(400).json({ ok:false,error:'Invalid request view.' });
      const { data, error } = await query.order('created_at', { ascending:false }).limit(100);
      if (error) return res.status(503).json({ ok:false,error:'Could not load requests.' });
      const requests = redactAssistantMessage ? (data || []).map((row:any) => {
        const {brief_message,...safe} = row;
        const service = typeof brief_message==='string' ? /^\[Service: (Child dedication|Wedding|Other)\](?:\n|$)/.exec(brief_message)?.[1] : null;
        return {...safe,...(service && row.category==='appointment' ? {service_label:service} : {})};
      }) : data || [];
      return res.status(200).json({ ok:true, requests });
    }
    if (req.method !== 'POST') return res.status(405).json({ ok:false,error:'Method not allowed.' });
    const body = req.body || {};
    let result;
    if (body.action === 'set_preferences') {
      if (typeof body.remindersEnabled !== 'boolean' || !Number.isInteger(body.reminderHours) || body.reminderHours<1 || body.reminderHours>168) return res.status(400).json({ok:false,error:'Invalid reminder preference.'});
      const pref=await admin.from('pastoral_notification_preferences').upsert({user_id:auth.user.id,reminders_enabled:body.remindersEnabled,reminder_hours:body.reminderHours},{onConflict:'user_id'});
      if (pref.error) return res.status(503).json({ok:false,error:'Could not save preferences.'});
      return res.status(200).json({ok:true});
    }
    if (body.action === 'add_block' || body.action === 'remove_block') {
      const adding=body.action === 'add_block';
      if (!UUID.test(String(body.officeId || '')) || (adding ? (parseOfficeInstant(body.start) === null || parseOfficeInstant(body.end) === null || Date.parse(body.end)<=Date.parse(body.start)) : !UUID.test(String(body.blockId || '')))) return res.status(400).json({ok:false,error:'Invalid unavailable time.'});
      const block=await admin.rpc('pastoral_set_time_block',{p_actor:auth.user.id,p_office:body.officeId,p_start:adding?body.start:null,p_end:adding?body.end:null,p_block:adding?null:body.blockId});
      if (block.error) return res.status(block.error.code === '42501' ? 403 : block.error.code === '23P01' ? 409 : 400).json({ok:false,error:'Could not update unavailable time. Check for conflicts.'});
      return res.status(200).json({ok:true});
    }
    if (body.action === 'save_private_note') {
      if (!UUID.test(String(body.requestId || '')) || typeof body.note !== 'string' || body.note.length > 10000) return res.status(400).json({ok:false,error:'Invalid note.'});
      const note = await admin.rpc('pastoral_private_note',{p_actor:auth.user.id,p_request:body.requestId,p_body:body.note,p_write:true});
      if (note.error) return res.status(note.error.code === '42501' ? 403 : 503).json({ok:false,error:'Could not save private note.'});
      return res.status(200).json({ok:true});
    }
    if (body.action === 'submit') {
      if (!UUID.test(String(body.officeId || '')) || !['appointment','counseling','baptism'].includes(body.category) || !['app','phone','email'].includes(body.contactPreference) || parseOfficeInstant(body.preferredStart) === null || !isValidTimeZone(body.timeZone) || (body.message != null && (typeof body.message !== 'string' || body.message.length > 500))) return res.status(400).json({ok:false,error:'Please check the request details.'});
      result = await admin.rpc('pastoral_submit_request',{p_actor:auth.user.id,p_office:body.officeId,p_category:body.category,p_preferred:body.preferredStart,p_zone:body.timeZone,p_contact:body.contactPreference,p_message:body.message || null});
    } else if (body.action === 'propose') {
      if (!UUID.test(String(body.requestId || '')) || !Number.isSafeInteger(body.version) || body.version < 1 || !validateOfficeSlot(body.start,body.end,body.timeZone)) return res.status(400).json({ok:false,error:'Please check the proposed time.'});
      result = await admin.rpc('pastoral_propose_slot',{p_actor:auth.user.id,p_request:body.requestId,p_version:body.version,p_start:body.start,p_end:body.end,p_zone:body.timeZone});
    } else if (actions.has(body.action)) {
      if (!UUID.test(String(body.requestId || '')) || !Number.isSafeInteger(body.version) || body.version < 1) return res.status(400).json({ok:false,error:'Please refresh and try again.'});
      result = await admin.rpc('pastoral_transition_request',{p_actor:auth.user.id,p_request:body.requestId,p_version:body.version,p_action:body.action});
    } else return res.status(400).json({ok:false,error:'Unknown action.'});
    if (result.error) {
      const code = String(result.error.code || '');
      if (code === '42501') return res.status(403).json({ok:false,error:'You cannot perform this action.'});
      if (code === '23P01' || code === '40001') return res.status(409).json({ok:false,error:'The time or request changed. Refresh and try again.'});
      return res.status(400).json({ok:false,error:'Could not update the request. Please check the details and try again.'});
    }
    // The database transaction is already committed. A failed delivery leaves the
    // outbox pending for retry; it must never turn a successful booking into a retry.
    try { await admin.rpc('pastoral_deliver_inbox', { p_limit: 50 }); } catch { /* queued for retry */ }
    return res.status(200).json({ok:true,...(body.action === 'submit' ? { requestId: result.data } : {})});
  } catch { return res.status(503).json({ok:false,error:'Pastor’s Office is temporarily unavailable.'}); }
}
