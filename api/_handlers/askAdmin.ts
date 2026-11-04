import { getSupabaseAdmin, requireAuth } from '../_utils/auth.js';
import { buildAskAdminSystemPrompt } from '../_utils/askAdminPrompt.js';
import {
  formatChurchKnowledgeBlock,
  loadChurchKnowledgeForQuery,
} from '../_utils/askAdminKnowledge.js';

type ChatMessage = { role: 'user' | 'ai' | 'assistant' | 'model'; content: string };

function normalizeMessages(messages: ChatMessage[]) {
  const normalized = (messages || [])
    .filter((m) => m?.content && typeof m.content === 'string')
    .map((m) => ({
      role: m.role === 'ai' || m.role === 'model' || m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content).slice(0, 8000),
    }))
    .slice(-20);

  // Anthropic requires the first message to be from the user
  const firstUser = normalized.findIndex((m) => m.role === 'user');
  if (firstUser <= 0) return normalized;
  return normalized.slice(firstUser);
}

function isCreditOrQuotaFailure(status: number, bodyText: string): boolean {
  if (status === 402 || status === 429 || status === 529) return true;
  const t = (bodyText || '').toLowerCase();
  return (
    t.includes('insufficient_quota') ||
    t.includes('quota') ||
    t.includes('credit') ||
    t.includes('billing') ||
    t.includes('rate_limit') ||
    t.includes('overloaded') ||
    t.includes('balance')
  );
}

async function callOpenAI(system: string, messages: { role: string; content: string }[]) {
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) return { ok: false as const, skip: true as const, error: 'OPENAI_API_KEY not set' };

  const model = process.env.OPENAI_ASK_ADMIN_MODEL || 'gpt-4o-mini';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      messages: [{ role: 'system', content: system }, ...messages],
    }),
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }

  if (!res.ok) {
    return {
      ok: false as const,
      skip: false as const,
      status: res.status,
      creditIssue: isCreditOrQuotaFailure(res.status, text),
      error: json?.error?.message || text.slice(0, 300) || `OpenAI HTTP ${res.status}`,
    };
  }

  const content = json?.choices?.[0]?.message?.content;
  if (!content) {
    return { ok: false as const, skip: false as const, status: 502, creditIssue: false, error: 'Empty OpenAI response' };
  }

  return { ok: true as const, provider: 'openai' as const, model, text: String(content) };
}

async function callAnthropic(system: string, messages: { role: string; content: string }[]) {
  const apiKey = process.env.ANTHROPIC_API_KEY || '';
  if (!apiKey) return { ok: false as const, skip: true as const, error: 'ANTHROPIC_API_KEY not set' };

  const model = process.env.ANTHROPIC_ASK_ADMIN_MODEL || 'claude-3-5-haiku-20241022';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      temperature: 0.4,
      system,
      messages: messages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
    }),
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }

  if (!res.ok) {
    return {
      ok: false as const,
      skip: false as const,
      status: res.status,
      creditIssue: isCreditOrQuotaFailure(res.status, text),
      error: json?.error?.message || text.slice(0, 300) || `Anthropic HTTP ${res.status}`,
    };
  }

  const blocks = Array.isArray(json?.content) ? json.content : [];
  const content = blocks
    .filter((b: any) => b?.type === 'text')
    .map((b: any) => b.text)
    .join('\n')
    .trim();

  if (!content) {
    return { ok: false as const, skip: false as const, status: 502, creditIssue: false, error: 'Empty Anthropic response' };
  }

  return { ok: true as const, provider: 'anthropic' as const, model, text: content };
}

/**
 * Ask Admin chat: OpenAI first, Anthropic fallback on credit/quota/provider failure.
 */
