/**
 * Lightweight keep-warm / health ping. Returns within ~12s even if PostgREST is wedged.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdmin, withSupabaseTimeout } from './_utils/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Daily cron also sends the 7 AM devotional reminder (sends once per day; see dailyHandler.ts).
  const task = String(Array.isArray(req.query?.task) ? req.query.task[0] : req.query?.task || '');
  if (task === 'daily-reminder') {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.authorization !== `Bearer ${secret}`) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    // Birthday & anniversary greetings ride the same 7 AM run (each sent once per year).
    let celebrations: Record<string, unknown> = {};
    try {
      const { runCelebrationGreetings } = await import('./_utils/celebrations.js');
      celebrations = { ...(await runCelebrationGreetings(getSupabaseAdmin())) };
    } catch (err: any) {
      console.error('[celebrations]', err?.message || err);
      celebrations = { error: 'greetings failed' };
    }
    try {
      const { sendDailyReminder } = await import('./_utils/dailyHandler.js');
      return res.status(200).json({ ok: true, ...(await sendDailyReminder()), celebrations });
    } catch (err: any) {
      console.error('[daily-reminder]', err?.message || err);
      return res.status(500).json({ ok: false, error: 'Reminder failed', celebrations });
    }
  }

  const started = Date.now();
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return res.status(503).json({ ok: false, error: 'Supabase Admin not initialized' });
  }

  try {
    const { data, error } = await withSupabaseTimeout(
      supabaseAdmin.from('events').select('id').limit(1),
      12_000,
      'warm/events'
    );
    if (error) {
      return res.status(502).json({
        ok: false,
        error: error.message,
        ms: Date.now() - started,
      });
    }
    return res.status(200).json({
      ok: true,
      ms: Date.now() - started,
      rows: Array.isArray(data) ? data.length : 0,
    });
  } catch (err: any) {
    return res.status(504).json({
      ok: false,
      error: err?.message || 'Warm ping failed',
      ms: Date.now() - started,
    });
  }
}
