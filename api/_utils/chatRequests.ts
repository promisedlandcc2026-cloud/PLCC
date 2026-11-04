/**
 * PLCC Chat — help requests with tracking and assignments  (see supabase/migrations/chat_requests.sql)
 * resource=community&subResource=request*
 *
 *   POST request-create { messageId, category, details }
 *        Rides on a chat message the author just sent (posting rules already applied).
 *   GET  requests ?messageIds=a,b        — requests on those messages
 *   GET  requests ?channelId=…&scope=open|all — the room's requests (newest first)
 *   POST request-update { requestId, action, assigneeId?, note? }
 *        volunteer  — anyone in the room: "I can help" (only while nobody is helping)
 *        assign     — room leader: give it to someone who can open the room
 *        unassign   — room leader or the helper: back to "needs a helper"
 *        done       — the helper, the person who asked, or a room leader
 *        reopen     — the person who asked or a room leader
 *        cancel     — the person who asked or a room leader
 *        note       — the person who asked, the helper or a room leader: add an update
 * Every change is kept in chat_request_updates (the tracking timeline) and the
 * people involved get an alert in their notifications.
 */

export const REQUEST_CATEGORIES = ['ride', 'visit', 'meal', 'errand', 'other'] as const;
export type RequestCategory = (typeof REQUEST_CATEGORIES)[number];
export type RequestStatus = 'new' | 'assigned' | 'done' | 'cancelled';
export type RequestAction = 'volunteer' | 'assign' | 'unassign' | 'done' | 'reopen' | 'cancel' | 'note';

