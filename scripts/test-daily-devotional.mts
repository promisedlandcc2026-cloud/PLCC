/**
 * Daily devotional: starter rotation, week math, staff form checks, 7 AM timing.
 * Run: npx tsx scripts/test-daily-devotional.mts
 */
import assert from 'node:assert/strict';

const s = await import('../api/_utils/dailyStarter.ts');
const d = await import('../api/_utils/dailyHandler.ts');
const p = await import('../api/_utils/pushAlerts.ts');

let failed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`OK  ${name}`);
  } catch (e: any) {
    failed++;
    console.error(`FAIL ${name}`, e?.message || e);
  }
}

await check('starter set is complete and every entry has the parts Daily shows', () => {
  assert.equal(s.STARTER_WEEKDAY.length, 26);
  assert.equal(s.STARTER_SUNDAY.length, 4);
  for (const x of [...s.STARTER_WEEKDAY, ...s.STARTER_SUNDAY]) {
    assert.ok(x.title && x.ref && x.question && x.prayer, x.title);
    assert.ok(x.body.split('\n\n').length === 2, `${x.title}: two paragraphs`);
    assert.match(x.ref, /^[1-3]?\s?[A-Z][a-z]+ \d+:\d+(-\d+)?$/, x.ref);
  }
});

await check('Sundays use a worship devotional; weekdays never repeat within 26 weekdays', () => {
  assert.ok(s.STARTER_SUNDAY.includes(s.starterFor('2026-10-25')), 'Oct 25 2026 is a Sunday');
  const seen: string[] = [];
  let day = '2026-10-26';
  while (seen.length < 26) {
    const dow = new Date(day + 'T12:00:00Z').getUTCDay();
    if (dow !== 0) seen.push(s.starterFor(day).title);
    day = d.addDays(day, 1);
  }
  assert.equal(new Set(seen).size, 26, 'all 26 different');
  assert.equal(s.starterFor('2026-10-24').title, s.starterFor('2026-10-24').title, 'stable');
});

await check('weeks run Monday to Sunday, across month and year ends', () => {
  assert.equal(d.mondayOf('2026-10-24'), '2026-10-19');
  assert.equal(d.mondayOf('2026-10-25'), '2026-10-19', 'Sunday belongs to the week before');
  assert.equal(d.mondayOf('2026-10-26'), '2026-10-26');
  assert.equal(d.mondayOf('2027-01-01'), '2026-12-28');
  assert.equal(d.addDays('2026-12-31', 1), '2027-01-01');
});

await check('dates are checked', () => {
  assert.equal(d.validDay('2026-10-24'), '2026-10-24');
  assert.equal(d.validDay('2026-02-30'), null);
  assert.equal(d.validDay('10/24/2026'), null);
  assert.equal(d.validDay(''), null);
});

await check('church time decides the day and the 7 AM hour (summer and winter)', () => {
  assert.deepEqual(d.churchToday(new Date('2026-10-24T11:05:00Z')), { day: '2026-10-24', hour: 7 }, 'EDT');
  assert.deepEqual(d.churchToday(new Date('2026-12-02T12:05:00Z')), { day: '2026-12-02', hour: 7 }, 'EST');
  assert.equal(d.churchToday(new Date('2026-10-25T02:00:00Z')).day, '2026-10-24', 'late evening stays on the same church day');
});

await check('staff form: needs title, verse and reflection; trims and limits', () => {
  assert.equal(d.readDevotionalFields({ day: '2026-10-24', title: '', ref: 'Psalm 23:1', body: 'x'.repeat(30) }).ok, false);
  assert.equal(d.readDevotionalFields({ day: '2026-10-24', title: 'T', ref: '', body: 'x'.repeat(30) }).ok, false);
  assert.equal(d.readDevotionalFields({ day: '2026-10-24', title: 'T', ref: 'Psalm 23:1', body: 'short' }).ok, false);
  assert.equal(d.readDevotionalFields({ day: 'nope', title: 'T', ref: 'Psalm 23:1', body: 'x'.repeat(30) }).ok, false);
  const r = d.readDevotionalFields({ day: '2026-10-24', title: '  Rest  ', ref: 'Psalm 23:1-3', body: 'A reflection that is long enough.', question: '', seriesTitle: 'New Every Morning' });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.row.title, 'Rest');
    assert.equal(r.row.question, null);
    assert.equal(r.row.series_title, 'New Every Morning');
  }
});

await check('a week with no database falls back to the starter set for all 7 days', async () => {
  const { days } = await d.loadDays(null, '2026-10-19', 7);
  assert.equal(days.length, 7);
  assert.ok(days.every((x) => x.source === 'starter'));
  assert.equal(days[6].day, '2026-10-25');
});

await check('reminder only goes out at 7 AM church time', async () => {
  const r = await d.sendDailyReminder(new Date('2026-10-24T12:30:00Z')); // 8:30 AM EDT
  assert.equal(r.sent, 0);
  assert.match(String(r.skipped), /hour is 8/);
});

await check('morning reminder is opt-in: new phones do not get it by default', () => {
  assert.deepEqual(p.cleanTopics(undefined), ['church', 'prayer', 'community']);
  assert.deepEqual(p.cleanTopics(['church', 'daily']), ['church', 'daily']);
});

if (failed) {
  console.error(`\n${failed} daily devotional check(s) failed.`);
  process.exit(1);
}
console.log('\nDaily devotional checks passed.');
