/**
 * PLCC Chat — event and Serve cards in a chat  (see supabase/migrations/chat_cards.sql)
 * resource=community&subResource=card-*
 *
 *   GET  card-options                     — upcoming approved events + open Serve needs (picker)
 *   POST card-create { messageId, kind: 'event'|'serve', refId }
 *        Rides on a chat message the author just sent (every posting rule already applied),
 *        author only, within 10 minutes.
 *   GET  cards ?messageIds=a,b            — card details for messages in rooms you can open:
 *        event: title, when, where, Sign-up link, "I'll be there" count + yours
 *        serve: title, role, when, where, spots left, your sign-up status
 *   POST card-going { eventId, going }    — your own "I'll be there" (public.attendance_plans,
 *        the same list as Connect's Home ticket)
 *
 * Serve sign-up itself goes through PLCC Connect's /api/serve (staff-verified eligibility
 * gate + serve_signup_opportunity RPC); PLCC Chat's bridge forwards the member's token there.
 */
import { normalizeEventStatus } from './eventApprovalLogic.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ATTACH_WINDOW_MS = 10 * 60 * 1000;
const MAX_LOOKUP = 100;
const VAULT_PUBLIC_ORIGIN = String(process.env.VAULT_PUBLIC_ORIGIN || 'https://plcc-vault.vercel.app').replace(/\/+$/, '');
const CHURCH_TZ = 'Africa/Kampala';
const ACTIVE_SIGNUP = ['pending', 'confirmed'];

export type CardKind = 'event' | 'serve';

export function parseCardInput(body: any):
  | { ok: true; messageId: string; kind: CardKind; refId: string }
  | { ok: false; error: string } {
  const messageId = String(body?.messageId || '').trim();
  const kind = String(body?.kind || '').trim();
  const refId = String(body?.refId || '').trim();
  if (!UUID_RE.test(messageId)) return { ok: false, error: 'messageId is required' };
  if (kind !== 'event' && kind !== 'serve') return { ok: false, error: 'Pick an event or a Serve need.' };
  if (!UUID_RE.test(refId)) return { ok: false, error: 'Pick an event or a Serve need.' };
  return { ok: true, messageId, kind, refId };
}