export const handleAskAdmin = async (req: any, res: any) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase Admin not initialized' });

  const auth = await requireAuth(req, res, supabaseAdmin);
  if (!auth) return;

  const messages = normalizeMessages(req.body?.messages || []);
  if (messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  const stats = req.body?.stats || null;

  // Live form catalogs so "where is the ___ form?" answers stay current
  let catalog: { consentForms: any[]; customForms: any[] } = { consentForms: [], customForms: [] };
  try {
    const [consentRes, customRes] = await Promise.all([
      supabaseAdmin
        .from('consent_forms')
        .select('title, form_type, is_required, audience')
        .eq('is_active', true)
        .order('title', { ascending: true }),
      supabaseAdmin
        .from('forms')
        .select('title, description')
        .order('title', { ascending: true })
        .limit(100),
    ]);

    if (consentRes.error) {
      console.warn('[ask-admin] consent forms catalog:', consentRes.error.message);
      // Fallback without audience if column not migrated yet
      const basic = await supabaseAdmin
        .from('consent_forms')
        .select('title, form_type, is_required')
        .eq('is_active', true)
        .order('title', { ascending: true });
      catalog.consentForms = (basic.data || []).map((f: any) => ({ ...f, audience: 'children' }));
    } else {
      catalog.consentForms = consentRes.data || [];
    }
    if (customRes.error) {
      console.warn('[ask-admin] custom forms catalog:', customRes.error.message);
      // Fallback without description if column missing
      const basic = await supabaseAdmin.from('forms').select('title').order('title', { ascending: true }).limit(100);
      catalog.customForms = (basic.data || []).map((f: any) => ({ title: f.title, description: null }));
    } else {
      catalog.customForms = (customRes.data || []).map((f: any) => ({
        title: f.title,
        description: f.description || null,
      }));
    }
  } catch (err) {
    console.warn('[ask-admin] form catalog load failed', err);
  }

  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
  let knowledgeBlock = '';
  try {
    knowledgeBlock = formatChurchKnowledgeBlock(loadChurchKnowledgeForQuery(lastUserMsg));
  } catch (err) {
    console.warn('[ask-admin] church knowledge load failed', err);
  }

  const system = buildAskAdminSystemPrompt(stats, catalog, knowledgeBlock);

  const openaiKey = process.env.OPENAI_API_KEY || '';
  const anthropicKey = process.env.ANTHROPIC_API_KEY || '';
  if (!openaiKey && !anthropicKey) {
    return res.status(503).json({
      error: 'No AI provider configured. Set OPENAI_API_KEY and/or ANTHROPIC_API_KEY in Vercel.',
    });
  }

  const attempts: Array<{ provider: string; error: string }> = [];

  // Primary: OpenAI
  if (openaiKey) {
    try {
      const primary = await callOpenAI(system, messages);
      if (primary.ok) {
        return res.status(200).json({
          ok: true,
          text: primary.text,
          provider: primary.provider,
          model: primary.model,
        });
      }
      if (!primary.skip) {
        attempts.push({ provider: 'openai', error: primary.error });
        console.warn('[ask-admin] OpenAI failed:', primary.status, primary.error);
      }
    } catch (err: any) {
      attempts.push({ provider: 'openai', error: err.message || 'OpenAI exception' });
      console.error('[ask-admin] OpenAI exception', err);
    }
  }

  // Fallback: Anthropic
  if (anthropicKey) {
    try {
      const fallback = await callAnthropic(system, messages);
      if (fallback.ok) {
        return res.status(200).json({
          ok: true,
          text: fallback.text,
          provider: fallback.provider,
          model: fallback.model,
          fallback: true,
          attempts,
        });
      }
      if (!fallback.skip) {
        attempts.push({ provider: 'anthropic', error: fallback.error });
        console.warn('[ask-admin] Anthropic failed:', fallback.status, fallback.error);
      }
    } catch (err: any) {
      attempts.push({ provider: 'anthropic', error: err.message || 'Anthropic exception' });
      console.error('[ask-admin] Anthropic exception', err);
    }
  }

  return res.status(502).json({
    ok: false,
    error: 'Ask Admin could not reach OpenAI or Anthropic. Check API keys and credits.',
    attempts,
  });
};
