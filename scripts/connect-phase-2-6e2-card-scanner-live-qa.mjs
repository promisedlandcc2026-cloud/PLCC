/**
 * Phase 2.6E.2 — minimal live TEMP QA for scanner UI mapping (no commit).
 * Manual token resolve via production resolver + UI mapper.
 */
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
require('tsx/cjs');
const { mapResolverResponse, headlineForResult } = await import('../lib/cardScannerUi.ts');

function loadEnv(path) {
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#') || !t.includes('=')) continue;
      const i = t.indexOf('=');
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!(k in process.env) || !process.env[k]) process.env[k] = v;
    }
  } catch {
    /* optional */
  }
}

loadEnv(join(root, '.env.diagnostic.local'));
loadEnv(join(root, '.env.local'));

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.VITE_SUPABASE_ANON_KEY;
const PROD = process.env.VAULT_PROD_URL || 'https://plcc-vault.vercel.app';
const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
const MARKER = 'TEST — Phase 2.6E.2';
const created = { auth: [], users: [], members: [] };
const defects = [];

async function makeUser(label, role) {
  const email = `phase26e2.${label}.${Date.now()}@awc-vault.local`;
  const password = `Verify!${Date.now()}Aa1`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  created.auth.push(data.user.id);
  await admin.from('users').insert({
    id: data.user.id,
    email,
    name: `${MARKER} ${label}`,
    role,
    password_hash: await bcrypt.hash('x', 10),
    is_temporary_password: true,
  });
  created.users.push(data.user.id);
  const browser = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  await browser.auth.signInWithPassword({ email, password });
  const {
    data: { session },
  } = await browser.auth.getSession();
  return { uid: data.user.id, browser, token: session.access_token };
}

async function resolve(bearer, token) {
  const res = await fetch(`${PROD}/api/vault?resource=people&subResource=card-resolver`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
    body: JSON.stringify({ token }),
  });
  const body = await res.json();
  return { status: res.status, body, ui: mapResolverResponse(res.status, body) };
}

try {
  const staff = await makeUser('staff', 'PASTOR');
  const finance = await makeUser('finance', 'FINANCE');

  let r = await resolve(finance.token, `AWC1.${'a'.repeat(64)}`);
  if (r.status !== 403) defects.push(`finance deny ${r.status}`);
  else console.log('PASS finance deny');

  const adult = await makeUser('adult', 'MEMBER');
  const mint = await adult.browser.rpc('get_my_member_digital_card');
  const adultTok = mint.data.qrPayload;
  r = await resolve(staff.token, adultTok);
  if (r.ui.kind !== 'result' || !r.ui.result.valid || r.ui.result.subjectType !== 'adult') {
    defects.push(`adult ${JSON.stringify(r.ui)}`);
  } else {
    console.log('PASS adult UI map', headlineForResult(r.ui.result).text, r.ui.result.cardNumber);
  }

  const mid = randomUUID();
  await admin.from('members').insert({
    id: mid,
    first_name: MARKER,
    last_name: 'child',
    email: `phase26e2.child.${Date.now()}@awc-vault.local`,
    status: 'Active',
    role: 'Member',
  });
  created.members.push(mid);
  const { data: dep } = await admin.rpc('ensure_dependent_digital_card', { p_member_id: mid });
  const depRow = Array.isArray(dep) ? dep[0] : dep;
  r = await resolve(staff.token, depRow.qr_token);
  if (r.ui.kind !== 'result' || r.ui.result.subjectType !== 'dependent' || !r.ui.result.valid) {
    defects.push(`dep ${JSON.stringify(r.ui)}`);
  } else {
    console.log('PASS dependent UI map', headlineForResult(r.ui.result).text, r.ui.result.cardNumber);
  }
} catch (e) {
  defects.push(String(e.message || e));
  console.error(e);
} finally {
  for (const mid of created.members) {
    await admin.from('dependent_digital_cards').delete().eq('member_id', mid);
    await admin.from('members').delete().eq('id', mid);
  }
  for (const uid of created.users) {
    await admin.from('audit_logs').delete().eq('user_id', uid);
    await admin.from('member_digital_cards').delete().eq('user_id', uid);
    const { error: uDel } = await admin.from('users').delete().eq('id', uid);
    if (uDel) console.warn('user delete', uid, uDel.message);
  }
  for (const uid of created.auth) {
    await admin.auth.admin.deleteUser(uid);
  }
  // Sweep any marker leftovers (e.g. FK-blocked earlier deletes)
  const { data: leftoverUsers } = await admin
    .from('users')
    .select('id')
    .ilike('name', `%${MARKER}%`);
  for (const u of leftoverUsers || []) {
    await admin.from('audit_logs').delete().eq('user_id', u.id);
    await admin.from('member_digital_cards').delete().eq('user_id', u.id);
    await admin.from('users').delete().eq('id', u.id);
    await admin.auth.admin.deleteUser(u.id);
  }
  const { data: leftoverMembers } = await admin
    .from('members')
    .select('id')
    .ilike('first_name', `%${MARKER}%`);
  for (const m of leftoverMembers || []) {
    await admin.from('dependent_digital_cards').delete().eq('member_id', m.id);
    await admin.from('members').delete().eq('id', m.id);
  }
  const mu = await admin.from('users').select('id', { count: 'exact', head: true }).ilike('name', `%${MARKER}%`);
  const mm = await admin.from('members').select('id', { count: 'exact', head: true }).ilike('first_name', `%${MARKER}%`);
  console.log('marker leftovers', { users: mu.count || 0, members: mm.count || 0 });
  console.log(defects.length ? `DEFECTS ${defects.join(' | ')}` : 'LIVE UI MAP PASS');
  process.exit(defects.length || mu.count || mm.count ? 1 : 0);
}
