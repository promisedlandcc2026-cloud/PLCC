/** DM email fallback: who gets an email, and that it never carries the message text. */
import { dmEmailFor, emailableAddress, emailDmIfNoAlerts } from '../api/_utils/chatLive.js';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

type World = { subs: Record<string, number>; read: Record<string, string | null>; unread: Record<string, number>; emails: Record<string, string>; muted: string[] };

/** Tiny stand-in for the Supabase query builder: answers by table + filters. */
function fakeDb(w: World) {
  return {
    from(table: string) {
      const f: Record<string, any> = {};
      const q: any = {
        select: () => q, eq: (k: string, v: any) => ((f[k] = v), q), neq: () => q, is: () => q, contains: () => q,
        gt: (k: string, v: any) => ((f.gt = v), q),
        maybeSingle: async () => {
          if (table === 'chat_read_status') return { data: w.read[f.user_id] ? { last_read_at: w.read[f.user_id] } : null };
          if (table === 'users') return { data: { email: w.emails[f.id] } };
          return { data: null };
        },
        then: (res: any) => {
          if (table === 'push_subscriptions') return res({ count: w.subs[f.user_id] ?? 0, error: null });
          if (table === 'chat_messages') return res({ count: w.unread[f.channel_id === 'c1' ? 'c1' : 'x'] ?? 0, error: null });
          if (table === 'chat_room_mutes') return res({ data: w.muted.map((user_id) => ({ user_id, muted_until: null })), error: null });
          return res({ data: [], error: null });
        },
      };
      return q;
    },
  } as any;
}

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const dm = { id: 'c1', visibility: 'dm', type: 'dm', participants: [A, B] };

async function run(w: Partial<World>, channel: any = dm) {
  const sent: any[] = [];
  const world: World = { subs: {}, read: {}, unread: {}, emails: { [A]: 'grace@example.org', [B]: 'pastor@example.org' }, muted: [], ...w };
  const r = await emailDmIfNoAlerts(fakeDb(world), {
    channel, authorId: A, authorName: 'Grace N.', messageId: 'm1',
    send: async (m) => (sent.push(m), true),
  });
  return { r, sent };
}

(async () => {
  let x = await run({});
  assert(x.sent.length === 1 && x.sent[0].to === 'pastor@example.org', 'no phone alerts → the other person gets one email');
  assert(!x.sent.some((m) => m.to === 'grace@example.org'), 'author is never emailed');
  assert(x.sent[0].subject === 'Grace N. sent you a message', 'subject names the sender');

  x = await run({ subs: { [B]: 1 } });
  assert(x.sent.length === 0, 'phone alerts on → no email');

  x = await run({ unread: { c1: 2 } });
  assert(x.sent.length === 0, 'already has unread messages here → no second email');

  x = await run({ muted: [B] });
  assert(x.sent.length === 0, 'muted chat → no email');

  x = await run({ emails: { [B]: '256700000000@phone.awcvault.invalid' } });
  assert(x.sent.length === 0, 'phone-only account (placeholder address) → no email');

  x = await run({}, { id: 'c2', visibility: 'open', type: 'channel', participants: [A, B] });
  assert(x.sent.length === 0, 'group rooms never send email');

  const mail = dmEmailFor({ authorName: 'Grace <b>N.</b>', channelId: 'c1', origin: 'https://ka.example' });
  assert(mail.url === 'https://ka.example/community/chat/c1', 'button opens the conversation');
  assert(!mail.html.includes('<b>N.</b>') && mail.html.includes('&lt;b&gt;'), 'sender name is escaped');
  assert(emailableAddress('a@b.co') === 'a@b.co' && emailableAddress('x@phone.awcvault.invalid') === null && emailableAddress('nope') === null, 'address check');
  console.log('chat-dm-email-fallback-smoke: all passed');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
