import { getSupabaseAdmin, verifyAuth } from '../auth.js';

/** Return only office identities belonging to the authenticated pastor or assigned assistant. */
export async function handleMyPastoralOffices(req: any, res: any, injected?: { admin: any; verify: typeof verifyAuth }) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  const admin = injected?.admin || getSupabaseAdmin();
  if (!admin) return res.status(503).json({ ok: false, error: 'Office access is unavailable.' });
  const auth = await (injected?.verify || verifyAuth)(req, admin);
  if (auth.unavailable) return res.status(503).json({ ok: false, error: 'Sign-in verification unavailable.' });
  if (!auth.user) return res.status(401).json({ ok: false, error: 'Please sign in.' });
  if (!auth.role || ['PENDING', 'GUEST', 'KIOSK', 'ACCOUNTANT'].includes(String(auth.role).toUpperCase())) return res.status(403).json({ ok: false, error: 'Office access is not available.' });
  try {
    const [owned, assigned] = await Promise.all([
      admin.from('pastoral_offices').select('id,pastor_user_id').eq('pastor_user_id', auth.user.id),
      admin.from('pastoral_office_assignments').select('office_id,pastoral_offices!inner(id,pastor_user_id)').eq('user_id', auth.user.id).eq('office_role', 'PASTORS_ASSISTANT').is('revoked_at', null),
    ]);
    if (owned.error || assigned.error) return res.status(503).json({ ok: false, error: 'Could not verify office access.' });
    const offices = (owned.data || []).map((row: any) => ({ id: row.id, role: 'PASTOR' }));
    for (const row of assigned.data || []) {
      const office = Array.isArray(row.pastoral_offices) ? row.pastoral_offices[0] : row.pastoral_offices;
      if (office?.id && !offices.some((item: any) => item.id === office.id)) offices.push({ id: office.id, role: 'PASTORS_ASSISTANT' });
    }
    return res.status(200).json({ ok: true, offices });
  } catch {
    return res.status(503).json({ ok: false, error: 'Could not verify office access.' });
  }
}
