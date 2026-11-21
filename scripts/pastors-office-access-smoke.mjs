import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import access from '../api/_utils/pastorsOffice/access.ts';
const { canAccessPastorsOffice } = access;
const assistant = { officeId: 'office-a', userId: 'assistant-a', role: 'PASTORS_ASSISTANT', revokedAt: null };
const pastor = { officeId: 'office-a', userId: 'pastor-a', role: 'PASTOR', revokedAt: null };
describe('Pastor’s Office assignment access', () => {
  it('allows the assigned assistant to view and coordinate that office calendar', () => {
    for (const action of ['calendar.view', 'calendar.coordinate']) assert.equal(canAccessPastorsOffice('assistant-a', 'office-a', action, [assistant]), true);
  });
  it('does not allow an assistant to read or write private notes', () => {
    for (const action of ['private_notes.read', 'private_notes.write']) assert.equal(canAccessPastorsOffice('assistant-a', 'office-a', action, [assistant]), false);
  });
  it('allows the assigned pastor to access their private notes', () => {
    assert.equal(canAccessPastorsOffice('pastor-a', 'office-a', 'private_notes.read', [pastor], 'pastor-a'), true);
    assert.equal(canAccessPastorsOffice('pastor-a', 'office-a', 'private_notes.write', [pastor], 'pastor-a'), true);
  });
  it('denies a pastor access to another person’s notes or an unknown note owner', () => {
    assert.equal(canAccessPastorsOffice('pastor-a', 'office-a', 'private_notes.read', [pastor], 'pastor-b'), false);
    assert.equal(canAccessPastorsOffice('pastor-a', 'office-a', 'private_notes.read', [pastor]), false);
  });
  it('denies another office, user, missing identity, and revoked assignment', () => {
    assert.equal(canAccessPastorsOffice('assistant-a', 'office-b', 'calendar.view', [assistant]), false);
    assert.equal(canAccessPastorsOffice('member-a', 'office-a', 'calendar.view', [assistant]), false);
    assert.equal(canAccessPastorsOffice(null, 'office-a', 'calendar.view', [assistant]), false);
    assert.equal(canAccessPastorsOffice('assistant-a', 'office-a', 'calendar.view', [{ ...assistant, revokedAt: '2026-01-01T00:00:00Z' }]), false);
  });
  it('fails closed for unrecognized roles and actions', () => {
    assert.equal(canAccessPastorsOffice('assistant-a', 'office-a', 'calendar.view', [{ ...assistant, role: 'ADMIN' }]), false);
    assert.equal(canAccessPastorsOffice('assistant-a', 'office-a', 'finance.read', [assistant]), false);
  });
});
