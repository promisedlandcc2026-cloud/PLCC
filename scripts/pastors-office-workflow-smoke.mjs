import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import module from '../api/_utils/pastorsOffice/workflow.ts';
const { nextRequestStatus, validateOfficeSlot, officeSlotsOverlap, OFFICE_NOTIFICATION } = module;
describe('Pastor’s Office workflow', () => {
  it('requires pastor approval for a proposed appointment', () => {
    assert.equal(nextRequestStatus('requested','propose','assistant'),'proposed');
    assert.equal(nextRequestStatus('proposed','request_approval','assistant'),'awaiting_approval');
    assert.equal(nextRequestStatus('awaiting_approval','approve','assistant'),null);
    assert.equal(nextRequestStatus('awaiting_approval','approve','pastor'),'confirmed');
  });
  it('blocks members from coordinating or completing requests', () => {
    for (const action of ['propose','approve','complete','mark_no_show']) assert.equal(nextRequestStatus('confirmed',action,'member'),null);
    assert.equal(nextRequestStatus('confirmed','cancel','member'),'cancelled');
  });
  it('rejects invalid transitions and unknown actions', () => {
    assert.equal(nextRequestStatus('cancelled','approve','pastor'),null);
    assert.equal(nextRequestStatus('confirmed','bogus','pastor'),null);
  });
  it('requires explicit time offsets, a valid zone and ordered short intervals', () => {
    assert.equal(validateOfficeSlot('2026-11-21T10:00:00+03:00','2026-11-21T11:00:00+03:00','Africa/Kampala'),true);
    assert.equal(validateOfficeSlot('2026-11-21T10:00','2026-11-21T11:00','Africa/Kampala'),false);
    assert.equal(validateOfficeSlot('2026-11-21T10:00Z','2026-11-21T09:00Z','Africa/Kampala'),false);
    assert.equal(validateOfficeSlot('2026-11-21T10:00Z','2026-11-21T11:00Z','Invalid/Zone'),false);
    assert.equal(validateOfficeSlot('2026-02-30T10:00Z','2026-03-02T11:00Z','Africa/Kampala'),false);
  });
  it('detects overlaps and permits adjacent slots', () => {
    assert.equal(officeSlotsOverlap(10,20,19,30),true);
    assert.equal(officeSlotsOverlap(10,20,20,30),false);
    assert.equal(officeSlotsOverlap(10,20,0,11),true);
  });
  it('uses generic notification copy', () => {
    assert.doesNotMatch(`${OFFICE_NOTIFICATION.title} ${OFFICE_NOTIFICATION.body}`,/counsel|baptism|patient|diagnos/i);
  });
});
