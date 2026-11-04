/**
 * PLCC Chat polls — resource=community&subResource=poll-*  (see supabase/migrations/chat_polls.sql)
 *
 *   POST poll-create { messageId, question, options[], multi?, anonymous? }
 *        The poll rides on a chat message the author has just sent (so every posting
 *        rule — room access, "only leaders can post", mutes — already applied to it).
 *        Only that message's author, within 10 minutes of sending it.
 *   POST poll-vote   { pollId, optionIds[] }   — replaces your votes; [] takes them back.
 *   POST poll-close  { pollId }                — the poll's author or a room leader.
 *   GET  polls       ?messageIds=a,b,c         — polls on those messages, with counts,
 *        your own votes, and voter names unless the poll is anonymous.
 */

export const POLL_MAX_OPTIONS = 10;
export const POLL_MIN_OPTIONS = 2;
export const POLL_QUESTION_MAX = 300;
export const POLL_OPTION_MAX = 100;
const ATTACH_WINDOW_MS = 10 * 60 * 1000;
const MAX_LOOKUP = 100;
const MAX_VOTER_NAMES = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PollOption = { id: string; text: string };

export type PollInput =
  | { ok: true; question: string; options: PollOption[]; multi: boolean; anonymous: boolean }
  | { ok: false; error: string };

