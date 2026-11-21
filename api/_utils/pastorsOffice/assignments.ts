import { getSupabaseAdmin, verifyAuth } from '../auth.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Only super admins manage additional office assignments. */
export async function handleOfficeAssignments(req: any, res: any, injected?: { admin: any; verify: typeof verifyAuth }) {
  res.setHeader('Cache-Control', 'private, no-store');
  const admin = injected?.admin || getSupabaseAdmin();
  if (!admin) return res.status(503).json({ ok: false, error: 'Office assignments unavailable.' });
  const auth = await (injected?.verify || verifyAuth)(req, admin);
  if (auth.unavailable) return res.status(503).json({ ok: false, error: 'Sign-in verification unavailable.' });
  if (!auth.user) return res.status(401).json({ ok: false, error: 'Please sign in.' });
  if (auth.role !== 'SUPER_ADMIN') return res.status(403).json({ ok: false, error: 'Only Super Admins manage office assignments.' });
  if (req.method === 'GET') {
    const { data, error } = await admin.from('pastoral_office_assignments')
      .select('user_id, office_id, pastoral_offices!inner(pastor_user_id)').eq('office_role', 'PASTORS_ASSISTANT').is('revoked_at', null);
    if (error) return res.status(503).json({ ok: false, error: 'Office assignments are not set up yet.' });
    return res.status(200).json({ ok: true, assignments: data || [] });
  }
  if (req.method === 'POST') {
    const { pastorId, assistantId, action } = req.body || {};
    if (typeof pastorId !== 'string' || typeof assistantId !== 'string' || !UUID.test(pastorId) || !UUID.test(assistantId) || !['grant', 'revoke'].includes(action))
      return res.status(400).json({ ok: false, error: 'Choose a pastor, assistant, and valid action.' });
    const { error } = await admin.rpc('set_pastors_assistant', { p_actor: auth.user.id, p_pastor: pastorId, p_assistant: assistantId, p_grant: action === 'grant' });
    if (error) return res.status(400).json({ ok: false, error: 'Could not update the assignment. Confirm both accounts and office setup.' });
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ ok: false, error: 'Method not allowed.' });
}
