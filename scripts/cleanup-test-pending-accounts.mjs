/**
 * Spring-clean test / QA pending accounts from users + members + Auth.
 * Does NOT touch real church member accounts or application source code.
 *
 * Run: node scripts/cleanup-test-pending-accounts.mjs
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env.local'), quiet: true });

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing Supabase URL or service role key');
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function isProtectedDeviceAccount(email, role = '') {
  const e = String(email || '')
    .toLowerCase()
    .trim();
  const r = String(role || '').toUpperCase();
  // Never delete kiosk / staff device accounts or elevated roles
  if (e === 'kids.kiosk@awc-vault.local' || r === 'KIOSK') return true;
  if (['SUPER_ADMIN', 'PASTOR', 'ADMIN', 'ADMIN_STAFF', 'SECRETARY'].includes(r)) return true;
  return false;
}

function isTestJunk(email, name = '', role = '') {
  const e = String(email || '')
    .toLowerCase()
    .trim();
  const n = String(name || '');
  if (!e) return false;
  if (isProtectedDeviceAccount(e, role)) return false;
  // Only purge clearly disposable local QA stubs — not all @awc-vault.local
  if (/^phase\d/i.test(e) && /@awc-vault\.local$/i.test(e)) return true;
  if (/^orphaned\+/i.test(e)) return true;
  if (/@phone\.awcvault\.invalid$/i.test(e)) return true;
  if (/^TEST\s*[—-]/.test(n) || /Phase 2\.\d/i.test(n)) return true;
  if (/jerless/i.test(e) || /jerless/i.test(n)) return true;
  if (/@atomic(mail|vault)?\.io$/i.test(e) || /@atomicmail\.com$/i.test(e) || /@atomic\.io$/i.test(e)) {
    return true;
  }
  if (/gmailcom$|gmail\.comm$|@gmaul\.|@2gmail\.|@2gmal\./i.test(e)) return true;
  if (/@gmail\.com\d+$/i.test(e)) return true;
  if (/lessandsheevon@/i.test(e)) return true;
  return false;
}

async function deleteAccount(id, email, name) {
  const result = { id, email, name, steps: [] };

  // Links first
  const linkDel = await admin.from('user_member_links').delete().eq('user_id', id);
  if (!linkDel.error) result.steps.push('links');
  const linkDel2 = await admin.from('user_member_links').delete().eq('member_id', id);
  if (!linkDel2.error) result.steps.push('links_by_member');

  const memDel = await admin.from('members').delete().eq('id', id);
  if (!memDel.error) result.steps.push('member_by_id');
  if (email) {
    const memEmail = await admin.from('members').delete().ilike('email', email);
    if (!memEmail.error) result.steps.push('member_by_email');
  }

  const userDel = await admin.from('users').delete().eq('id', id);
  if (userDel.error) result.userError = userDel.error.message;
  else result.steps.push('users');

  const authDel = await admin.auth.admin.deleteUser(id);
  if (authDel.error) result.authError = authDel.error.message;
  else result.steps.push('auth');

  return result;
}

async function main() {
  const report = {
    deletedPending: [],
    deletedTestVisitors: [],
    promotedActive: [],
    skipped: [],
  };

  // 1) PENDING test users
  const { data: pending, error: pErr } = await admin
    .from('users')
    .select('id, email, name, role')
    .eq('role', 'PENDING');
  if (pErr) throw pErr;

  for (const u of pending || []) {
    if (isProtectedDeviceAccount(u.email, u.role) || !isTestJunk(u.email, u.name, u.role)) {
      report.skipped.push({ email: u.email, reason: 'real_pending_kept' });
      continue;
    }
    report.deletedPending.push(await deleteAccount(u.id, u.email, u.name));
  }

  // 2) Remaining test Visitor members (may already have been deleted with users)
  const { data: visitors, error: vErr } = await admin
    .from('members')
    .select('id, email, first_name, last_name, status')
    .eq('status', 'Visitor')
    .limit(500);
  if (vErr) throw vErr;

  for (const m of visitors || []) {
    const name = `${m.first_name || ''} ${m.last_name || ''}`.trim();
    if (!isTestJunk(m.email, name)) continue;

    // If a non-PENDING real role exists, don't delete — just leave (shouldn't match test patterns)
    const { data: u } = await admin.from('users').select('id, role, email').eq('id', m.id).maybeSingle();
    if (u && isProtectedDeviceAccount(u.email, u.role)) {
      report.skipped.push({ email: m.email, reason: 'protected_device' });
      continue;
    }
    if (u && String(u.role || '').toUpperCase() !== 'PENDING' && !isTestJunk(u.email, '', u.role)) {
      report.skipped.push({ email: m.email, reason: 'has_real_role' });
      continue;
    }

    if (u && isTestJunk(u.email, '', u.role)) {
      report.deletedTestVisitors.push(await deleteAccount(u.id, u.email, name));
      continue;
    }

    await admin.from('user_member_links').delete().eq('member_id', m.id);
    const { error } = await admin.from('members').delete().eq('id', m.id);
    report.deletedTestVisitors.push({
      id: m.id,
      email: m.email,
      name,
      steps: error ? [] : ['member_only'],
      error: error?.message || null,
    });
  }

  // 3) Approved login accounts still marked Visitor in Members → Active
  const { data: membersNeedPromote } = await admin
    .from('users')
    .select('id, email, name, role')
    .neq('role', 'PENDING')
    .limit(2000);

  for (const u of membersNeedPromote || []) {
    if (isTestJunk(u.email, u.name)) continue;
    const role = String(u.role || '').toUpperCase();
    if (!role || role === 'PENDING') continue;

    const { data: m } = await admin
      .from('members')
      .select('id, status, first_name, last_name')
      .eq('id', u.id)
      .maybeSingle();
    if (!m || String(m.status) !== 'Visitor') continue;

    const nameParts = String(u.name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const updates = { status: 'Active' };
    if (nameParts.length && (!m.first_name || m.first_name === 'Member')) {
      updates.first_name = nameParts[0];
      updates.last_name = nameParts.slice(1).join(' ') || m.last_name || '';
    }

    const { error } = await admin.from('members').update(updates).eq('id', m.id);
    if (!error) {
      report.promotedActive.push({ email: u.email, name: u.name || null, role });
    }
  }

  console.log(
    JSON.stringify(
      {
        deletedPendingCount: report.deletedPending.length,
        deletedTestVisitorsCount: report.deletedTestVisitors.length,
        promotedActiveCount: report.promotedActive.length,
        skippedCount: report.skipped.length,
        deletedPending: report.deletedPending.map((r) => r.email),
        deletedTestVisitors: report.deletedTestVisitors.map((r) => r.email),
        promotedActive: report.promotedActive,
        skipped: report.skipped,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
