/**
 * Text-code sign-in / sign-up (resource=auth-phone-code) against a fake
 * Supabase and fake Twilio Verify.
 * Run from Vault: node --import tsx --test scripts/test-auth-phone-code.mjs
 */
import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';

process.env.TWILIO_ACCOUNT_SID = 'ACtest';
process.env.TWILIO_AUTH_TOKEN = 'tok';
process.env.TWILIO_VERIFY_SERVICE_SID = 'VAtest';
process.env.AUTH_SMS_PHONE_PER_HOUR = '3';
process.env.AUTH_SMS_DAILY_CAP = '5';

const { handleAuthPhoneCode, phoneHash } = await import('../api/_utils/authPhoneCode.ts');
const { normalizeUsPhone } = await import('../api/_utils/twilioVerify.ts');

/** Tiny in-memory stand-in for the supabase-js query builder (only what the handler uses). */
function fakeAdmin(db, authUsers) {
  function builder(table) {
    const filters = [];
    let op = 'select';
    let payload = null;
    let countMode = false;
    let headOnly = false;
    const q = {
      select(_cols, opts) {
        if (op !== 'update' && op !== 'insert') op = 'select';
        countMode = Boolean(opts?.count);
        headOnly = Boolean(opts?.head);
        return q;
      },
      eq(col, val) { filters.push((r) => r[col] === val); return q; },
      gte(col, val) { filters.push((r) => r[col] >= val); return q; },
      in(col, vals) { filters.push((r) => vals.includes(r[col])); return q; },
      limit() { return q; },
      insert(row) { op = 'insert'; payload = row; return q; },
      update(row) { op = 'update'; payload = row; return q; },
      then(resolve, reject) {
        try {
          const rows = (db[table] ||= []);
          if (op === 'insert') {
            if (table === 'users' && payload.verified_phone && rows.some((r) => r.verified_phone === payload.verified_phone)) {
              return resolve({ error: { message: 'duplicate verified_phone' } });
            }
            rows.push({ ...payload });
            return resolve({ error: null, data: null });
          }
          const matched = rows.filter((r) => filters.every((f) => f(r)));
          if (op === 'update') {
            matched.forEach((r) => Object.assign(r, payload));
            return resolve({ error: null });
          }
          if (countMode) return resolve({ error: null, count: matched.length, data: headOnly ? null : matched });
          return resolve({ error: null, data: matched.map((r) => ({ ...r })) });
        } catch (e) { reject(e); }
      },
    };
    return q;
  }
  return {
    from: (t) => builder(t),
    auth: {
      admin: {
        async createUser({ email, user_metadata }) {
          if (authUsers.some((u) => u.email === email)) return { data: null, error: { message: 'User already registered' } };
          const user = { id: `00000000-0000-4000-8000-${String(authUsers.length + 1).padStart(12, '0')}`, email, user_metadata };
          authUsers.push(user);
          return { data: { user }, error: null };
        },
      },
    },
  };
}

function res() {
  const out = { statusCode: 200, body: null, headers: {} };
  out.status = (c) => { out.statusCode = c; return out; };
  out.json = (b) => { out.body = b; return out; };
  out.setHeader = (k, v) => { out.headers[k] = v; };
  return out;
}

