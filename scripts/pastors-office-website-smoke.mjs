// Website booking requests + staff alerts. Run: npx tsx scripts/pastors-office-website-smoke.mjs
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import module from '../api/_utils/pastorsOffice/website.ts';
const { handleWebsitePastoralRequests, parseWebsiteRequest, alertCopy, __resetWebsiteRateForTests } = module;

const office = '22222222-2222-4222-8222-222222222222';
const pastor = '44444444-4444-4444-8444-444444444444';
const actor = '11111111-1111-4111-8111-111111111111';
function res() { return { statusCode: 0, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.statusCode = n; return this; }, json(v) { this.body = v; return this; } }; }

function fakeAdmin({ offices = [{ id: office, pastor_user_id: pastor }], users = [], assignments = [] } = {}) {
  const inserts = {};
  const updates = [];
  function q(table) {
    const state = { table, filters: [] };
    const rows = () => (table === 'pastoral_offices' ? offices : table === 'users' ? users : table === 'pastoral_office_assignments' ? assignments : []);
    const api = {
      select() { return api; },
      eq(k, v) { state.filters.push([k, v]); return api; },
      ilike(k, v) { state.filters.push([k, String(v).toLowerCase()]); return api; },
      in() { return api; },
      is() { return api; },
      or() { return api; },
      order() { return api; },
      limit() { return api; },
      maybeSingle: async () => ({ data: rows().find((r) => state.filters.every(([k, v]) => r[k] === undefined || r[k] === v)) || null, error: null }),
      single: async () => ({ data: { id: '55555555-5555-4555-8555-555555555555' }, error: null }),
      insert(row) { (inserts[table] ||= []).push(row); return api; },
      update(row) { updates.push({ table, row }); return api; },
      then(resolve) { resolve({ data: rows(), error: null }); },
    };
    return api;
  }
  return { admin: { from: q }, inserts, updates };
}

const good = { fullName: 'Sarah Nakato', service: 'wedding', phone: '0772 123456', email: 'sarah@example.com', preferredStart: '2027-02-01T10:00:00+03:00', timeZone: 'Africa/Kampala', message: 'We would like to talk about our wedding.' };

describe('website request validation', () => {
  it('needs a name, a service, a phone and an email', () => {
    assert.equal(parseWebsiteRequest({ ...good, email: '' }).ok, false);
    assert.equal(parseWebsiteRequest({ ...good, phone: '' }).ok, false);
    assert.equal(parseWebsiteRequest({ ...good, fullName: 'S' }).ok, false);
    assert.equal(parseWebsiteRequest({ ...good, service: 'party' }).ok, false);
    assert.equal(parseWebsiteRequest({ ...good, phone: '', email: '' }).ok, false);
    assert.equal(parseWebsiteRequest({ ...good, email: 'not-an-email' }).ok, false);
  });
  it('stores Ugandan numbers as +256 and lower-cases emails', () => {
    const p = parseWebsiteRequest({ ...good, email: 'Sarah@Example.COM' });
    assert.equal(p.ok, true);
    assert.equal(p.value.phone, '+256772123456');
    assert.equal(p.value.email, 'sarah@example.com');
  });
  it('a preferred time is optional', () => {
    const p = parseWebsiteRequest({ ...good, preferredStart: '' });
    assert.equal(p.ok, true);
    assert.equal(p.value.preferredStart, null);
  });
});

describe('public website endpoint', () => {
  beforeEach(() => __resetWebsiteRateForTests());

  it('saves a visitor request without sign-in, to the only office, and alerts the pastor', async () => {
    const d = fakeAdmin();
    const r = res();
    await handleWebsitePastoralRequests({ method: 'POST', query: {}, headers: {}, body: good }, r, { admin: d.admin, verify: async () => ({ user: null }) });
    assert.equal(r.statusCode, 200);
    const row = d.inserts.pastoral_website_requests[0];
    assert.equal(row.office_id, office);
    assert.equal(row.full_name, 'Sarah Nakato');
    assert.equal(row.matched_user_id, null);
    // Canaan bell for the pastor, with no names or details in it.
    const bell = d.inserts.user_notifications[0];
    assert.equal(bell[0].user_id, pastor);
    assert.doesNotMatch(JSON.stringify(bell), /Sarah|wedding/i);
  });

  it('marks a request whose email matches a PLCC account as a member', async () => {
    const d = fakeAdmin({ users: [{ id: actor, email: 'sarah@example.com' }] });
    const r = res();
    await handleWebsitePastoralRequests({ method: 'POST', query: {}, headers: {}, body: { ...good, email: 'sarah@example.com' } }, r, { admin: d.admin, verify: async () => ({ user: null }) });
    assert.equal(r.statusCode, 200);
    assert.equal(d.inserts.pastoral_website_requests[0].matched_user_id, actor);
  });

  it('quietly drops bots that fill the hidden field', async () => {
    const d = fakeAdmin();
    const r = res();
    await handleWebsitePastoralRequests({ method: 'POST', query: {}, headers: {}, body: { ...good, website: 'http://spam' } }, r, { admin: d.admin, verify: async () => ({ user: null }) });
    assert.equal(r.statusCode, 200);
    assert.equal(d.inserts.pastoral_website_requests, undefined);
  });

  it('slows down floods from one address', async () => {
    const d = fakeAdmin();
    let last;
    for (let i = 0; i < 7; i++) {
      last = res();
      await handleWebsitePastoralRequests({ method: 'POST', query: {}, headers: { 'x-plcc-visitor-ip': '1.2.3.4' }, body: good }, last, { admin: d.admin, verify: async () => ({ user: null }) });
    }
    assert.equal(last.statusCode, 429);
  });

  it('staff list needs sign-in and office access', async () => {
    const d = fakeAdmin();
    const anon = res();
    await handleWebsitePastoralRequests({ method: 'GET', query: { scope: 'office', officeId: office }, headers: {} }, anon, { admin: d.admin, verify: async () => ({ user: null }) });
    assert.equal(anon.statusCode, 401);
    const stranger = res();
    await handleWebsitePastoralRequests({ method: 'GET', query: { scope: 'office', officeId: office }, headers: {} }, stranger, { admin: fakeAdmin({ offices: [] }).admin, verify: async () => ({ user: { id: actor }, role: 'MEMBER' }) });
    assert.equal(stranger.statusCode, 403);
  });
});

describe('alert text', () => {
  it('says where the request came from and nothing private', () => {
    assert.match(alertCopy({ source: 'website' }).body, /website/);
    assert.match(alertCopy({ source: 'member' }).body, /member/);
  });
});
