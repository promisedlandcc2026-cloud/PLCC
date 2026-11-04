/**
 * Adults' birthdays without a year (stored as 1904-MM-DD).
 * Run from Vault: node --import tsx --test scripts/test-birthday-no-year.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { toNoYearBirthday, splitMonthDay, splitYear, toBirthday } = await import('../components/BirthdayMonthDay.tsx');
const { ageFromBirthday, formatBirthdayLabel, isNoYearBirthday } = await import('../pages/churchProfile/lib/memberAge.ts');
const { ageFromBirthday: kidsAge } = await import('../api/_utils/kidsViewData.ts');

describe('birthday without a year', () => {
  it('month + day → 1904-MM-DD', () => {
    assert.equal(toNoYearBirthday(3, 7), '1904-03-07');
    assert.equal(toNoYearBirthday(2, 29), '1904-02-29', 'Feb 29 works (1904 is a leap year)');
    assert.equal(toNoYearBirthday(4, 31), '', 'no April 31');
    assert.equal(toNoYearBirthday(3, 0), '', 'needs a day');
    assert.equal(toNoYearBirthday(0, 7), '', 'needs a month');
  });
  it('reads month and day from any saved birthday', () => {
    assert.deepEqual(splitMonthDay('1985-11-02'), { month: 11, day: 2 });
    assert.deepEqual(splitMonthDay('1904-03-07'), { month: 3, day: 7 });
    assert.deepEqual(splitMonthDay(''), { month: 0, day: 0 });
  });
  it('never gives an age or shows the placeholder year', () => {
    assert.equal(isNoYearBirthday('1904-03-07'), true);
    assert.equal(ageFromBirthday('1904-03-07'), undefined);
    assert.equal(kidsAge('1904-03-07'), null);
    assert.equal(formatBirthdayLabel('1904-03-07'), 'March 7');
  });
  it("children's full birth dates still give an age", () => {
    const tenYearsAgo = `${new Date().getFullYear() - 10}-01-01`;
    assert.equal(ageFromBirthday(tenYearsAgo), 10);
    assert.equal(kidsAge(tenYearsAgo), 10);
    assert.match(formatBirthdayLabel(tenYearsAgo), /\d{4}$/);
  });

  it('optional birth year: saved only when the member adds one', () => {
    assert.equal(toBirthday(3, 7, 1985), '1985-03-07');
    assert.equal(toBirthday(3, 7, 0), '1904-03-07', 'switch off → no year');
    assert.equal(toBirthday(2, 29, 1985), '', 'no Feb 29 in 1985');
    assert.equal(toBirthday(2, 29, 1988), '1988-02-29');
    assert.equal(toBirthday(3, 7, 1800), '', 'too old');
    assert.equal(toBirthday(3, 7, new Date().getFullYear() + 1), '', 'future year');
    assert.equal(splitYear('1985-03-07'), 1985);
    assert.equal(splitYear('1904-03-07'), 0, 'no-year form reads as no year');
    assert.equal(splitYear(''), 0);
  });
  it('a real year gives an age and shows the year', () => {
    const y = new Date().getFullYear() - 40;
    assert.equal(ageFromBirthday(`${y}-01-01`), 40);
    assert.match(formatBirthdayLabel(`${y}-01-01`), new RegExp(String(y)));
  });
});