describe('text-code sign-in and sign-up', () => {
  let db, authUsers, sent, pending, deps, sessions;
  const PHONE = '+15085551234';

  beforeEach(() => {
    authUsers = [
      { id: 'u-email', email: 'member@example.com' },
      { id: 'u-phone', email: '15085559999@phone.awcvault.invalid' },
    ];
    db = {
      users: [
        { id: 'u-email', email: 'member@example.com', phone: '(508) 555-1234', verified_phone: null },
        { id: 'u-phone', email: '15085559999@phone.awcvault.invalid', phone: '+15085559999', verified_phone: null },
      ],
      auth_sms_sends: [],
    };
    sent = [];
    pending = new Set();
    sessions = [];
    let clock = Date.parse('2026-10-23T15:00:00Z');
    deps = {
      admin: fakeAdmin(db, authUsers),
      sendCode: async (p) => { sent.push(p); pending.add(p); },
      checkCode: async (p, code) => {
        if (!pending.has(p) || String(code) !== '123456') return false;
        pending.delete(p);
        return true;
      },
      authEmail: async (id) => authUsers.find((u) => u.id === id)?.email?.toLowerCase() || null,
      mintSession: async (email) => { sessions.push(email); return { access_token: `at-${email}`, refresh_token: 'rt' }; },
      now: () => (clock += 1000),
      currentUserId: async (req) => req.signedInAs || null,
    };
  });

  const call = async (body) => {
    const r = res();
    await handleAuthPhoneCode({ method: 'POST', body }, r, deps);
    return r;
  };

  const callAs = async (userId, body) => {
    const r = res();
    await handleAuthPhoneCode({ method: 'POST', body, signedInAs: userId }, r, deps);
    return r;
  };

  it('an email member turns on text sign-in once, then signs in by text', async () => {
    // Before: the profile phone alone never gets a code.
    await call({ action: 'request', purpose: 'signin', phone: PHONE });
    assert.deepEqual(sent, []);
    const notSignedIn = await call({ action: 'link-request', phone: PHONE });
    assert.equal(notSignedIn.statusCode, 401, 'turning it on needs a signed-in member');
    const req = await callAs('u-email', { action: 'link-request', phone: '508-555-1234' });
    assert.equal(req.statusCode, 200);
    assert.deepEqual(sent, [PHONE]);
    const bad = await callAs('u-email', { action: 'link-verify', phone: PHONE, code: '000000' });
    assert.equal(bad.statusCode, 401);
    const ok = await callAs('u-email', { action: 'link-verify', phone: PHONE, code: '123456' });
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.body.phone, '(•••) •••-1234');
    assert.equal(db.users.find((u) => u.id === 'u-email').verified_phone, PHONE);
    const status = await callAs('u-email', { action: 'link-status' });
    assert.equal(status.body.enabled, true);
    // Now "Text me a code" works for this member.
    await call({ action: 'request', purpose: 'signin', phone: PHONE });
    const signIn = await call({ action: 'verify', purpose: 'signin', phone: PHONE, code: '123456' });
    assert.equal(signIn.statusCode, 200);
    assert.deepEqual(sessions, ['member@example.com']);
  });

  it('a number that signs in to another account cannot be taken over', async () => {
    const r = await callAs('u-email', { action: 'link-request', phone: '508-555-9999' });
    assert.equal(r.statusCode, 409);
    assert.deepEqual(sent, []);
  });

  it('a member can turn text sign-in off', async () => {
    db.users[0].verified_phone = PHONE;
    const off = await callAs('u-email', { action: 'unlink' });
    assert.equal(off.statusCode, 200);
    assert.equal(db.users[0].verified_phone, null);
    await call({ action: 'request', purpose: 'signin', phone: PHONE });
    assert.deepEqual(sent, []);
  });

  it('normalizes only ordinary US numbers', () => {
    assert.equal(normalizeUsPhone('(508) 555-1234'), PHONE);
    assert.equal(normalizeUsPhone('1 508 555 1234'), PHONE);
    assert.equal(normalizeUsPhone('855-297-1920'), null);
    assert.equal(normalizeUsPhone('+44 7911 123456'), null);
    assert.equal(normalizeUsPhone('900-555-1234'), null);
  });

  it('never trusts the editable profile phone: no text, same answer', async () => {
    const r = await call({ action: 'request', purpose: 'signin', phone: '508-555-1234' });
    assert.equal(r.statusCode, 200);
    assert.equal(r.body.ok, true);
    assert.deepEqual(sent, []);
    assert.equal(db.auth_sms_sends.length, 0);
  });

  it('phone sign-up account signs in by text', async () => {
    const req = await call({ action: 'request', purpose: 'signin', phone: '508-555-9999' });
    assert.equal(req.statusCode, 200);
    assert.deepEqual(sent, ['+15085559999']);
    const bad = await call({ action: 'verify', purpose: 'signin', phone: '5085559999', code: '000000' });
    assert.equal(bad.statusCode, 401);
    const ok = await call({ action: 'verify', purpose: 'signin', phone: '5085559999', code: '123456' });
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.body.access_token, 'at-15085559999@phone.awcvault.invalid');
    assert.equal(db.users.find((u) => u.id === 'u-phone').verified_phone, '+15085559999');
    const replay = await call({ action: 'verify', purpose: 'signin', phone: '5085559999', code: '123456' });
    assert.equal(replay.statusCode, 401, 'a code works once');
  });

  it('a verified phone signs in to its account using the Auth email, not users.email', async () => {
    db.users[0].verified_phone = PHONE;
    db.users[0].email = 'attacker-chosen@example.com'; // editable profile field
    await call({ action: 'request', purpose: 'signin', phone: PHONE });
    const ok = await call({ action: 'verify', purpose: 'signin', phone: PHONE, code: '123456' });
    assert.equal(ok.statusCode, 200);
    assert.deepEqual(sessions, ['member@example.com']);
  });

  it('profile email set to a phone-signup address does not capture that number', async () => {
    db.users[0].email = '15085550000@phone.awcvault.invalid';
    const r = await call({ action: 'request', purpose: 'signin', phone: '5085550000' });
    assert.equal(r.statusCode, 200);
    assert.deepEqual(sent, [], 'Auth email does not match, so no account owns the number');
  });

  it('sign-up by text creates a Pending account and signs in', async () => {
    const req = await call({ action: 'request', purpose: 'signup', phone: '617-555-0199' });
    assert.equal(req.statusCode, 200);
    const noName = await call({ action: 'verify', purpose: 'signup', phone: '617-555-0199', code: '123456' });
    assert.equal(noName.statusCode, 400);
    await call({ action: 'request', purpose: 'signup', phone: '617-555-0199' });
    const ok = await call({ action: 'verify', purpose: 'signup', phone: '617-555-0199', code: '123456', first_name: 'Ruth', last_name: 'Ama' });
    assert.equal(ok.statusCode, 200);
    const user = db.users.find((u) => u.email === '16175550199@phone.awcvault.invalid');
    assert.ok(user);
    assert.equal(user.role, 'PENDING');
    assert.equal(user.verified_phone, '+16175550199');
    assert.equal(user.name, 'Ruth Ama');
    // Next time it is a sign-in
    const again = await call({ action: 'request', purpose: 'signup', phone: '617-555-0199' });
    assert.equal(again.statusCode, 409);
  });

  it('sign-up refuses a number another account already lists', async () => {
    const r = await call({ action: 'request', purpose: 'signup', phone: PHONE });
    assert.equal(r.statusCode, 409);
    assert.deepEqual(sent, []);
  });

  it('per-number hourly limit and church-wide daily cap', async () => {
    for (let i = 0; i < 4; i++) await call({ action: 'request', purpose: 'signin', phone: '5085559999' });
    assert.equal(sent.length, 3, 'fourth text in an hour is held back');
    assert.equal(db.auth_sms_sends.every((r) => r.phone_hash === phoneHash('+15085559999')), true);
    for (const n of ['6175550101', '6175550102', '6175550103']) {
      await call({ action: 'request', purpose: 'signup', phone: n });
    }
    assert.equal(sent.length, 5, 'daily cap of 5 reached');
    const capped = await call({ action: 'request', purpose: 'signup', phone: '6175550104' });
    assert.equal(capped.statusCode, 429);
  });

  it('refuses to send when the limits table is missing', async () => {
    deps.admin = fakeAdmin(db, authUsers);
    const orig = deps.admin.from;
    deps.admin.from = (t) => {
      const b = orig(t);
      if (t !== 'auth_sms_sends') return b;
      b.then = (resolve) => resolve({ error: { message: 'relation "auth_sms_sends" does not exist' } });
      return b;
    };
    const r = await call({ action: 'request', purpose: 'signin', phone: '5085559999' });
    assert.equal(r.statusCode, 503);
    assert.deepEqual(sent, []);
  });

  it('off without Twilio settings', async () => {
    const keep = process.env.TWILIO_VERIFY_SERVICE_SID;
    delete process.env.TWILIO_VERIFY_SERVICE_SID;
    const r = await call({ action: 'request', purpose: 'signin', phone: '5085559999' });
    process.env.TWILIO_VERIFY_SERVICE_SID = keep;
    assert.equal(r.statusCode, 503);
  });
});
