/**
 * Phone alerts (web push): which notifications alert, where taps open, sign-up
 * validation, and delivery bookkeeping (dead phones removed).
 * Run: npx tsx scripts/test-push-alerts.mts
 */
import assert from 'node:assert/strict';
import webpush from 'web-push';

const keys = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = keys.publicKey;
process.env.VAPID_PRIVATE_KEY = keys.privateKey;
process.env.VAPID_SUBJECT = 'mailto:test@example.com';

const m = await import('../api/_utils/pushAlerts.ts');

let failed = 0;
function check(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`OK  ${name}`))
    .catch((e) => {
      failed++;
      console.error(`FAIL ${name}`, e?.message || e);
    });
}

// Minimal Supabase stand-in for push_subscriptions.
type Row = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string; failure_count: number; topics: string[]; created_at: string };
function fakeSupabase(rows: Row[]) {
  return {
    rows,
    from() {
      const filters: Array<(r: Row) => boolean> = [];
      let mode: 'select' | 'delete' | 'update' = 'select';
      let patch: Partial<Row> = {};
      let range: [number, number] | null = null;
      const api: any = {
        select() { mode = mode === 'select' ? 'select' : mode; return api; },
        delete() { mode = 'delete'; return api; },
        update(p: Partial<Row>) { mode = 'update'; patch = p; return api; },
        in(col: keyof Row, vals: any[]) { filters.push((r) => vals.includes(r[col])); return api; },
        eq(col: keyof Row, val: any) { filters.push((r) => r[col] === val); return api; },
        contains(col: keyof Row, vals: string[]) { filters.push((r) => vals.every((v) => (r[col] as string[]).includes(v))); return api; },
        order() { return api; },
        range(a: number, b: number) { range = [a, b]; return api; },
        then(resolve: any) {
          const hit = rows.filter((r) => filters.every((f) => f(r)));
          if (mode === 'delete') for (const r of hit) rows.splice(rows.indexOf(r), 1);
          if (mode === 'update') for (const r of hit) Object.assign(r, patch);
          const data = range ? hit.slice(range[0], range[1] + 1) : hit;
          return Promise.resolve({ data: mode === 'select' ? data.map((r) => ({ ...r })) : null, error: null }).then(resolve);
        },
      };
      return api;
    },
  };
}

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const P256 = 'B' + 'A'.repeat(86);
const AUTH = 'abcdefghijklmnopqrstuv';
const row = (id: string, user: string, host: string, topics = ['church', 'prayer', 'community']): Row => ({
  id, user_id: user, endpoint: `https://${host}/x/${id}`, p256dh: P256, auth: AUTH, failure_count: 0, topics, created_at: id,
});

await check('member-facing notifications alert; staff work does not', () => {
  assert.equal(m.topicForNotification('announcement'), 'church');
  assert.equal(m.topicForNotification('prayer'), 'prayer');
  assert.equal(m.topicForNotification('community_mention'), 'community');
  assert.equal(m.topicForNotification('community_huddle_started'), 'community');
  assert.equal(m.topicForNotification('kids_bucks_award'), 'community');
  assert.equal(m.topicForNotification('assignment'), null);
  assert.equal(m.topicForNotification('event_approval'), null);
});

await check('taps open the right Connect page, never a raw Vault link', () => {
  assert.equal(m.connectUrlForNotification('announcement', '/dashboard'), '/?section=vault-news');
  assert.equal(m.connectUrlForNotification('announcement', '/communication/announcements'), '/');
  assert.equal(m.connectUrlForNotification('prayer', '/community/prayer-wall'), '/prayer');
  assert.equal(m.connectUrlForNotification('prayer', '/intercessors'), '/intercessors');
  assert.equal(m.connectUrlForNotification('community_dm', 'https://evil.example/x'), '/notifications');
});

