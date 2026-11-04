/**
 * GET /api/vault?resource=people&subResource=member-directory&query=
 * Any signed-in member can search the church directory by name or household.
 */

import {
  directorySearchTokens,
  listDirectoryMembers,
  rankDirectoryMembers,
  sanitizeDirectoryQuery,
  type DirectoryMemberRow,
} from './memberDirectorySearchLogic.js';

const SEARCH_COLUMNS = 'id, first_name, last_name, preferred_name, household_name, avatar_url, status';
const SEARCH_COLUMNS_ADDRESS = `${SEARCH_COLUMNS}, address_as, birthday`;
const SEARCH_COLUMNS_BASIC = 'id, first_name, last_name, household_name, avatar_url, status';

function setNoStore(res: any) {
  res.setHeader?.('Cache-Control', 'private, no-store');
}

async function queryMembers(supabase: any, query: string, columns: string) {
  const fields = columns.includes('preferred_name')
    ? ['first_name', 'last_name', 'preferred_name', 'household_name']
    : ['first_name', 'last_name', 'household_name'];
  const tokens = directorySearchTokens(query);
  const ors = tokens.flatMap((token) => fields.map((field) => `${field}.ilike.%${token}%`));
  return supabase.from('members').select(columns).or(ors.join(',')).limit(200);
}

async function youthMemberIds(supabase: any, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const { data, error } = await supabase
    .from('household_members')
    .select('member_id')
    .in('member_id', ids)
    .in('relationship_type', ['youth'])
    .eq('status', 'active');
  if (error || !Array.isArray(data)) return new Set();
  return new Set(data.map((row: { member_id?: string }) => String(row.member_id || '')).filter(Boolean));
}

function withMinors(rows: DirectoryMemberRow[], youth: Set<string>): DirectoryMemberRow[] {
  if (!youth.size) return rows;
  return rows.map((row) => (youth.has(String(row.id)) ? { ...row, minor: true } : row));
}

async function childMemberIds(supabase: any, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const { data, error } = await supabase
    .from('household_members')
    .select('member_id')
    .in('member_id', ids)
    .in('relationship_type', ['child', 'dependent'])
    .eq('status', 'active');
  if (error || !Array.isArray(data)) return new Set();
  return new Set(data.map((row: { member_id?: string }) => String(row.member_id || '')).filter(Boolean));
}

export async function handleMemberDirectorySearch(req: any, res: any, supabase: any, user: any) {
  setNoStore(res);
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  if (!user) {
    return res.status(401).json({ ok: false, error: 'Sign in to search the church directory.' });
  }

  const query = sanitizeDirectoryQuery(req.query?.query ?? req.query?.q);
  if (query.length === 1) {
    return res.status(400).json({ ok: false, error: 'Type at least 2 letters to search members.' });
  }

  if (!query) {
    let browse = await supabase
      .from('members')
      .select(SEARCH_COLUMNS_ADDRESS)
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true })
      .limit(200);
    if (browse.error && /address_as/i.test(String(browse.error.message || ''))) {
      browse = await supabase
        .from('members')
        .select(SEARCH_COLUMNS)
        .order('last_name', { ascending: true })
        .order('first_name', { ascending: true })
        .limit(200);
    }
    if (browse.error && /preferred_name/i.test(String(browse.error.message || ''))) {
      browse = await supabase
        .from('members')
        .select(SEARCH_COLUMNS_BASIC)
        .order('last_name', { ascending: true })
        .order('first_name', { ascending: true })
        .limit(200);
    }
    if (browse.error) {
      console.error('[Vault API] member-directory browse:', browse.error.message);
      return res.status(502).json({ ok: false, error: 'Could not load the church directory.' });
    }
    const rows = (browse.data || []) as DirectoryMemberRow[];
    const hidden = await childMemberIds(
      supabase,
      rows.map((row) => String(row.id || '')).filter(Boolean)
    );
    const visible = hidden.size ? rows.filter((row) => !hidden.has(String(row.id))) : rows;
    const youth = await youthMemberIds(
      supabase,
      visible.map((row) => String(row.id || '')).filter(Boolean)
    );
    const listed = listDirectoryMembers(withMinors(visible, youth), 50);
    return res.status(200).json({
      ok: true,
      query: '',
      members: listed.members,
      truncated: listed.truncated || rows.length >= 200,
    });
  }

  let result = await queryMembers(supabase, query, SEARCH_COLUMNS_ADDRESS);
  if (result.error && /address_as/i.test(String(result.error.message || ''))) {
    result = await queryMembers(supabase, query, SEARCH_COLUMNS);
  }
  if (result.error && /preferred_name/i.test(String(result.error.message || ''))) {
    result = await queryMembers(supabase, query, SEARCH_COLUMNS_BASIC);
  }
  if (result.error) {
    console.error('[Vault API] member-directory:', result.error.message);
    return res.status(502).json({ ok: false, error: 'Could not search the church directory.' });
  }

  const rows = (result.data || []) as DirectoryMemberRow[];
  const hidden = await childMemberIds(
    supabase,
    rows.map((row) => String(row.id || '')).filter(Boolean)
  );
  const visible = hidden.size ? rows.filter((row) => !hidden.has(String(row.id))) : rows;
  const youth = await youthMemberIds(
    supabase,
    visible.map((row) => String(row.id || '')).filter(Boolean)
  );
  const ranked = rankDirectoryMembers(withMinors(visible, youth), query, 50);

  return res.status(200).json({
    ok: true,
    query,
    members: ranked.members,
    truncated: ranked.truncated,
  });
}
