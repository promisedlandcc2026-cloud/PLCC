/**
 * Phase 2.7D.10 — Vault attendance dashboard API.
 * GET /api/vault?resource=attendance&subResource=dashboard&days=30
 */

import { getSupabaseAdmin, requireAuth } from './auth.js';
import { ATTENDANCE_CHECKIN_ROLES } from './attendanceCheckinLogic.js';

function setNoStore(res: any) {
  res.setHeader?.('Cache-Control', 'private, no-store');
  res.setHeader?.('Pragma', 'no-cache');
}

export async function handleAttendanceDashboard(req: any, res: any) {
  try {
    setNoStore(res);
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return res.status(503).json({ ok: false, error: 'Supabase Admin not initialized.', code: 'unavailable' });
    }
    const auth = await requireAuth(req, res, supabase);
    if (!auth) return;

    if (!ATTENDANCE_CHECKIN_ROLES.has(String(auth.role || '').toUpperCase())) {
      return res.status(403).json({ ok: false, error: 'Forbidden.', code: 'forbidden' });
    }

    if (String(req.method || '').toUpperCase() !== 'GET') {
      return res.status(405).json({ ok: false, error: 'Method not allowed.', code: 'method_not_allowed' });
    }

    const daysRaw = Number(req.query?.days);
    const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(365, Math.floor(daysRaw))) : 30;

    const { data, error } = await supabase.rpc('attendance_dashboard_summary', {
      p_days: days,
    });
    if (error) {
      const msg = String(error.message || '');
      console.error('[attendance-dashboard]', msg, error.code || '', error.details || '');
      if (/function .*attendance_dashboard_summary.* does not exist/i.test(msg)) {
        return res.status(503).json({
          ok: false,
          error:
            'Dashboard SQL is missing on this database. Run connect_phase_2_7d10_attendance_dashboard_history.sql on the same Supabase project as Vercel SUPABASE_URL.',
          code: 'unavailable',
          details: msg,
        });
      }
      if (/does not exist/i.test(msg)) {
        return res.status(503).json({
          ok: false,
          error:
            'Dashboard depends on a missing table or function. Finish Phase 2.7 SQL (especially 7d6 custody, 7d8 reconciliations, 7d10 dashboard) on the production Supabase project.',
          code: 'unavailable',
          details: msg,
        });
      }
      return res.status(500).json({
        ok: false,
        error: 'Dashboard failed.',
        code: 'dashboard_error',
        details: msg,
      });
    }

    setNoStore(res);
    return res.status(200).json({ ok: true, ...(data || {}) });
  } catch (err: any) {
    console.error('[attendance-dashboard]', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Dashboard failed.', code: 'dashboard_error' });
  }
}