await check('staff alert links: Connect path or https only', () => {
  assert.equal(m.cleanAlertUrl(''), '/');
  assert.equal(m.cleanAlertUrl('/events'), '/events');
  assert.equal(m.cleanAlertUrl('https://www.youtube.com/@awc/live'), 'https://www.youtube.com/@awc/live');
  assert.equal(m.cleanAlertUrl('//evil.example'), null);
  assert.equal(m.cleanAlertUrl('javascript:alert(1)'), null);
  assert.equal(m.cleanAlertUrl('http://insecure.example'), null);
});

await check('only real browser push services are accepted', () => {
  assert.ok(m.validEndpoint('https://fcm.googleapis.com/fcm/send/abc'));
  assert.ok(m.validEndpoint('https://web.push.apple.com/QGx'));
  assert.ok(m.validEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x'));
  assert.ok(m.validEndpoint('https://wns2-bl2p.notify.windows.com/w/?token=x'));
  assert.equal(m.validEndpoint('https://attacker.example/collect'), null);
  assert.equal(m.validEndpoint('http://fcm.googleapis.com/x'), null);
  assert.equal(m.validEndpoint('https://fcm.googleapis.com.evil.example/x'), null);
  assert.ok(m.parseSubscription({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: P256, auth: AUTH } }));
  assert.equal(m.parseSubscription({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'short', auth: AUTH } }), null);
});

await check('church alerts always stay on', () => {
  assert.deepEqual(m.cleanTopics(['prayer']), ['church', 'prayer']);
  assert.deepEqual(m.cleanTopics([]), ['church']);
  assert.deepEqual(m.cleanTopics(undefined), ['church', 'prayer', 'community']);
  assert.deepEqual(m.cleanTopics(['bogus', 'community']), ['church', 'community']);
});

await check('everyone with the topic gets it (except the author); gone phones are removed', async () => {
  const db = fakeSupabase([
    row('a', U1, 'fcm.googleapis.com'),
    row('b', U2, 'fcm.googleapis.com'),
    row('c', U2, 'web.push.apple.com', ['church']), // prayer off
    row('d', U2, 'fcm.googleapis.com'), // uninstalled → 410
  ]);
  const sent: string[] = [];
  m.__setPushSenderForTests(async (sub, payload) => {
    if (sub.endpoint.endsWith('/d')) throw Object.assign(new Error('gone'), { statusCode: 410 });
    sent.push(`${sub.endpoint.split('/').pop()}:${JSON.parse(payload).url}`);
  });
  const r = await m.pushForNotification(db as any, { everyoneExcept: U1 }, { type: 'prayer', title: 'New prayer request', link: '/community/prayer-wall' });
  assert.equal(r, undefined);
  assert.deepEqual(sent.sort(), ['b:/prayer']);
  assert.ok(!db.rows.some((x) => x.id === 'd'), 'gone phone removed');
});

await check('a person gets it on each of their phones; repeated failures drop a phone', async () => {
  const db = fakeSupabase([row('a', U1, 'fcm.googleapis.com'), row('b', U1, 'web.push.apple.com'), { ...row('z', U1, 'fcm.googleapis.com'), failure_count: 4 }]);
  const sent: string[] = [];
  m.__setPushSenderForTests(async (sub) => {
    if (sub.endpoint.endsWith('/z')) throw Object.assign(new Error('boom'), { statusCode: 500 });
    sent.push(sub.endpoint.split('/').pop()!);
  });
  const r = await m.pushToUsers(db as any, [U1], 'community', { title: 'Someone mentioned you' });
  assert.equal(r.sent, 2);
  assert.deepEqual(sent.sort(), ['a', 'b']);
  assert.ok(!db.rows.some((x) => x.id === 'z'), 'fifth failure removes it');
});

await check('no keys → nothing is sent', async () => {
  delete process.env.VAPID_PRIVATE_KEY;
  m.__resetPushConfigForTests();
  let called = false;
  m.__setPushSenderForTests(async () => { called = true; });
  const db = fakeSupabase([row('a', U1, 'fcm.googleapis.com')]);
  await m.pushToEveryone(db as any, 'church', { title: 'x' });
  assert.equal(called, false);
});

if (failed) {
  console.error(`\n${failed} phone alert check(s) failed.`);
  process.exit(1);
}
console.log('\nPhone alert checks passed.');
