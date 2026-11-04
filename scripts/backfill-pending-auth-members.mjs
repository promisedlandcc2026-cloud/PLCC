/**
 * One-shot: Auth-only signups → PENDING users + Members (Visitor).
 * Also syncs existing PENDING users into Members with Visitor status.
 *
 * Run: node scripts/backfill-pending-auth-members.mjs
 */
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
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

const isNonDirectoryEmail = (email) => {
  const e = String(email || '')
    .toLowerCase()
    .trim();
  return (
    !e ||
    !e.includes('@') ||
    /@awc-vault\.local$/i.test(e) ||
    /^orphaned\+/i.test(e) ||
    /@phone\.awcvault\.invalid$/i.test(e) ||
    e === 'pending@email.com'
  );
};

const accessCode = () => String(Math.floor(1000 + Math.random() * 9000));

async function ensureMember(userRow) {
  const email = String(userRow.email || '')
    .toLowerCase()
    .trim();
  if (isNonDirectoryEmail(email)) return null;
  const isPending = String(userRow.role || '').toUpperCase() === 'PENDING';
  const nameParts = String(userRow.name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const first_name = nameParts[0] || 'Member';
  const last_name = nameParts.slice(1).join(' ') || '';

  const { data: byId } = await admin.from('members').select('id').eq('id', userRow.id).maybeSingle();
  let memberId = byId?.id || null;
  if (!memberId) {
    const { data: byEmail } = await admin.from('members').select('id').ilike('email', email).maybeSingle();
    memberId = byEmail?.id || null;
  }

  if (memberId) {
    await admin
      .from('members')
      .update({
        email,
        ...(userRow.name ? { first_name, last_name } : {}),
        ...(isPending ? { status: 'Visitor' } : {}),
      })
      .eq('id', memberId);
  } else {
    const insert = {
      id: userRow.id,
      email,
      first_name,
      last_name,
      status: isPending ? 'Visitor' : 'Active',
      role: 'Member',
      access_code: accessCode(),
      children: [],
    };
    const { data, error } = await admin.from('members').insert(insert).select('id').single();
    if (error) {
      const { data: retry } = await admin.from('members').select('id').ilike('email', email).maybeSingle();
      memberId = retry?.id || null;
      if (!memberId) throw error;
    } else {
      memberId = data.id;
    }
  }

  await admin
    .from('user_member_links')
    .upsert(
      {
        user_id: userRow.id,
        member_id: memberId,
        status: 'verified',
        link_method: memberId === userRow.id ? 'same_uuid' : 'staff_verified',
        linked_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .then(() => null)
    .catch(() => null);

  return memberId;
}

async function main() {
  const report = { syncedPending: [], createdFromAuth: [], skipped: [] };

  const { data: pendingUsers, error: pErr } = await admin
    .from('users')
    .select('id, email, name, role')
    .eq('role', 'PENDING');
  if (pErr) throw pErr;

  for (const u of pendingUsers || []) {
    if (isNonDirectoryEmail(u.email)) {
      report.skipped.push({ email: u.email, reason: 'placeholder' });
      continue;
    }
    // Clear email-local-part placeholder names
    const local = String(u.email || '').split('@')[0]?.toLowerCase();
    if (local && String(u.name || '').trim().toLowerCase() === local) {
      await admin.from('users').update({ name: '' }).eq('id', u.id);
      u.name = '';
    }
    const memberId = await ensureMember(u);
    report.syncedPending.push({ email: u.email, memberId });
  }

  const { data: existingUsers } = await admin.from('users').select('id, email').limit(5000);
  const knownIds = new Set((existingUsers || []).map((u) => u.id));
  const knownEmails = new Set(
    (existingUsers || []).map((u) => String(u.email || '').toLowerCase().trim()).filter(Boolean)
  );

  const cutoffMs = Date.now() - 180 * 24 * 60 * 60 * 1000;
  let page = 1;
  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = data?.users || [];
    for (const au of users) {
      const email = String(au.email || '')
        .toLowerCase()
        .trim();
      if (isNonDirectoryEmail(email)) continue;
      if (knownIds.has(au.id) || knownEmails.has(email)) continue;
      const createdAt = au.created_at ? new Date(au.created_at).getTime() : 0;
      if (createdAt && createdAt < cutoffMs) continue;

      const meta = au.user_metadata || {};
      const first = String(meta.first_name || '').trim();
      const last = String(meta.last_name || '').trim();
      const name = [first, last].filter(Boolean).join(' ') || String(meta.full_name || meta.name || '').trim();
      const password_hash = await bcrypt.hash('Temporary123!', 10);
      const stub = {
        id: au.id,
        email,
        name: name || '',
        role: 'PENDING',
        password_hash,
        is_temporary_password: true,
      };
      const { error: insErr } = await admin.from('users').insert(stub);
      if (insErr) {
        report.skipped.push({ email, reason: insErr.message });
        continue;
      }
      const memberId = await ensureMember(stub);
      knownIds.add(au.id);
      knownEmails.add(email);
      report.createdFromAuth.push({
        email,
        id: au.id,
        memberId,
        created_at: au.created_at,
        last_sign_in_at: au.last_sign_in_at,
      });
    }
    if (users.length < 200) break;
    page += 1;
  }

  console.log(JSON.stringify(report, null, 2));
  console.log(
    `\nDone. syncedPending=${report.syncedPending.length} createdFromAuth=${report.createdFromAuth.length}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
