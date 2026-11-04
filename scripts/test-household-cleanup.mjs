/**
 * Households list v2 — duplicate grouping and name tidy-up.
 * Run: node --import tsx --test scripts/test-household-cleanup.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as cleanup from '../lib/householdCleanup.ts';

const mod = cleanup.default && cleanup.default.tidyHouseholdName ? cleanup.default : cleanup;
const { householdKey, tidyHouseholdName, findDuplicateGroups, findNameFixes, householdCompleteness } = mod;

const hh = (id, name, memberCount, extra = {}) => ({
  id,
  name,
  memberCount,
  address: '',
  phone: '',
  headMemberId: '',
  createdAt: '2026-01-01T00:00:00Z',
  ...extra,
});

const LIVE = [
  hh('1', 'Baseka Family', 3),
  hh('2', 'Flavia Family', 3),
  hh('3', 'kasibante Family', 4, { address: '164 Lexington road Billerica ma' }),
  hh('4', 'Mahabir Family', 7, { address: '43 Chester Lane, Waltham, MA', phone: '(617) 642-0292' }),
  hh('5', 'MAHABIR Family', 1),
  hh('6', 'MuSOKE Family', 1),
  hh('7', 'Hiire', 0),
  hh('8', 'Hiire family', 1),
  hh('9', 'Hiire Family', 6),
  hh('10', 'My Family', 5),
  hh('11', 'of the cross Family', 1),
  hh('12', 'Ssenyonjo Family', 2),
  hh('13', 'Ssimbwa Family', 2),
  hh('14', 'The Njenga Family', 4),
  hh('15', 'Wanyana Family', 1),
];

describe('householdKey', () => {
  it('ignores "The", "Family"/"Household" and case', () => {
    assert.equal(householdKey('The Njenga Household'), 'njenga');
    assert.equal(householdKey('Hiire family'), 'hiire');
    assert.equal(householdKey('Hiire'), 'hiire');
  });
});

describe('tidyHouseholdName', () => {
  it('fixes all-lower, all-caps and scrambled case', () => {
    assert.equal(tidyHouseholdName('kasibante Family'), 'Kasibante Family');
    assert.equal(tidyHouseholdName('MAHABIR Family'), 'Mahabir Family');
    assert.equal(tidyHouseholdName('MuSOKE Family'), 'Musoke Family');
    assert.equal(tidyHouseholdName('of the cross Family'), 'Of the Cross Family');
  });
  it('leaves good names and real mixed case alone', () => {
    assert.equal(tidyHouseholdName('The Njenga Family'), 'The Njenga Family');
    assert.equal(tidyHouseholdName('McDonald Family'), 'McDonald Family');
    assert.equal(tidyHouseholdName("o'brien-smith family"), "O'Brien-Smith Family");
  });
});

describe('findDuplicateGroups', () => {
  it('finds the Hiire and Mahabir groups with the biggest household kept', () => {
    const groups = findDuplicateGroups(LIVE);
    assert.equal(groups.length, 2);
    assert.deepEqual(groups[0].map((h) => h.name), ['Hiire Family', 'Hiire family', 'Hiire']);
    assert.deepEqual(groups[1].map((h) => h.name), ['Mahabir Family', 'MAHABIR Family']);
  });
});

describe('findNameFixes', () => {
  it('suggests safe renames and skips ones that would clash', () => {
    const fixes = findNameFixes(LIVE);
    const map = Object.fromEntries(fixes.map((f) => [f.from, f.to]));
    assert.equal(map['kasibante Family'], 'Kasibante Family');
    assert.equal(map['MuSOKE Family'], 'Musoke Family');
    assert.equal(map['of the cross Family'], 'Of the Cross Family');
    assert.equal(map['MAHABIR Family'], undefined, 'would clash with Mahabir Family — merge instead');
    assert.equal(map['Hiire family'], undefined, 'would clash with Hiire Family');
  });
});

describe('householdCompleteness', () => {
  it('counts members, head, address and phone', () => {
    assert.equal(householdCompleteness(LIVE[3]), 3);
    assert.equal(householdCompleteness(LIVE[6]), 0);
    assert.equal(householdCompleteness({ ...LIVE[3], headMemberId: 'x' }), 4);
  });
});
