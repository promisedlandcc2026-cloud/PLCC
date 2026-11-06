import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdmin, verifyAuth } from '../_utils/auth.js';
import { STAFF_WRITE_ROLES } from '../_utils/routeAccess.js';
import {
  SERMON_BODY_MAX,
  buildSermonTranscript,
  listRhemaMembers,
  mintIntegrationToken,
  publicRhema,
  getRhemaStudyGuide,
  listRhemaStudyGuides,
  acceptRhemaStudyGuideUrl,
  readRhema,
  rhemaNotesBaseUrl,
  tokensMatch,
} from '../_utils/rhemanotesIntegration.js';

async function loadIntegrations(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>) {
  const { data, error } = await supabase
    .from('organization_settings')
    .select('integrations')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  return (data?.integrations || {}) as Record<string, unknown>;
}

async function saveRhema(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  integrations: Record<string, unknown>,
  rhema: { apiKey?: string; integrationToken?: string }
) {
  const next = { ...integrations, rhemanotes: rhema };
  const { data: existing } = await supabase
    .from('organization_settings')
    .select('id')
    .eq('id', 1)
    .maybeSingle();
  if (!existing) {
    const { error: createError } = await supabase
      .from('organization_settings')
      .upsert({ id: 1, updated_at: new Date().toISOString() });
    if (createError) throw createError;
  }
  const { error } = await supabase
    .from('organization_settings')
    .update({ integrations: next, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) throw error;
  return next;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: 'Supabase Admin not initialized' });

  const { user, role } = await verifyAuth(req, supabase);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const action = String(req.query.action || req.body?.action || '').trim();

  if (req.method === 'GET' && (action === 'library' || action === 'guide')) {
    try {
      if (action === 'library') {
        const guides = await listRhemaStudyGuides();
        return res.status(200).json({ ok: true, guides });
      }
      const guide = await getRhemaStudyGuide(String(req.query.token || ''));
      if (!guide) {
        return res.status(404).json({ ok: false, error: 'That study guide is not published.' });
      }
      return res.status(200).json({ ok: true, guide });
    } catch (err: any) {
      console.error('[RhemaNotes library] ', err);
      return res.status(502).json({ ok: false, error: err?.message || 'Could not load RhemaNotes.' });
    }
  }

  if (!STAFF_WRITE_ROLES.has(String(role || '').toUpperCase())) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  try {
    if (req.method === 'GET') {
      const integrations = await loadIntegrations(supabase);
      return res.status(200).json({ ok: true, rhemanotes: publicRhema(readRhema(integrations)) });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const integrations = await loadIntegrations(supabase);
    const stored = readRhema(integrations);

    if (action === 'save_key') {
      const apiKey = String(req.body?.apiKey || '').trim();
      if (apiKey.length < 12) {
        return res.status(400).json({ error: 'Paste a RhemaNotes API key.' });
      }
      await saveRhema(supabase, integrations, {
        apiKey,
        integrationToken: stored.integrationToken,
      });
      return res.status(200).json({
        ok: true,
        rhemanotes: publicRhema({ apiKey, integrationToken: stored.integrationToken }),
      });
    }

    if (action === 'generate_token') {
      const integrationToken = mintIntegrationToken();
      await saveRhema(supabase, integrations, {
        apiKey: stored.apiKey,
        integrationToken,
      });
      return res.status(200).json({
        ok: true,
        token: integrationToken,
        rhemanotes: publicRhema({ apiKey: stored.apiKey, integrationToken }),
      });
    }

    if (action === 'send') {
      const sermonId = String(req.body?.sermonId || '').trim();
      if (!sermonId) return res.status(400).json({ error: 'sermonId is required' });
      if (!stored.apiKey) {
        return res.status(400).json({
          error: 'Save a RhemaNotes API key in Settings → Integrations first.',
        });
      }

      const { data: sermon, error } = await supabase
        .from('sermons')
        .select('*')
        .eq('id', sermonId)
        .maybeSingle();
      if (error) throw error;
      if (!sermon) return res.status(404).json({ error: 'Sermon not found' });

      const body = String(sermon.body || '');
      if (body.length > SERMON_BODY_MAX) {
        return res.status(400).json({ error: 'Sermon message is too long to send.' });
      }

      const transcript = buildSermonTranscript(sermon);
      const response = await fetch(`${rhemaNotesBaseUrl()}/api/v1/notes`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stored.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sermonId: sermon.id,
          title: sermon.title,
          speaker: sermon.speaker,
          date: sermon.date,
          transcript,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        notes?: { url?: string };
      } | null;
      if (!response.ok || !payload?.ok || !payload.notes?.url) {
        return res.status(502).json({
          error: payload?.error || `RhemaNotes returned ${response.status}`,
        });
      }

      const sessionUrl = payload.notes.url;
      const { error: updateError } = await supabase
        .from('sermons')
        .update({ rhemanotes_session_url: sessionUrl })
        .eq('id', sermonId);
      if (updateError && !/rhemanotes_session_url|column/i.test(updateError.message || '')) {
        throw updateError;
      }

      return res.status(200).json({ ok: true, url: sessionUrl });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err: any) {
    console.error('[RhemaNotes] ', err);
    return res.status(500).json({ error: err?.message || 'RhemaNotes integration failed' });
  }
}

export async function handleRhemaStudyGuide(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: 'Supabase Admin not initialized' });

  const header = String(req.headers.authorization || '');
  const provided = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!provided) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const integrations = await loadIntegrations(supabase);
    const stored = readRhema(integrations);
    if (!stored.integrationToken || !tokensMatch(stored.integrationToken, provided)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const sermonId = String(req.body?.sermonId || '').trim().slice(0, 80);
    if (!sermonId) return res.status(400).json({ error: 'sermonId is required' });
    let shareUrl = '';
    try {
      shareUrl = acceptRhemaStudyGuideUrl(String(req.body?.shareUrl || ''));
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Study guide link is not valid.' });
    }
    const title = String(req.body?.title || 'Study guide').trim().slice(0, 200) || 'Study guide';

    const { data: sermon, error } = await supabase
      .from('sermons')
      .select('id')
      .eq('id', sermonId)
      .maybeSingle();
    if (error) throw error;
    if (!sermon) return res.status(404).json({ error: 'Sermon not found' });

    const { error: updateError } = await supabase
      .from('sermons')
      .update({ rhemanotes_study_url: shareUrl, rhemanotes_study_title: title })
      .eq('id', sermonId);
    if (updateError && /rhemanotes_study_url|rhemanotes_study_title|column/i.test(updateError.message || '')) {
      return res.status(503).json({
        error:
          'Run supabase/migrations/rhemanotes_study_guide.sql in PLCC Canaan database, then push the study guide again.',
      });
    }
    if (updateError) throw updateError;

    return res.status(200).json({ ok: true, sermonId, shareUrl, title });
  } catch (err: any) {
    console.error('[RhemaNotes study guide] ', err);
    return res.status(500).json({ error: err?.message || 'Could not save the study guide' });
  }
}

export async function handleRhemaMembers(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: 'Supabase Admin not initialized' });

  const header = String(req.headers.authorization || '');
  const provided = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!provided) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const integrations = await loadIntegrations(supabase);
    const stored = readRhema(integrations);
    if (!stored.integrationToken || !tokensMatch(stored.integrationToken, provided)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const members = await listRhemaMembers(supabase);
    return res.status(200).json({ ok: true, members });
  } catch (err: any) {
    console.error('[RhemaNotes members] ', err);
    return res.status(500).json({ error: err?.message || 'Member sync failed' });
  }
}
