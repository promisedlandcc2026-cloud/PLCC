import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import time from '../pages/pastorsOffice/ugandaTime.ts';
const { ugandaInstant, ugandaDate, ugandaPeriod, shiftUgandaDate } = time;
describe('Pastor’s Office Uganda time',()=>{
  it('converts appointment input to UTC independently of device time zone',()=>{
    assert.equal(ugandaInstant('2026-11-21T10:00'),'2026-11-21T07:00:00.000Z');
    assert.equal(ugandaInstant('2026-02-30T10:00'),null);
  });
  it('navigates periods across month and year boundaries',()=>{
    assert.equal(shiftUgandaDate('2027-01-31','month',1),'2027-02-28');
    assert.equal(shiftUgandaDate('2027-01-01','day',-1),'2026-12-31');
    assert.equal(shiftUgandaDate('2026-12-29','week',1),'2027-01-05');
  });
  it('uses Uganda dates at midnight and correct day, week and month boundaries',()=>{
    assert.equal(ugandaDate(new Date('2026-11-21T22:30:00Z')),'2026-11-22');
    assert.deepEqual(ugandaPeriod('2026-11-22','day').map(x=>new Date(x).toISOString()),['2026-11-21T21:00:00.000Z','2026-11-22T21:00:00.000Z']);
    assert.deepEqual(ugandaPeriod('2026-11-22','week').map(x=>new Date(x).toISOString()),['2026-11-21T21:00:00.000Z','2026-11-28T21:00:00.000Z']);
    assert.deepEqual(ugandaPeriod('2026-11-22','month').map(x=>new Date(x).toISOString()),['2026-10-31T21:00:00.000Z','2026-11-30T21:00:00.000Z']);
  });
});