/** Validate and normalise a new poll. Option ids are stable ("o1".."o10"). */
export function parsePollInput(body: any): PollInput {
  const question = String(body?.question ?? '').replace(/\s+/g, ' ').trim();
  if (!question) return { ok: false, error: 'Please type a question.' };
  if (question.length > POLL_QUESTION_MAX) return { ok: false, error: 'That question is too long.' };
  const raw = Array.isArray(body?.options) ? body.options : [];
  const seen = new Set<string>();
  const options: PollOption[] = [];
  for (const o of raw) {
    const text = String(typeof o === 'string' ? o : o?.text ?? '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (text.length > POLL_OPTION_MAX) return { ok: false, error: 'One of the choices is too long.' };
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({ id: `o${options.length + 1}`, text });
  }
  if (options.length < POLL_MIN_OPTIONS) return { ok: false, error: 'Add at least two choices.' };
  if (options.length > POLL_MAX_OPTIONS) return { ok: false, error: `Up to ${POLL_MAX_OPTIONS} choices.` };
  return { ok: true, question, options, multi: body?.multi === true, anonymous: body?.anonymous === true };
}

/** Which of the requested option ids are valid for this poll. */
export function parseVoteChoice(
  optionIds: unknown,
  poll: { options: PollOption[]; multi: boolean }
): { ok: true; ids: string[] } | { ok: false; error: string } {
  const valid = new Set((poll.options || []).map((o) => o.id));
  const ids = Array.from(new Set((Array.isArray(optionIds) ? optionIds : []).map((x) => String(x))));
  if (ids.some((id) => !valid.has(id))) return { ok: false, error: 'That choice is not on this poll.' };
  if (!poll.multi && ids.length > 1) return { ok: false, error: 'Pick one choice.' };
  return { ok: true, ids };
}

/** Shape a poll for one viewer. */
export function summarizePoll(
  poll: any,
  votes: Array<{ user_id: string; option_id: string }>,
  viewerId: string,
  names: Map<string, string>
) {
  const options: PollOption[] = Array.isArray(poll.options) ? poll.options : [];
  const voters = new Set<string>();
  const counts: Record<string, number> = {};
  const who: Record<string, string[]> = {};
  for (const o of options) {
    counts[o.id] = 0;
    who[o.id] = [];
  }
  const mine: string[] = [];
  for (const v of votes) {
    if (!(v.option_id in counts)) continue;
    counts[v.option_id] += 1;
    voters.add(String(v.user_id));
    if (String(v.user_id) === viewerId) mine.push(v.option_id);
    if (!poll.anonymous && who[v.option_id].length < MAX_VOTER_NAMES) {
      who[v.option_id].push(names.get(String(v.user_id)) || 'Member');
    }
  }
  return {
    id: String(poll.id),
    messageId: String(poll.message_id),
    question: String(poll.question),
    multi: Boolean(poll.multi),
    anonymous: Boolean(poll.anonymous),
    closed: Boolean(poll.closed_at),
    isMine: String(poll.created_by) === viewerId,
    totalVoters: voters.size,
    myVotes: mine,
    options: options.map((o) => ({
      id: o.id,
      text: o.text,
      count: counts[o.id] || 0,
      voters: poll.anonymous ? [] : who[o.id] || [],
    })),
  };
}

function isMissingTable(err: any): boolean {
  const m = String(err?.message || '') + String(err?.code || '');
  return /chat_poll|42P01|PGRST205|does not exist|schema cache/i.test(m);
}

const NOT_READY = { ok: false, code: 'needs_setup', error: 'Polls are not set up yet. Run supabase/migrations/chat_polls.sql.' };

type Deps = {
  supabase: any;
  userId: string;
  resolveMessageChannelAccess: (messageId: string) => Promise<
    { ok: true; message: any; channel: any } | { ok: false; status: number; error: string }
  >;
  isRoomLeader: (channel: any) => Promise<boolean>;
  broadcast: (channelId: string, messageId: string) => void;
};

export async function handleChatPolls(chatType: string, req: any, res: any, deps: Deps) {
  const { supabase, userId } = deps;
  const method = String(req.method || 'GET').toUpperCase();

  try {
    if (chatType === 'polls') {
      if (method !== 'GET') return res.status(405).json({ ok: false, error: 'Use GET' });
      const ids = String(Array.isArray(req.query?.messageIds) ? req.query.messageIds[0] : req.query?.messageIds || '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => UUID_RE.test(s))
        .slice(0, MAX_LOOKUP);
      if (!ids.length) return res.status(200).json({ ok: true, polls: [] });
      const { data: polls, error } = await supabase.from('chat_polls').select('*').in('message_id', ids);
      if (error) {
        if (isMissingTable(error)) return res.status(200).json({ ok: true, polls: [] });
        throw error;
      }
      if (!polls?.length) return res.status(200).json({ ok: true, polls: [] });
      // Only polls in rooms this member can open.
      const allowed: any[] = [];
      const checked = new Map<string, boolean>();
      for (const p of polls) {
        const cid = String(p.channel_id);
        if (!checked.has(cid)) {
          const gate = await deps.resolveMessageChannelAccess(String(p.message_id));
          checked.set(cid, gate.ok);
        }
        if (checked.get(cid)) allowed.push(p);
      }
      if (!allowed.length) return res.status(200).json({ ok: true, polls: [] });
      const { data: votes } = await supabase
        .from('chat_poll_votes')
        .select('poll_id, user_id, option_id')
        .in('poll_id', allowed.map((p) => p.id));
      const voterIds = Array.from(new Set((votes || []).map((v: any) => String(v.user_id))));
      const names = new Map<string, string>();
      if (voterIds.length && allowed.some((p) => !p.anonymous)) {
        const { data: users } = await supabase.from('users').select('id, name').in('id', voterIds.slice(0, 500));
        for (const u of users || []) names.set(String(u.id), String(u.name || 'Member'));
      }
      return res.status(200).json({
        ok: true,
        polls: allowed.map((p) =>
          summarizePoll(p, (votes || []).filter((v: any) => String(v.poll_id) === String(p.id)), userId, names)
        ),
      });
    }

    if (method !== 'POST') return res.status(405).json({ ok: false, error: 'Use POST' });

    if (chatType === 'poll-create') {
      const messageId = String(req.body?.messageId || '').trim();
      if (!UUID_RE.test(messageId)) return res.status(400).json({ ok: false, error: 'messageId is required' });
      const input = parsePollInput(req.body);
      if (input.ok === false) return res.status(400).json({ ok: false, error: input.error });
      const gate = await deps.resolveMessageChannelAccess(messageId);
      if (gate.ok === false) return res.status(gate.status).json({ ok: false, error: gate.error });
      if (String(gate.message.user_id) !== userId) {
        return res.status(403).json({ ok: false, error: 'Only the person who sent the message can add a poll to it.' });
      }
      if (gate.message.deleted_at) return res.status(400).json({ ok: false, error: 'That message was removed.' });
      const age = Date.now() - new Date(gate.message.created_at).getTime();
      if (!Number.isFinite(age) || age > ATTACH_WINDOW_MS) {
        return res.status(400).json({ ok: false, error: 'Please start the poll again.' });
      }
      const { data, error } = await supabase
        .from('chat_polls')
        .insert({
          message_id: messageId,
          channel_id: gate.channel.id,
          created_by: userId,
          question: input.question,
          options: input.options,
          multi: input.multi,
          anonymous: input.anonymous,
        })
        .select()
        .single();
      if (error) {
        if (isMissingTable(error)) return res.status(503).json(NOT_READY);
        if (String(error.code) === '23505') return res.status(409).json({ ok: false, error: 'That message already has a poll.' });
        throw error;
      }
      deps.broadcast(String(gate.channel.id), messageId);
      return res.status(200).json({ ok: true, poll: summarizePoll(data, [], userId, new Map()) });
    }

    // vote / close: load the poll, then check the room through its message.
    const pollId = String(req.body?.pollId || '').trim();
    if (!UUID_RE.test(pollId)) return res.status(400).json({ ok: false, error: 'pollId is required' });
    const { data: poll, error: pollErr } = await supabase.from('chat_polls').select('*').eq('id', pollId).maybeSingle();
    if (pollErr) {
      if (isMissingTable(pollErr)) return res.status(503).json(NOT_READY);
      throw pollErr;
    }
    if (!poll) return res.status(404).json({ ok: false, error: 'Poll not found' });
    const gate = await deps.resolveMessageChannelAccess(String(poll.message_id));
    if (gate.ok === false) return res.status(gate.status).json({ ok: false, error: gate.error });

    if (chatType === 'poll-vote') {
      if (poll.closed_at) return res.status(400).json({ ok: false, error: 'This poll is closed.' });
      if (gate.message.deleted_at) return res.status(400).json({ ok: false, error: 'That poll was removed.' });
      const choice = parseVoteChoice(req.body?.optionIds, poll);
      if (choice.ok === false) return res.status(400).json({ ok: false, error: choice.error });
      const { error: delErr } = await supabase.from('chat_poll_votes').delete().eq('poll_id', pollId).eq('user_id', userId);
      if (delErr) throw delErr;
      if (choice.ids.length) {
        const { error: insErr } = await supabase
          .from('chat_poll_votes')
          .insert(choice.ids.map((option_id) => ({ poll_id: pollId, user_id: userId, option_id })));
        if (insErr) throw insErr;
      }
      deps.broadcast(String(gate.channel.id), String(poll.message_id));
      return res.status(200).json({ ok: true, myVotes: choice.ids });
    }

    if (chatType === 'poll-close') {
      const mayClose = String(poll.created_by) === userId || (await deps.isRoomLeader(gate.channel));
      if (!mayClose) return res.status(403).json({ ok: false, error: 'Only the person who made the poll or a room leader can close it.' });
      if (!poll.closed_at) {
        const { error } = await supabase.from('chat_polls').update({ closed_at: new Date().toISOString() }).eq('id', pollId);
        if (error) throw error;
      }
      deps.broadcast(String(gate.channel.id), String(poll.message_id));
      return res.status(200).json({ ok: true, closed: true });
    }

    return res.status(404).json({ ok: false, error: 'Unknown poll request' });
  } catch (err: any) {
    console.error('[chat polls]', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Polls are not available right now. Please try again.' });
  }
}
