import { getSupabaseAdmin, verifyAuth } from '../auth.js';
import { isValidTimeZone, parseOfficeInstant, validateOfficeSlot } from './workflow.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const restricted = new Set(['PENDING', 'GUEST', 'KIOSK', 'ACCOUNTANT']);
const actions = new Set(['request_approval', 'approve', 'decline', 'cancel', 'complete', 'mark_no_show']);

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
      let query;
      if (scope === 'mine') {
        query = admin.from('pastoral_requests').select('id,office_id,category,preferred_start,preferred_zone,contact_preference,status,version,created_at,pastoral_appointments(starts_at,ends_at,display_zone,status)').eq('requester_user_id', auth.user.id);
      } else if (scope === 'office' && UUID.test(String(req.query?.officeId || ''))) {
        const officeId = String(req.query.officeId);
        const [owner, assistant] = await Promise.all([
          admin.from('pastoral_offices').select('id').eq('id',officeId).eq('pastor_user_id',auth.user.id).maybeSingle(),
          admin.from('pastoral_office_assignments').select('office_id').eq('office_id',officeId).eq('user_id',auth.user.id).eq('office_role','PASTORS_ASSISTANT').is('revoked_at',null).maybeSingle(),
        ]);
        if (owner.error || assistant.error) return res.status(503).json({ok:false,error:'Could not verify office access.'});
        if (!owner.data && !assistant.data) return res.status(403).json({ok:false,error:'Office access is not assigned.'});
        query = admin.from('pastoral_requests').select('id,office_id,category,preferred_start,preferred_zone,contact_preference,brief_message,status,version,created_at,requester:users!pastoral_requests_requester_user_id_fkey(name),pastoral_appointments(starts_at,ends_at,display_zone,status)').eq('office_id', officeId);
      } else return res.status(400).json({ ok:false,error:'Invalid request view.' });
      const { data, error } = await query.order('created_at', { ascending:false }).limit(100);
      if (error) return res.status(503).json({ ok:false,error:'Could not load requests.' });
      return res.status(200).json({ ok:true, requests:data || [] });
    }
    if (req.method !== 'POST') return res.status(405).json({ ok:false,error:'Method not allowed.' });
    const body = req.body || {};
    let result;
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
