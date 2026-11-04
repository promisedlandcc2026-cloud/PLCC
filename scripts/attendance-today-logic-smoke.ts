/**
 * Attendance today pure helpers smoke.
 * Run: npx tsx scripts/attendance-today-logic-smoke.ts
 */
import {
  churchDayBoundsUtc,
  isKidsTodayRow,
  paginateTodayRows,
  parseTodayQuery,
  toTodayRowDto,
} from '../api/_utils/attendanceTodayLogic.js';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  OK: ${msg}`);
}

console.log('\nAttendance today logic smoke');

const { dayStart, dayEnd, ymd } = churchDayBoundsUtc(
  new Date('2026-09-16T15:00:00.000Z'),
  'Africa/Kampala'
);
assert(/^\d{4}-\d{2}-\d{2}$/.test(ymd), 'ymd format');
assert(Date.parse(dayEnd) - Date.parse(dayStart) === 24 * 60 * 60 * 1000, '24h window');

const kids = new Set(['child-1']);
assert(
  isKidsTodayRow({ sessionType: 'kids', memberId: 'adult-1', childMemberIds: kids }) === true,
  'kids session matches'
);
assert(
  isKidsTodayRow({ sessionType: 'worship', memberId: 'child-1', childMemberIds: kids }) === true,
  'child member matches'
);
assert(
  isKidsTodayRow({ sessionType: 'worship', memberId: 'adult-1', childMemberIds: kids }) === false,
  'adult on worship excluded from kids filter'
);

const parsed = parseTodayQuery({ kids: 'true', limit: '10', offset: '5' });
assert(parsed.ok === true, 'parse query ok');
if (parsed.ok) {
  assert(parsed.kidsOnly === true, 'kidsOnly');
  assert(parsed.limit === 10, 'limit');
  assert(parsed.offset === 5, 'offset');
}

const dto = toTodayRowDto({
  id: 'r1',
  checkedInAt: '2026-09-16T15:00:00.000Z',
  source: 'digital_card',
  memberId: 'm1',
  member: { first_name: 'Bithiah', last_name: 'Mahabir' },
  session: { id: 's1', title: 'Wednesday', type: 'worship' },
});
assert(dto.memberName === 'Bithiah Mahabir', 'member name');
assert(dto.source === 'digital_card', 'source');
assert(dto.sessionTitle === 'Wednesday', 'session title');

const { page, totalCount } = paginateTodayRows([1, 2, 3, 4, 5], 2, 2);
assert(JSON.stringify(page) === JSON.stringify([3, 4]), 'page slice');
assert(totalCount === 5, 'totalCount');

console.log('\nAll attendance today logic smoke tests passed.');
