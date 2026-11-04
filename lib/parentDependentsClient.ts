/**
 * Parent self-serve children API client — no child login/email/phone.
 */
import { supabase } from './supabase';

const DEPENDENTS_API = '/api/vault?resource=family&subResource=dependents';

export type KidsTheme = 'soft_garden' | 'adventure';

export const KIDS_THEME_OPTIONS: Array<{ value: KidsTheme; label: string }> = [
  { value: 'soft_garden', label: 'Soft Garden' },
  { value: 'adventure', label: 'Adventure' },
];

export type KidsBadgeCategory = 'checkins' | 'streak' | 'points' | 'midweek';
export type KidsBadgeTier = 'bronze' | 'silver' | 'gold' | 'diamond';

export type KidsBadge = {
  id: string;
  name: string;
  description: string;
  category: KidsBadgeCategory;
  tier: KidsBadgeTier;
  goal: number;
  progress: number;
  earned: boolean;
  earnedAt: string | null;
};

export type KidsLevel = {
  level: number;
  title: string;
  points: number;
  levelStart: number;
  nextLevelAt: number | null;
};

export type BucksHistoryLine = {
  id: string;
  kind: 'award' | 'reversal' | 'redemption' | 'recovery';
  amount: number;
  reasonLabel: string;
  awardedBy: string;
  createdAt: string;
  reversed: boolean;
};

export type BucksWallet = {
  balance: number;
  totalEarned: number;
  history: BucksHistoryLine[];
  onHold?: number;
  outstandingCorrection?: number;
  requests?: Array<{ id: string; prizeName: string; price: number; status: string }>;
  challenge?: { id: string; title: string; verseRef?: string | null; details?: string | null; bucks?: number; completed?: boolean } | null;
};

export type KidsViewData = {
  child: { id: string; firstName: string; name: string; age: number | null; theme: KidsTheme };
  stats: {
    weekStreak: number;
    totalCheckins: number;
    lastCheckinAt: string | null;
    lifetimePoints: number;
    pointsThisWeek: number;
  };
  weeklyPoints: Array<{ weekStart: string; points: number }>;
  card: { qrPayload: string; cardNumber: string | null } | null;
  /** PLCC Bucks wallet; null until the Bucks migration has run. */
  bucks: BucksWallet | null;
  badges: KidsBadge[];
  level: KidsLevel;
  themeReady: boolean;
};

export type ParentDependent = {
  id: string;
  firstName?: string;
  lastName?: string;
  name: string;
  age?: string | null;
  birthday?: string | null;
  notes?: string | null;
  kidsTheme?: KidsTheme | null;
  /** PLCC Bucks balance; null when Bucks is not set up yet. */
  bucksBalance?: number | null;
  /** Same display name the family summary shows (preferred name + last name). */
  displayName?: string;
  structured: boolean;
  needsPromote: boolean;
  legacyIndex?: number;
  /** Linked to you by the church office (not in your household); only the office can remove. */
  guardianOnly?: boolean;
};

export class ParentDependentError extends Error {
  code?: string;
  status: number;
  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.name = 'ParentDependentError';
    this.status = status;
    this.code = code;
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ParentDependentError('Please sign in again.', 401, 'unauthorized');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function parseJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function listParentDependents(): Promise<{
  structured: ParentDependent[];
  legacyOnly: ParentDependent[];
}> {
  const headers = await authHeaders();
  const res = await fetch(`${DEPENDENTS_API}&action=list`, { headers });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new ParentDependentError(
      body?.error || 'Could not load children.',
      res.status,
      body?.code
    );
  }
  return {
    structured: Array.isArray(body.structured) ? body.structured : [],
    legacyOnly: Array.isArray(body.legacyOnly) ? body.legacyOnly : [],
  };
}

export async function createParentDependent(input: {
  firstName: string;
  lastName?: string;
  age?: string;
  notes?: string;
  birthday?: string;
  legacyIndex?: number;
}): Promise<{ child: ParentDependent; childrenJson?: any[]; summary?: any }> {
  const headers = await authHeaders();
  const res = await fetch(`${DEPENDENTS_API}&action=create`, {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new ParentDependentError(
      body?.error || 'Could not add child.',
      res.status,
      body?.code
    );
  }
  return {
    child: body.child,
    childrenJson: body.childrenJson,
    summary: body.summary,
  };
}

export async function updateParentDependent(input: {
  childId: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  age?: string;
  notes?: string;
  kidsTheme?: KidsTheme;
  remove?: boolean;
}): Promise<{ childrenJson?: any[] }> {
  const headers = await authHeaders();
  const res = await fetch(`${DEPENDENTS_API}&action=${input.remove ? 'remove' : 'update'}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(input),
  });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new ParentDependentError(
      body?.error || 'Could not update child.',
      res.status,
      body?.code
    );
  }
  return { childrenJson: body.childrenJson };
}

export type ParentPrize = { id: string; name: string; description?: string | null; price: number; inStock?: boolean };

export async function fetchParentPrizes(): Promise<ParentPrize[]> {
  const headers = await authHeaders();
  const res = await fetch(`${DEPENDENTS_API}&action=bucks-prizes`, { headers });
  const body = await parseJson(res);
  if (!res.ok) throw new ParentDependentError(body?.error || 'Could not load prizes.', res.status, body?.code);
  return (body.prizes || []) as ParentPrize[];
}

export async function requestParentPrize(input: { childId?: string; cardRef?: string; prizeId: string; idempotencyKey: string }) {
  const headers = await authHeaders();
  const res = await fetch(`${DEPENDENTS_API}&action=bucks-request`, {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });
  const body = await parseJson(res);
  if (!res.ok) throw new ParentDependentError(body?.error || 'Could not request that prize.', res.status, body?.code);
  return body as { ok: true; status?: string; duplicate?: boolean };
}

export async function fetchKidsView(childId: string): Promise<KidsViewData> {
  const headers = await authHeaders();
  const res = await fetch(
    `${DEPENDENTS_API}&action=kids-view&childId=${encodeURIComponent(childId)}`,
    { headers }
  );
  const body = await parseJson(res);
  if (!res.ok) {
    throw new ParentDependentError(body?.error || 'Could not load Kids View.', res.status, body?.code);
  }
  return body as KidsViewData;
}
