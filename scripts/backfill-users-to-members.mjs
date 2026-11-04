#!/usr/bin/env node
/**
 * One-time / ops: create Members directory rows for login accounts in public.users
 * that are missing from public.members (Staff & Roles ≠ Members directory).
 *
 *   node scripts/backfill-users-to-members.mjs
 *
 * Uses VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isPlaceholder = (email) =>
  !email ||
  /@awc-vault\.local$/i.test(email) ||
  /^orphaned\+/i.test(email) ||
  email === 'pending@email.com';

const splitName = (name) => {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return { firstName: parts[0] || 'Member', lastName: parts.slice(1).join(' ') || '' };
};

const directoryRole = (role) => {
  const r = String(role || '').toUpperCase();
  if (!r || r === 'PENDING' || r === 'MEMBER') return 'Member';
  if (r === 'MINISTRY_LEADER') return 'Ministry Leader';
  if (r === 'SUPER_ADMIN') return 'Super Admin';
  if (r === 'ADMIN_STAFF') return 'Admin Staff';
  if (r === 'ASST_SECRETARY') return 'Asst Secretary';
  if (r === 'FIRST_LADY') return 'First Lady';
  return r
    .split('_')
    .map((w) => (w ? w[0] + w.slice(1).toLowerCase() : ''))
    .join(' ');
};

const genCode = () => String(Math.floor(1000 + Math.random() * 9000));

async function ensure(user) {
  const email = String(user.email || '')
    .toLowerCase()
    .trim();
  if (!UUID_RE.test(user.id) || isPlaceholder(email)) return { skipped: true, email };

  let memberId = null;
  const { data: byId } = await supabase.from('members').select('id').eq('id', user.id).maybeSingle();
  if (byId?.id) memberId = byId.id;
  if (!memberId) {
    const { data: byEmail } = await supabase
      .from('members')
      .select('id')
      .ilike('email', email)
      .maybeSingle();
    if (byEmail?.id) memberId = byEmail.id;
  }

  const { firstName, lastName } = splitName(user.name);
  if (memberId) {
    await supabase
      .from('members')
      .update({ first_name: firstName, last_name: lastName, email, status: 'Active' })
      .eq('id', memberId);
    await supabase.from('user_member_links').upsert(
      {
        user_id: user.id,
        member_id: memberId,
        status: 'verified',
        link_method: memberId === user.id ? 'same_uuid' : 'staff_verified',
        linked_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
    return { existed: true, email, memberId };
  }

  const insertRow = {
    id: user.id,
    first_name: firstName,
    last_name: lastName,
    email,
    birthday: user.birthday || null,
    avatar_url: user.avatar_url || null,
    status: 'Active',
    role: directoryRole(user.role),
    access_code: genCode(),
    children: user.children || [],
  };
  let { data: created, error } = await supabase.from('members').insert(insertRow).select('id').single();
  if (error) {
    delete insertRow.id;
    const retry = await supabase.from('members').insert(insertRow).select('id').single();
    created = retry.data;
    error = retry.error;
  }
  if (error) return { error: error.message, email };
  memberId = created.id;
  await supabase.from('user_member_links').upsert(
    {
      user_id: user.id,
      member_id: memberId,
      status: 'verified',
      link_method: memberId === user.id ? 'same_uuid' : 'staff_verified',
      linked_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
  return { created: true, email, memberId, name: user.name, role: user.role };
}

const { data: users, error } = await supabase
  .from('users')
  .select('id, email, name, role, birthday, avatar_url, children')
  .order('created_at', { ascending: true });
if (error) {
  console.error(error.message);
  process.exit(1);
}

const summary = { created: 0, existed: 0, skipped: 0, errors: [] };
for (const u of users || []) {
  const r = await ensure(u);
  if (r.error) summary.errors.push(r);
  else if (r.created) summary.created += 1;
  else if (r.existed) summary.existed += 1;
  else if (r.skipped) summary.skipped += 1;
}
console.log(JSON.stringify(summary, null, 2));