export const CATEGORY_LABEL: Record<RequestCategory, string> = {
  ride: 'Ride',
  visit: 'Visit',
  meal: 'Meal',
  errand: 'Errand / help at home',
  other: 'Help',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ATTACH_WINDOW_MS = 10 * 60 * 1000;
const DETAILS_MAX = 1000;
const NOTE_MAX = 500;
const ACTIONS = new Set<RequestAction>(['volunteer', 'assign', 'unassign', 'done', 'reopen', 'cancel', 'note']);

export function parseRequestInput(body: any):
  | { ok: true; messageId: string; category: RequestCategory; details: string }
  | { ok: false; error: string } {
  const messageId = String(body?.messageId || '').trim();
  const category = String(body?.category || '').trim() as RequestCategory;
  const details = String(body?.details ?? '').trim();
  if (!UUID_RE.test(messageId)) return { ok: false, error: 'messageId is required' };
  if (!REQUEST_CATEGORIES.includes(category)) return { ok: false, error: 'Pick what kind of help you need.' };
  if (!details) return { ok: false, error: 'Please say a little about what you need.' };
  if (details.length > DETAILS_MAX) return { ok: false, error: 'That is too long.' };
  return { ok: true, messageId, category, details };
}

type Who = { userId: string; isLeader: boolean };
type Req = { status: RequestStatus; created_by: string; assignee_id: string | null };

/**
 * Who may do what. Returns the new status/assignee for the change, or why not.
 */
export function decideRequestAction(
  req: Req,
  action: RequestAction,
  who: Who,
  assigneeId?: string | null
): { ok: true; status: RequestStatus; assigneeId: string | null } | { ok: false; status: number; error: string } {
  const isAsker = String(req.created_by) === who.userId;
  const isHelper = Boolean(req.assignee_id) && String(req.assignee_id) === who.userId;
  const closed = req.status === 'done' || req.status === 'cancelled';
  const no = (error: string, status = 403) => ({ ok: false as const, status, error });
  switch (action) {
    case 'volunteer':
      if (closed) return no('This request is closed.', 400);
      if (isAsker) return no('This is your own request.', 400);
      if (req.assignee_id) return no(isHelper ? 'You are already helping.' : 'Someone is already helping with this.', 409);
      return { ok: true, status: 'assigned', assigneeId: who.userId };
    case 'assign':
      if (!who.isLeader) return no('Only room leaders can assign requests.');
      if (closed) return no('This request is closed.', 400);
      if (!assigneeId || !UUID_RE.test(assigneeId)) return no('Pick someone to help.', 400);
      return { ok: true, status: 'assigned', assigneeId };
    case 'unassign':
      if (!who.isLeader && !isHelper) return no('Only the helper or a room leader can do that.');
      if (closed) return no('This request is closed.', 400);
      return { ok: true, status: 'new', assigneeId: null };
    case 'done':
      if (!who.isLeader && !isHelper && !isAsker) return no('Only the helper, the person who asked or a room leader can mark it done.');
      if (closed) return no('This request is already closed.', 400);
      return { ok: true, status: 'done', assigneeId: req.assignee_id };
    case 'reopen':
      if (!who.isLeader && !isAsker) return no('Only the person who asked or a room leader can reopen it.');
      if (!closed) return no('This request is still open.', 400);
      return { ok: true, status: req.assignee_id ? 'assigned' : 'new', assigneeId: req.assignee_id };
    case 'cancel':
      if (!who.isLeader && !isAsker) return no('Only the person who asked or a room leader can cancel it.');
      if (closed) return no('This request is already closed.', 400);
      return { ok: true, status: 'cancelled', assigneeId: req.assignee_id };
    case 'note':
      if (!who.isLeader && !isAsker && !isHelper) return no('Only the people on this request can add updates.');
      return { ok: true, status: req.status, assigneeId: req.assignee_id };
  }
  return no('Unknown action', 400);
}

export function requestDto(
  r: any,
  names: Map<string, string>,
  updates: any[],
  who: Who
) {
  const isAsker = String(r.created_by) === who.userId;
  const isHelper = Boolean(r.assignee_id) && String(r.assignee_id) === who.userId;
  const open = r.status === 'new' || r.status === 'assigned';
  return {
    id: String(r.id),
    messageId: String(r.message_id),
    channelId: String(r.channel_id),
    category: r.category as RequestCategory,
    categoryLabel: CATEGORY_LABEL[r.category as RequestCategory] || 'Help',
    details: String(r.details || ''),
    status: r.status as RequestStatus,
    askedBy: { id: String(r.created_by), name: names.get(String(r.created_by)) || 'Member' },
    helper: r.assignee_id ? { id: String(r.assignee_id), name: names.get(String(r.assignee_id)) || 'Member' } : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at || r.created_at,
    doneAt: r.done_at || null,
    isMine: isAsker,
    isHelper,
    can: {
      volunteer: open && !r.assignee_id && !isAsker,
      assign: who.isLeader && open,
      unassign: open && Boolean(r.assignee_id) && (who.isLeader || isHelper),
      done: open && (who.isLeader || isHelper || isAsker),
      reopen: !open && (who.isLeader || isAsker),
      cancel: open && (who.isLeader || isAsker),
      note: who.isLeader || isAsker || isHelper,
    },
    history: updates
      .filter((u) => String(u.request_id) === String(r.id))
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .slice(-20)
      .map((u) => ({
        action: String(u.action),
        by: names.get(String(u.actor_id)) || 'Member',
        note: u.note ? String(u.note) : null,
        at: u.created_at,
        to: u.target_id ? names.get(String(u.target_id)) || 'Member' : null,
      })),
  };
}

function isMissingTable(err: any): boolean {
  const m = String(err?.message || '') + ' ' + String(err?.code || '');
  return /42P01|PGRST205|does not exist|schema cache/i.test(m);
}
const NOT_READY = { ok: false, code: 'needs_setup', error: 'Requests are not set up yet. Run supabase/migrations/chat_requests.sql.' };

type Deps = {
  supabase: any;
  userId: string;
  resolveMessageChannelAccess: (messageId: string) => Promise<
    { ok: true; message: any; channel: any } | { ok: false; status: number; error: string }
  >;
  fetchChannelForUser: (channelId: string) => Promise<{ ok: true; channel: any } | { ok: false; status: number; error: string }>;
  isRoomLeader: (channel: any) => Promise<boolean>;
  canUserOpen: (channel: any, userId: string) => Promise<boolean>;
  broadcast: (channelId: string, messageId: string) => void;
  notify: (userId: string, payload: { title: string; body: string; link: string; sourceId: string }) => Promise<void>;
};

async function namesFor(supabase: any, ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const list = Array.from(new Set(ids.filter((x) => x && UUID_RE.test(x))));
  if (!list.length) return names;
  const { data } = await supabase.from('users').select('id, name').in('id', list);
  for (const u of data || []) names.set(String(u.id), String(u.name || 'Member'));
  return names;
}

async function shape(deps: Deps, rows: any[], leaderByChannel: Map<string, boolean>) {
  if (!rows.length) return [];
  const { data: updates } = await deps.supabase
    .from('chat_request_updates')
    .select('*')
    .in('request_id', rows.map((r) => r.id));
  const ids: string[] = [];
  for (const r of rows) ids.push(String(r.created_by), String(r.assignee_id || ''));
  for (const u of updates || []) ids.push(String(u.actor_id), String(u.target_id || ''));
  const names = await namesFor(deps.supabase, ids);
  return rows.map((r) =>
    requestDto(r, names, updates || [], { userId: deps.userId, isLeader: leaderByChannel.get(String(r.channel_id)) === true })
  );
}

export async function handleChatRequests(chatType: string, req: any, res: any, deps: Deps) {
  const { supabase, userId } = deps;
  const method = String(req.method || 'GET').toUpperCase();
  const first = (v: unknown) => String(Array.isArray(v) ? v[0] : v ?? '').trim();
  try {
    if (chatType === 'requests') {
      if (method !== 'GET') return res.status(405).json({ ok: false, error: 'Use GET' });
      const channelId = first(req.query?.channelId);
      let rows: any[] = [];
      const leaderBy = new Map<string, boolean>();
      if (UUID_RE.test(channelId)) {
        const gate = await deps.fetchChannelForUser(channelId);
        if (gate.ok === false) return res.status(gate.status).json({ ok: false, error: gate.error });
        let qb = supabase.from('chat_requests').select('*').eq('channel_id', channelId);
        if (first(req.query?.scope) !== 'all') qb = qb.in('status', ['new', 'assigned']);
        const { data, error } = await qb.order('created_at', { ascending: false }).limit(50);
        if (error) {
          if (isMissingTable(error)) return res.status(200).json({ ok: true, requests: [] });
          throw error;
        }
        rows = data || [];
        leaderBy.set(channelId, await deps.isRoomLeader(gate.channel));
      } else {
        const ids = first(req.query?.messageIds)
          .split(',')
          .map((s) => s.trim())
          .filter((s) => UUID_RE.test(s))
          .slice(0, 100);
        if (!ids.length) return res.status(200).json({ ok: true, requests: [] });
        const { data, error } = await supabase.from('chat_requests').select('*').in('message_id', ids);
        if (error) {
          if (isMissingTable(error)) return res.status(200).json({ ok: true, requests: [] });
          throw error;
        }
        for (const r of data || []) {
          const cid = String(r.channel_id);
          if (!leaderBy.has(cid)) {
            const gate = await deps.resolveMessageChannelAccess(String(r.message_id));
            leaderBy.set(cid, gate.ok ? await deps.isRoomLeader(gate.channel) : false);
            if (!gate.ok) leaderBy.set(`${cid}:denied`, true);
          }
          if (!leaderBy.get(`${cid}:denied`)) rows.push(r);
        }
      }
      return res.status(200).json({ ok: true, requests: await shape(deps, rows, leaderBy) });
    }

    if (method !== 'POST') return res.status(405).json({ ok: false, error: 'Use POST' });

    if (chatType === 'request-create') {
      const input = parseRequestInput(req.body);
      if (input.ok === false) return res.status(400).json({ ok: false, error: input.error });
      const gate = await deps.resolveMessageChannelAccess(input.messageId);
      if (gate.ok === false) return res.status(gate.status).json({ ok: false, error: gate.error });
      if (String(gate.message.user_id) !== userId) {
        return res.status(403).json({ ok: false, error: 'Only the person who sent the message can add a request to it.' });
      }
      if (gate.message.deleted_at) return res.status(400).json({ ok: false, error: 'That message was removed.' });
      const age = Date.now() - new Date(gate.message.created_at).getTime();
      if (!Number.isFinite(age) || age > ATTACH_WINDOW_MS) return res.status(400).json({ ok: false, error: 'Please send the request again.' });
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('chat_requests')
        .insert({
          message_id: input.messageId,
          channel_id: gate.channel.id,
          created_by: userId,
          category: input.category,
          details: input.details,
          status: 'new',
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();
      if (error) {
        if (isMissingTable(error)) return res.status(503).json(NOT_READY);
        if (String(error.code) === '23505') return res.status(409).json({ ok: false, error: 'That message already has a request.' });
        throw error;
      }
      await supabase.from('chat_request_updates').insert({ request_id: data.id, actor_id: userId, action: 'created' });
      deps.broadcast(String(gate.channel.id), input.messageId);
      const leader = await deps.isRoomLeader(gate.channel);
      const [dto] = await shape(deps, [data], new Map([[String(gate.channel.id), leader]]));
      return res.status(200).json({ ok: true, request: dto });
    }

    if (chatType === 'request-update') {
      const requestId = String(req.body?.requestId || '').trim();
      const action = String(req.body?.action || '').trim() as RequestAction;
      const note = String(req.body?.note ?? '').trim().slice(0, NOTE_MAX);
      const assigneeIdRaw = String(req.body?.assigneeId || '').trim();
      if (!UUID_RE.test(requestId)) return res.status(400).json({ ok: false, error: 'requestId is required' });
      if (!ACTIONS.has(action)) return res.status(400).json({ ok: false, error: 'Unknown action' });
      if (action === 'note' && !note) return res.status(400).json({ ok: false, error: 'Please type an update.' });
      const { data: row, error: rowErr } = await supabase.from('chat_requests').select('*').eq('id', requestId).maybeSingle();
      if (rowErr) {
        if (isMissingTable(rowErr)) return res.status(503).json(NOT_READY);
        throw rowErr;
      }
      if (!row) return res.status(404).json({ ok: false, error: 'Request not found' });
      const gate = await deps.resolveMessageChannelAccess(String(row.message_id));
      if (gate.ok === false) return res.status(gate.status).json({ ok: false, error: gate.error });
      const isLeader = await deps.isRoomLeader(gate.channel);
      const decision = decideRequestAction(row, action, { userId, isLeader }, assigneeIdRaw || null);
      if (decision.ok === false) return res.status(decision.status).json({ ok: false, error: decision.error });
      if (action === 'assign' && !(await deps.canUserOpen(gate.channel, String(decision.assigneeId)))) {
        return res.status(400).json({ ok: false, error: 'That person is not in this chat.' });
      }

      const now = new Date().toISOString();
      if (action !== 'note') {
        // Only change it if nobody changed it first (two people tapping "I can help" at once).
        let upd = supabase
          .from('chat_requests')
          .update({
            status: decision.status,
            assignee_id: decision.assigneeId,
            updated_at: now,
            done_at: decision.status === 'done' ? now : null,
          })
          .eq('id', requestId)
          .eq('status', row.status);
        upd = row.assignee_id ? upd.eq('assignee_id', row.assignee_id) : upd.is('assignee_id', null);
        const { data: changed, error } = await upd.select();
        if (error) throw error;
        if (!changed || !changed.length) {
          return res.status(409).json({ ok: false, error: 'Someone just changed this request. Please look again.' });
        }
      } else {
        await supabase.from('chat_requests').update({ updated_at: now }).eq('id', requestId);
      }
      await supabase.from('chat_request_updates').insert({
        request_id: requestId,
        actor_id: userId,
        action,
        note: note || null,
        target_id: action === 'assign' ? decision.assigneeId : null,
      });

      // Alerts for the people involved (never the person who did it).
      const names = await namesFor(supabase, [userId]);
      const actor = names.get(userId) || 'Someone';
      const label = CATEGORY_LABEL[row.category as RequestCategory] || 'Help';
      const link = `/community/chat/${row.channel_id}`;
      const tell = async (to: string | null | undefined, title: string) => {
        if (to && String(to) !== userId) {
          await deps.notify(String(to), { title, body: String(row.details).slice(0, 140), link, sourceId: requestId });
        }
      };
      if (action === 'volunteer') await tell(row.created_by, `${actor} will help with your ${label.toLowerCase()} request`);
      if (action === 'assign') {
        await tell(decision.assigneeId, `${actor} asked you to help: ${label}`);
        await tell(row.created_by, `${actor} found a helper for your ${label.toLowerCase()} request`);
      }
      if (action === 'done') await tell(row.created_by, `Your ${label.toLowerCase()} request is marked done`);
      if (action === 'unassign') await tell(row.created_by, `Your ${label.toLowerCase()} request needs a new helper`);
      if (action === 'cancel') await tell(row.assignee_id, `The ${label.toLowerCase()} request you were helping with was cancelled`);
      if (action === 'note') {
        await tell(row.created_by, `${actor} added an update to your ${label.toLowerCase()} request`);
        await tell(row.assignee_id, `${actor} added an update to a request you're helping with`);
      }

      deps.broadcast(String(row.channel_id), String(row.message_id));
      const { data: fresh } = await supabase.from('chat_requests').select('*').eq('id', requestId).maybeSingle();
      const [dto] = await shape(deps, [fresh || row], new Map([[String(row.channel_id), isLeader]]));
      return res.status(200).json({ ok: true, request: dto });
    }

    return res.status(404).json({ ok: false, error: 'Unknown request' });
  } catch (err: any) {
    console.error('[chat requests]', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Requests are not available right now. Please try again.' });
  }
}
