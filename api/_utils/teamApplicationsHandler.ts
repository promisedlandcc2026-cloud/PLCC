/**
 * Staff review of team applications. Writes go through the service role
 * so the browser anon key cannot update applications or insert audit logs.
 */
import { getSupabaseAdmin, requireAuth } from './auth.js';

const TEAM_APP_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'PASTOR', 'MINISTRY_LEADER']);
const STATUSES = new Set(['new', 'approved', 'rejected', 'archived']);

export async function handleTeamApplications(req: any, res: any) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ ok: false, error: 'Supabase Admin not initialized' });

  const auth = await requireAuth(req, res, supabase);
  if (!auth?.user) return;
  if (!TEAM_APP_ROLES.has(String(auth.role || '').toUpperCase())) {
    return res.status(403).json({ ok: false, error: 'This action requires a staff role.' });
  }

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('team_applications')
      .select('id, created_at, name, email, team_id, experience, status')
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ ok: false, error: 'Could not load applications' });
    return res.status(200).json({ ok: true, applications: data || [] });
  }

  if (req.method === 'PATCH') {
    const id = String(req.body?.id || '').trim();
    const status = String(req.body?.status || '').trim();
    if (!id || !STATUSES.has(status)) {
      return res.status(400).json({ ok: false, error: 'id and a valid status are required' });
    }
    const { data, error } = await supabase
      .from('team_applications')
      .update({ status })
      .eq('id', id)
      .select('id, status')
      .single();
    if (error) return res.status(500).json({ ok: false, error: 'Could not update application' });
    await supabase.from('audit_logs').insert([{
      action: `TEAM_APP_${status.toUpperCase()}`,
      resource_type: 'team_application',
      resource_id: id,
      details: `Application status updated to ${status}`,
      severity: 'info',
      user_id: auth.user.id,
    }]);
    return res.status(200).json({ ok: true, application: data });
  }

  if (req.method === 'DELETE') {
    const id = String(req.body?.id || req.query?.id || '').trim();
    if (!id) return res.status(400).json({ ok: false, error: 'id is required' });
    await supabase.from('audit_logs').insert([{
      action: 'TEAM_APP_DELETE',
      resource_type: 'team_application',
      resource_id: id,
      details: 'Application deleted',
      severity: 'warning',
      user_id: auth.user.id,
    }]);
    const { error } = await supabase.from('team_applications').delete().eq('id', id);
    if (error) return res.status(500).json({ ok: false, error: 'Could not delete application' });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
