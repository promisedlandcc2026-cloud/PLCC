import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export const SERMON_BODY_MAX = 50_000;

const INACTIVE = new Set(['inactive', 'archived', 'deleted', 'former', 'removed']);

export type RhemaStored = {
  apiKey?: string;
  integrationToken?: string;
};

export type RhemaPublic = {
  connected: boolean;
  apiKeyLastFour: string | null;
  tokenLastFour: string | null;
  hasToken: boolean;
};

function lastFour(value: string | undefined): string | null {
  const trimmed = String(value || '').trim();
  if (trimmed.length < 4) return null;
  return trimmed.slice(-4);
}

export function readRhema(integrations: unknown): RhemaStored {
  if (!integrations || typeof integrations !== 'object') return {};
  const raw = (integrations as Record<string, unknown>).rhemanotes;
  if (!raw || typeof raw !== 'object') return {};
  const row = raw as Record<string, unknown>;
  const apiKey = typeof row.apiKey === 'string' ? row.apiKey.trim() : '';
  const integrationToken =
    typeof row.integrationToken === 'string' ? row.integrationToken.trim() : '';
  return {
    ...(apiKey ? { apiKey } : {}),
    ...(integrationToken ? { integrationToken } : {}),
  };
}

export function publicRhema(stored: RhemaStored): RhemaPublic {
  return {
    connected: Boolean(stored.apiKey),
    apiKeyLastFour: lastFour(stored.apiKey),
    tokenLastFour: lastFour(stored.integrationToken),
    hasToken: Boolean(stored.integrationToken),
  };
}

/** Keep saved secrets when the settings form saves the rest of the integrations map. */
export function mergeIntegrationSettings(existing: unknown, incoming: unknown): Record<string, unknown> {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  const next =
    incoming && typeof incoming === 'object' && !Array.isArray(incoming)
      ? { ...(incoming as Record<string, unknown>) }
      : {};
  const prevRhema = readRhema(base);
  const hasIncomingRhema = Object.prototype.hasOwnProperty.call(next, 'rhemanotes');
  const incomingRhema = hasIncomingRhema ? readRhema({ rhemanotes: next.rhemanotes }) : {};
  const mergedRhema: RhemaStored = {
    apiKey:
      incomingRhema.apiKey && incomingRhema.apiKey.length >= 12
        ? incomingRhema.apiKey
        : prevRhema.apiKey,
    integrationToken:
      incomingRhema.integrationToken && incomingRhema.integrationToken.length >= 16
        ? incomingRhema.integrationToken
        : prevRhema.integrationToken,
  };
  const { rhemanotes: _drop, ...rest } = next;
  return {
    ...base,
    ...rest,
    rhemanotes: mergedRhema,
  };
}

export function redactIntegrations(settings: unknown): Record<string, unknown> {
  const copy =
    settings && typeof settings === 'object' && !Array.isArray(settings)
      ? { ...(settings as Record<string, unknown>) }
      : {};
  const stored = readRhema(copy);
  copy.rhemanotes = publicRhema(stored);
  return copy;
}

