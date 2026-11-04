/**
 * Keep Staff & Roles / login accounts visible in the Members directory.
 * Non-fatal — never blocks auth, invite, or role changes.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isPlaceholderUserEmail = (email: string) => {
  const e = String(email || '').toLowerCase();
  return (
    !e ||
    /@awc-vault\.local$/i.test(e) ||
    /^orphaned\+/i.test(e) ||
    e === 'pending@email.com' ||
    /@phone\.awcvault\.invalid$/i.test(e) ||
    /jerless/i.test(e) ||
    /@atomic(mail|vault)?\.io$/i.test(e) ||
    /@atomicmail\.com$/i.test(e) ||
    /@atomic\.io$/i.test(e) ||
    /gmailcom$/i.test(e) ||
    /gmail\.comm$/i.test(e) ||
    /@gmaul\./i.test(e) ||
    /@2gmail\./i.test(e) ||
    /@2gmal\./i.test(e) ||
    /@gmail\.com\d+$/i.test(e) ||
    /^phase\d/i.test(e)
  );
};

const splitUserDisplayName = (name?: string | null) => {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return {
    firstName: parts[0] || 'Member',
    lastName: parts.slice(1).join(' ') || '',
  };
};

/** Directory role label for members.role (not the auth Role enum). */
const directoryRoleFromUserRole = (role?: string | null) => {
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

const generateAccessCode = () => String(10_000_000 + Math.floor(Math.random() * 90_000_000));

export type EnsureMemberUserRow = {
  id?: string;
  email?: string | null;
  name?: string | null;
  role?: string | null;
  phone?: string | null;
  birthday?: string | null;
  avatar_url?: string | null;
  children?: any;
} | null;

/**
 * Creates a members row when missing (same UUID when possible); updates profile fields when present.
 */
export async function ensureMemberForUser(
  supabaseAdmin: any,
  userRow: EnsureMemberUserRow,
  fields: Record<string, any> = {}
): Promise<string | null> {
  if (!supabaseAdmin || !userRow?.id || !UUID_RE.test(userRow.id)) return null;

  const email = String(userRow.email || fields.email || '')
    .toLowerCase()
    .trim();
  if (isPlaceholderUserEmail(email)) return null;

  const nameSource =
    (typeof fields.name === 'string' && fields.name.trim() ? fields.name : null) ||
    userRow.name ||
    '';
  const { firstName, lastName } = splitUserDisplayName(nameSource);

  const memberUpdates: Record<string, any> = {};
  if ('birthday' in fields) memberUpdates.birthday = fields.birthday ?? null;
  else if (userRow.birthday !== undefined) memberUpdates.birthday = userRow.birthday ?? null;
  if ('phone' in fields) memberUpdates.phone = fields.phone ?? null;
  else if (userRow.phone !== undefined) memberUpdates.phone = userRow.phone ?? null;
  if ('avatar_url' in fields) memberUpdates.avatar_url = fields.avatar_url ?? null;
  else if (userRow.avatar_url !== undefined) memberUpdates.avatar_url = userRow.avatar_url ?? null;
  if ('children' in fields) memberUpdates.children = fields.children ?? [];
  else if (userRow.children !== undefined) memberUpdates.children = userRow.children ?? [];
  if (nameSource.trim()) {
    memberUpdates.first_name = firstName;
    memberUpdates.last_name = lastName;
  }

  const isPendingRole = String(userRow.role || '').toUpperCase() === 'PENDING';
  // PENDING login accounts must show under Members → Visitors / Pending
  if (isPendingRole) {
    memberUpdates.status = 'Visitor';
  }

  try {
    let memberId: string | null = null;

    const { data: byId } = await supabaseAdmin
      .from('members')
      .select('id')
      .eq('id', userRow.id)
      .maybeSingle();
    if (byId?.id) memberId = byId.id;

    if (!memberId && email) {
      const { data: byEmail } = await supabaseAdmin
        .from('members')
        .select('id')
        .ilike('email', email)
        .maybeSingle();
      if (byEmail?.id) memberId = byEmail.id;
    }

    if (memberId) {
      // Approved logins: lift Visitor → Active (leave Inactive alone)
      if (!isPendingRole) {
        const { data: cur } = await supabaseAdmin
          .from('members')
          .select('status')
          .eq('id', memberId)
          .maybeSingle();
        if (String(cur?.status || '') === 'Visitor') {
          memberUpdates.status = 'Active';
        }
      }
      if (Object.keys(memberUpdates).length > 0) {
        const { error } = await supabaseAdmin
          .from('members')
          .update(memberUpdates)
          .eq('id', memberId);
        if (error) console.error('[Vault API] ensureMemberForUser update:', error.message);
      }
    } else {
      const insertRow: Record<string, any> = {
        id: userRow.id,
        first_name: firstName,
        last_name: lastName,
        email,
        phone: memberUpdates.phone ?? null,
        birthday: memberUpdates.birthday ?? null,
        avatar_url: memberUpdates.avatar_url ?? null,
        children: memberUpdates.children ?? [],
        status: isPendingRole ? 'Visitor' : 'Active',
        role: directoryRoleFromUserRole(userRow.role),
        access_code: generateAccessCode(),
      };
      const { data: created, error: createError } = await supabaseAdmin
        .from('members')
        .insert(insertRow)
        .select('id')
        .single();
      if (createError) {
        // Race / id conflict: fall back to email match or insert without forced id
        console.error('[Vault API] ensureMemberForUser insert:', createError.message);
        const { data: retryEmail } = await supabaseAdmin
          .from('members')
          .select('id')
          .ilike('email', email)
          .maybeSingle();
        if (retryEmail?.id) {
          memberId = retryEmail.id;
        } else {
          delete insertRow.id;
          const { data: created2, error: createError2 } = await supabaseAdmin
            .from('members')
            .insert(insertRow)
            .select('id')
            .single();
          if (createError2) {
            console.error('[Vault API] ensureMemberForUser insert retry:', createError2.message);
            return null;
          }
          memberId = created2?.id || null;
        }
      } else {
        memberId = created?.id || userRow.id;
      }
    }

    if (!memberId) return null;

    // Best-effort Connect link (service role). Ignore if table/constraint missing.
    try {
      await supabaseAdmin.from('user_member_links').upsert(
        {
          user_id: userRow.id,
          member_id: memberId,
          status: 'verified',
          link_method: memberId === userRow.id ? 'same_uuid' : 'staff_verified',
          linked_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );
    } catch (linkErr: any) {
      console.error('[Vault API] ensureMemberForUser link:', linkErr?.message || linkErr);
    }

    return memberId;
  } catch (err: any) {
    console.error('[Vault API] ensureMemberForUser failed:', err?.message || err);
    return null;
  }
}