/** Event start as an ISO string: starts_at when it agrees with date, else date + "7:00 PM" time. */
export function eventStartIso(ev: any): string | null {
  const date = ev?.date ? String(ev.date).slice(0, 10) : '';
  const starts = ev?.starts_at ? String(ev.starts_at) : '';
  if (!date) return starts || null;
  if (starts && starts.slice(0, 10) === date) return starts;
  const m = String(ev?.time || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return `${date}T12:00:00`;
  let h = parseInt(m[1], 10);
  const mer = (m[3] || '').toUpperCase();
  if (mer === 'PM' && h < 12) h += 12;
  if (mer === 'AM' && h === 12) h = 0;
  return `${date}T${String(h).padStart(2, '0')}:${m[2]}:00`;
}

/** Calendar day of an event at the church (attendance_plans.service_date). */
export function eventServiceDate(ev: any): string {
  if (ev?.date) return String(ev.date).slice(0, 10);
  const iso = eventStartIso(ev);
  if (!iso) return new Date().toISOString().slice(0, 10);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', { timeZone: CHURCH_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** The Vault page members use to sign up (RSVP) for an event, when RSVPs are on. */
export function eventSignupUrl(ev: any): string | null {
  if (ev?.rsvp_enabled !== true) return null;
  const custom = String(ev?.rsvp_url || '').trim();
  if (custom) {
    if (/^https:\/\//i.test(custom)) return custom;
    if (custom.startsWith('/#/')) return `${VAULT_PUBLIC_ORIGIN}${custom}`;
    if (custom.startsWith('#/')) return `${VAULT_PUBLIC_ORIGIN}/${custom}`;
    if (custom.startsWith('/')) return `${VAULT_PUBLIC_ORIGIN}/#${custom}`;
  }
  return `${VAULT_PUBLIC_ORIGIN}/#/events/${ev.id}/rsvp`;
}

export function eventCardDto(ev: any, going: boolean, goingCount: number) {
  return {
    id: String(ev.id),
    title: String(ev.name || ev.title || 'Event').slice(0, 200),
    startsAt: eventStartIso(ev),
    timeLabel: ev?.time ? String(ev.time).slice(0, 40) : null,
    endTime: ev?.end_time ? String(ev.end_time).slice(0, 40) : null,
    location: ev?.location ? String(ev.location).slice(0, 200) : null,
    imageUrl: /^https:\/\//i.test(String(ev?.image_url || '')) ? String(ev.image_url) : null,
    signupUrl: eventSignupUrl(ev),
    going,
    goingCount,
  };
}

export function serveCardDto(opp: any, taken: number, mine: string | null) {
  const capacity = Number.isFinite(Number(opp?.capacity)) && Number(opp.capacity) > 0 ? Number(opp.capacity) : null;
  return {
    id: String(opp.id),
    title: String(opp.title || 'Serve').slice(0, 200),
    roleLabel: opp?.role_label ? String(opp.role_label).slice(0, 120) : null,
    description: opp?.description ? String(opp.description).slice(0, 500) : null,
    startsAt: opp?.starts_at ? String(opp.starts_at) : null,
    endsAt: opp?.ends_at ? String(opp.ends_at) : null,
    location: opp?.location ? String(opp.location).slice(0, 200) : null,
    capacity,
    spotsLeft: capacity == null ? null : Math.max(0, capacity - taken),
    open: String(opp?.status || 'open') === 'open',
    requiresApproval: opp?.requires_approval === true,
    mySignup: mine, // 'pending' | 'confirmed' | null
  };
}

function isMissingTable(err: any, name?: string): boolean {
  const m = String(err?.message || '') + ' ' + String(err?.code || '');
  return /42P01|PGRST205|does not exist|schema cache/i.test(m) && (!name || m.includes(name) || /42P01|PGRST205/.test(m));
}

const NOT_READY = { ok: false, code: 'needs_setup', error: 'Event cards are not set up yet. Run supabase/migrations/chat_cards.sql.' };

type Deps = {
  supabase: any;
  userId: string;
  resolveMessageChannelAccess: (messageId: string) => Promise<
    { ok: true; message: any; channel: any } | { ok: false; status: number; error: string }
  >;
  broadcast: (channelId: string, messageId: string) => void;
};

async function loadEvent(supabase: any, id: string) {
  const { data } = await supabase.from('events').select('*').eq('id', id).maybeSingle();
  return data && normalizeEventStatus(data.status) === 'approved' ? data : null;
}

export async function handleChatCards(chatType: string, req: any, res: any, deps: Deps) {
  const { supabase, userId } = deps;
  const method = String(req.method || 'GET').toUpperCase();
  try {
    if (chatType === 'card-options') {
      if (method !== 'GET') return res.status(405).json({ ok: false, error: 'Use GET' });
      const today = new Date(Date.now() - 12 * 3600_000).toISOString().slice(0, 10);
      const [evRes, oppRes] = await Promise.all([
        supabase.from('events').select('*').gte('date', today).order('date', { ascending: true }).limit(40),
        supabase.from('serve_opportunities').select('*').eq('status', 'open').order('starts_at', { ascending: true }).limit(60),
      ]);
      const events = (evRes.data || [])
        .filter((e: any) => normalizeEventStatus(e.status) === 'approved')
        .slice(0, 25)
        .map((e: any) => ({ id: String(e.id), title: String(e.name || e.title || 'Event'), startsAt: eventStartIso(e), location: e.location || null }));
      const now = Date.now();
      const serve = (oppRes.data || [])
        .filter((o: any) => !o.starts_at || new Date(o.starts_at).getTime() > now - 12 * 3600_000)
        .slice(0, 25)
        .map((o: any) => ({ id: String(o.id), title: String(o.title || 'Serve'), roleLabel: o.role_label || null, startsAt: o.starts_at || null }));
      return res.status(200).json({ ok: true, events, serve });
    }

    if (chatType === 'cards') {
      if (method !== 'GET') return res.status(405).json({ ok: false, error: 'Use GET' });
      const ids = String(Array.isArray(req.query?.messageIds) ? req.query.messageIds[0] : req.query?.messageIds || '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => UUID_RE.test(s))
        .slice(0, MAX_LOOKUP);
      if (!ids.length) return res.status(200).json({ ok: true, cards: [] });
      const { data: rows, error } = await supabase.from('chat_message_cards').select('*').in('message_id', ids);
      if (error) {
        if (isMissingTable(error)) return res.status(200).json({ ok: true, cards: [] });
        throw error;
      }
      const allowed: any[] = [];
      const checked = new Map<string, boolean>();
      for (const r of rows || []) {
        const cid = String(r.channel_id);
        if (!checked.has(cid)) checked.set(cid, (await deps.resolveMessageChannelAccess(String(r.message_id))).ok);
        if (checked.get(cid)) allowed.push(r);
      }
      const eventIds = Array.from(new Set(allowed.filter((r) => r.kind === 'event').map((r) => String(r.ref_id))));
      const oppIds = Array.from(new Set(allowed.filter((r) => r.kind === 'serve').map((r) => String(r.ref_id))));

      const events = new Map<string, any>();
      if (eventIds.length) {
        const { data } = await supabase.from('events').select('*').in('id', eventIds);
        for (const e of data || []) if (normalizeEventStatus(e.status) === 'approved') events.set(String(e.id), e);
      }
      const goingCounts = new Map<string, number>();
      const myGoing = new Set<string>();
      if (events.size) {
        const keys = Array.from(events.keys()).map((id) => `event:${id}`);
        const { data: plans, error: planErr } = await supabase.from('attendance_plans').select('user_id, plan_key').in('plan_key', keys);
        if (!planErr) {
          for (const p of plans || []) {
            const id = String(p.plan_key).slice(6);
            goingCounts.set(id, (goingCounts.get(id) || 0) + 1);
            if (String(p.user_id) === userId) myGoing.add(id);
          }
        }
      }

      const opps = new Map<string, any>();
      const taken = new Map<string, number>();
      const mine = new Map<string, string>();
      if (oppIds.length) {
        const { data } = await supabase.from('serve_opportunities').select('*').in('id', oppIds);
        for (const o of data || []) opps.set(String(o.id), o);
        const { data: signups } = await supabase
          .from('serve_signups')
          .select('opportunity_id, user_id, status')
          .in('opportunity_id', oppIds)
          .in('status', ACTIVE_SIGNUP);
        for (const s of signups || []) {
          const id = String(s.opportunity_id);
          taken.set(id, (taken.get(id) || 0) + 1);
          if (String(s.user_id) === userId) mine.set(id, String(s.status));
        }
      }

      const cards = allowed
        .map((r) => {
          const ref = String(r.ref_id);
          if (r.kind === 'event') {
            const ev = events.get(ref);
            if (!ev) return { messageId: String(r.message_id), kind: 'event', missing: true };
            return { messageId: String(r.message_id), kind: 'event', event: eventCardDto(ev, myGoing.has(ref), goingCounts.get(ref) || 0) };
          }
          const opp = opps.get(ref);
          if (!opp) return { messageId: String(r.message_id), kind: 'serve', missing: true };
          return { messageId: String(r.message_id), kind: 'serve', serve: serveCardDto(opp, taken.get(ref) || 0, mine.get(ref) || null) };
        });
      return res.status(200).json({ ok: true, cards });
    }

    if (method !== 'POST') return res.status(405).json({ ok: false, error: 'Use POST' });

    if (chatType === 'card-create') {
      const input = parseCardInput(req.body);
      if (input.ok === false) return res.status(400).json({ ok: false, error: input.error });
      const gate = await deps.resolveMessageChannelAccess(input.messageId);
      if (gate.ok === false) return res.status(gate.status).json({ ok: false, error: gate.error });
      if (String(gate.message.user_id) !== userId) {
        return res.status(403).json({ ok: false, error: 'Only the person who sent the message can add a card to it.' });
      }
      if (gate.message.deleted_at) return res.status(400).json({ ok: false, error: 'That message was removed.' });
      const age = Date.now() - new Date(gate.message.created_at).getTime();
      if (!Number.isFinite(age) || age > ATTACH_WINDOW_MS) return res.status(400).json({ ok: false, error: 'Please share it again.' });
      if (input.kind === 'event') {
        if (!(await loadEvent(supabase, input.refId))) return res.status(404).json({ ok: false, error: 'That event was not found.' });
      } else {
        const { data: opp } = await supabase.from('serve_opportunities').select('id, status').eq('id', input.refId).maybeSingle();
        if (!opp || opp.status !== 'open') return res.status(404).json({ ok: false, error: 'That Serve need is not open.' });
      }
      const { error } = await supabase.from('chat_message_cards').insert({
        message_id: input.messageId,
        channel_id: gate.channel.id,
        created_by: userId,
        kind: input.kind,
        ref_id: input.refId,
      });
      if (error) {
        if (isMissingTable(error)) return res.status(503).json(NOT_READY);
        if (String(error.code) === '23505') return res.status(409).json({ ok: false, error: 'That message already has a card.' });
        throw error;
      }
      deps.broadcast(String(gate.channel.id), input.messageId);
      return res.status(200).json({ ok: true });
    }

    if (chatType === 'card-going') {
      const eventId = String(req.body?.eventId || '').trim();
      const going = req.body?.going === true;
      const messageId = String(req.body?.messageId || '').trim();
      if (!UUID_RE.test(eventId)) return res.status(400).json({ ok: false, error: 'eventId is required' });
      const ev = await loadEvent(supabase, eventId);
      if (!ev) return res.status(404).json({ ok: false, error: 'That event was not found.' });
      const planKey = `event:${eventId}`;
      if (going) {
        const { error } = await supabase.from('attendance_plans').upsert(
          {
            user_id: userId,
            plan_key: planKey,
            event_id: eventId,
            service_date: eventServiceDate(ev),
            title: String(ev.name || ev.title || '').slice(0, 200) || null,
          },
          { onConflict: 'user_id,plan_key' }
        );
        if (error) {
          if (isMissingTable(error)) return res.status(503).json({ ok: false, code: 'needs_setup', error: '"I’ll be there" is not set up yet.' });
          throw error;
        }
      } else {
        const { error } = await supabase.from('attendance_plans').delete().eq('user_id', userId).eq('plan_key', planKey);
        if (error && !isMissingTable(error)) throw error;
      }
      if (UUID_RE.test(messageId)) {
        const gate = await deps.resolveMessageChannelAccess(messageId);
        if (gate.ok) deps.broadcast(String(gate.channel.id), messageId);
      }
      const { count } = await supabase.from('attendance_plans').select('id', { count: 'exact', head: true }).eq('plan_key', planKey);
      return res.status(200).json({ ok: true, going, goingCount: count || 0 });
    }

    return res.status(404).json({ ok: false, error: 'Unknown card request' });
  } catch (err: any) {
    console.error('[chat cards]', err?.message || err);
    return res.status(500).json({ ok: false, error: 'That is not available right now. Please try again.' });
  }
}