export function tokensMatch(expected: string, provided: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function mintIntegrationToken(): string {
  return `awc_rn_${randomBytes(24).toString('base64url')}`;
}

export function buildSermonTranscript(sermon: {
  title?: string | null;
  scripture?: string | null;
  book?: string | null;
  version?: string | null;
  speaker?: string | null;
  date?: string | null;
  outline?: unknown;
  body?: string | null;
}): string {
  const lines: string[] = [];
  const title = String(sermon.title || '').trim();
  if (title) lines.push(title);
  const speaker = String(sermon.speaker || '').trim();
  const date = String(sermon.date || '').trim();
  if (speaker || date) lines.push([speaker, date].filter(Boolean).join(' · '));
  const scripture = String(sermon.scripture || '').trim();
  const version = String(sermon.version || '').trim();
  const book = String(sermon.book || '').trim();
  const ref = [book, scripture].filter(Boolean).join(' ');
  if (ref) lines.push(version ? `${ref} (${version})` : ref);
  const outline = Array.isArray(sermon.outline) ? sermon.outline : [];
  const points = outline
    .map((point) => {
      if (!point || typeof point !== 'object') return '';
      const row = point as { text?: string; missingWord?: string };
      const text = String(row.text || '').trim();
      const word = String(row.missingWord || '').trim();
      if (!text && !word) return '';
      return word ? `${text} (${word})` : text;
    })
    .filter(Boolean);
  if (points.length) {
    lines.push('');
    lines.push('Outline');
    points.forEach((point, index) => lines.push(`${index + 1}. ${point}`));
  }
  const body = String(sermon.body || '').trim();
  if (body) {
    lines.push('');
    lines.push(body);
  }
  return lines.join('\n').slice(0, SERMON_BODY_MAX);
}

export function rhemaNotesBaseUrl(): string {
  return String(process.env.RHEMANOTES_APP_URL || 'https://rhemanotes.biblefunland.com').replace(
    /\/$/,
    ''
  );
}

const SHARE_TOKEN_RE = /^[a-f0-9]{24}$/i;

export type RhemaGuideCard = {
  id: string;
  title: string;
  theme: string;
  speaker: string;
  summary: string;
  dayCount: number;
  publishedAt: string;
  shareToken: string;
  shareUrl: string;
};

export type RhemaGuideDay = {
  dayNumber: number;
  title: string;
  scriptureReference: string;
  scriptureText: string;
  observation: string;
  application: string;
  prayer: string;
  challenge: string;
  groupDiscussion: string;
};

export type RhemaStudyGuide = RhemaGuideCard & {
  keyVerse: string;
  keyVerseReference: string;
  centralMessage: string;
  keyPoints: string[];
  quotes: string[];
  applications: string[];
  prayers: string[];
  reflections: string[];
  scriptures: Array<{ reference: string; note: string }>;
  days: RhemaGuideDay[];
  coverUrl: string | null;
};

function clip(value: unknown, max: number): string {
  return String(value ?? '').trim().slice(0, max);
}

function clipList(value: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => clip(item, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

function shareUrlFor(token: string): string {
  return `${rhemaNotesBaseUrl()}/share/${token}`;
}

/** Only a RhemaNotes share link can be stored on a Vault sermon. */
export function acceptRhemaStudyGuideUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    throw new Error('Study guide link is not valid.');
  }
  if (url.protocol !== 'https:') throw new Error('Study guide link must use https.');
  const allowed = new Set(['rhemanotes.biblefunland.com']);
  try {
    allowed.add(new URL(rhemaNotesBaseUrl()).host);
  } catch {
    /* keep the default host */
  }
  if (!allowed.has(url.host) || !/^\/share\/[a-f0-9]{24}$/i.test(url.pathname)) {
    throw new Error('Study guide link must be a RhemaNotes share link.');
  }
  url.search = '';
  url.hash = '';
  return url.toString().slice(0, 500);
}

function publicCoverUrl(value: unknown): string | null {
  const raw = clip(value, 500);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    if (url.hostname !== 'gzgqzgfkwbcqsthffmob.supabase.co') return null;
    if (!url.pathname.startsWith('/storage/v1/object/public/')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function cardFromCommunity(row: Record<string, unknown>): RhemaGuideCard | null {
  const token = clip(row.share_token, 24);
  const id = clip(row.id, 80);
  if (!SHARE_TOKEN_RE.test(token) || !id) return null;
  const overview =
    row.study_overview && typeof row.study_overview === 'object'
      ? (row.study_overview as Record<string, unknown>)
      : {};
  return {
    id,
    title: clip(row.title, 200) || 'Study guide',
    theme: clip(row.theme, 300),
    speaker: clip(overview.speaker, 120),
    summary: clip(overview.central_message, 600),
    dayCount: Number(row.day_count) > 0 ? Math.min(14, Number(row.day_count)) : 0,
    publishedAt: clip(row.library_published_at, 40),
    shareToken: token,
    shareUrl: shareUrlFor(token),
  };
}

function dayFromShare(row: Record<string, unknown>): RhemaGuideDay | null {
  const dayNumber = Number(row.day_number);
  if (!Number.isFinite(dayNumber) || dayNumber < 1 || dayNumber > 14) return null;
  return {
    dayNumber,
    title: clip(row.title, 200),
    scriptureReference: clip(row.scripture_reference, 120),
    scriptureText: clip(row.scripture_text, 2000),
    observation: clip(row.observation, 2000),
    application: clip(row.application, 2000),
    prayer: clip(row.prayer, 2000),
    challenge: clip(row.challenge, 2000),
    groupDiscussion: clip(row.group_discussion, 2000),
  };
}

/** Published RhemaNotes study guides. Reads the public library, not private sermons. */
export async function listRhemaStudyGuides(): Promise<RhemaGuideCard[]> {
  const response = await fetch(`${rhemaNotesBaseUrl()}/api/community`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  const payload = (await response.json().catch(() => null)) as { plans?: unknown } | null;
  if (!response.ok || !Array.isArray(payload?.plans)) {
    throw new Error('Could not load study guides from RhemaNotes.');
  }
  return payload.plans
    .map((row) => (row && typeof row === 'object' ? cardFromCommunity(row as Record<string, unknown>) : null))
    .filter((row): row is RhemaGuideCard => Boolean(row));
}

/** One shared study guide, including the weekday plan. */
export async function getRhemaStudyGuide(token: string): Promise<RhemaStudyGuide | null> {
  const shareToken = clip(token, 24);
  if (!SHARE_TOKEN_RE.test(shareToken)) return null;
  const response = await fetch(`${rhemaNotesBaseUrl()}/api/share/${shareToken}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  const payload = (await response.json().catch(() => null)) as { plan?: unknown } | null;
  if (response.status === 404 || !payload?.plan || typeof payload.plan !== 'object') return null;
  if (!response.ok) throw new Error('Could not open that study guide.');
  const plan = payload.plan as Record<string, unknown>;
  if (!plan.share_enabled) return null;
  const overview =
    plan.study_overview && typeof plan.study_overview === 'object'
      ? (plan.study_overview as Record<string, unknown>)
      : {};
  const sermon =
    plan.sermon && typeof plan.sermon === 'object' ? (plan.sermon as Record<string, unknown>) : {};
  const days = Array.isArray(plan.days)
    ? plan.days
        .map((day) => (day && typeof day === 'object' ? dayFromShare(day as Record<string, unknown>) : null))
        .filter((day): day is RhemaGuideDay => Boolean(day))
        .sort((a, b) => a.dayNumber - b.dayNumber)
    : [];
  const scriptures = Array.isArray(overview.scripture_references)
    ? overview.scripture_references
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const row = item as Record<string, unknown>;
          const reference = clip(row.reference, 80);
          const note = clip(row.note, 240);
          if (!reference) return null;
          return { reference, note };
        })
        .filter((item): item is { reference: string; note: string } => Boolean(item))
        .slice(0, 20)
    : [];
  return {
    id: clip(plan.id, 80),
    title: clip(plan.title, 200) || 'Study guide',
    theme: clip(plan.theme, 300),
    speaker: clip(overview.speaker, 120) || clip(sermon.speaker, 120),
    summary: clip(plan.summary, 4000),
    dayCount: days.length || (Number(plan.day_count) > 0 ? Math.min(14, Number(plan.day_count)) : 0),
    publishedAt: clip(plan.library_published_at, 40),
    shareToken,
    shareUrl: shareUrlFor(shareToken),
    keyVerse: clip(plan.key_verse, 400),
    keyVerseReference: clip(plan.key_verse_reference, 80),
    centralMessage: clip(overview.central_message, 800),
    keyPoints: clipList(overview.key_points, 12, 400),
    quotes: clipList(overview.notable_quotes, 8, 400),
    applications: clipList(overview.application_points, 8, 400),
    prayers: clipList(overview.prayer_points, 8, 400),
    reflections: clipList(overview.reflection_questions, 8, 400),
    scriptures,
    days,
    coverUrl: publicCoverUrl(sermon.cover_image_url),
  };
}

type MemberRow = {
  id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  preferred_name?: string | null;
  email?: string | null;
  status?: string | null;
};

export async function listRhemaMembers(supabase: SupabaseClient): Promise<
  Array<{ id: string; email: string; displayName: string }>
> {
  const { data, error } = await supabase
    .from('members')
    .select('id, first_name, last_name, preferred_name, email, status')
    .not('email', 'is', null)
    .limit(500);
  if (error) throw error;
  const out: Array<{ id: string; email: string; displayName: string }> = [];
  for (const row of (data || []) as MemberRow[]) {
    const status = String(row.status || '').trim().toLowerCase();
    if (INACTIVE.has(status)) continue;
    const email = String(row.email || '').trim().toLowerCase();
    const id = String(row.id || '').trim();
    if (!id || !email.includes('@')) continue;
    const preferred = String(row.preferred_name || '').trim();
    const first = String(row.first_name || '').trim();
    const last = String(row.last_name || '').trim();
    const displayName = [preferred || first, last].filter(Boolean).join(' ') || email;
    out.push({ id, email, displayName });
  }
  return out;
}
