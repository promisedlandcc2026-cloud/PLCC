/**
 * Phase 2.7D.6 — Kids Family Pass custody client (Vault API only).
 */

import { ApiError, apiFetch } from './api';

const BASE = '/api/vault?resource=attendance';

export type KidsCustodyGuardian = {
  guardianUserId: string;
  guardianMemberId: string | null;
  displayName: string;
  relationshipType: string;
};

export type KidsCustodyLookupResult = {
  childMemberId: string;
  childDisplayName: string;
  sessionId: string;
  mode: 'in' | 'out';
  custodyStatus: 'in' | 'none';
  custodyId: string | null;
  checkedInAt: string | null;
  guardians: KidsCustodyGuardian[];
};

function mapErr(err: unknown, fallback: string): Error {
  if (err instanceof ApiError) {
    const body = err.body as { error?: string; code?: string } | null;
    return new Error(body?.error || err.message || fallback);
  }
  if (err instanceof Error) return err;
  return new Error(fallback);
}

export async function lookupKidsCustodyByCard(input: {
  sessionId: string;
  mode: 'in' | 'out';
  token: string;
}): Promise<KidsCustodyLookupResult> {
  try {
    const body = await apiFetch<KidsCustodyLookupResult & { ok: boolean }>(
      `${BASE}&subResource=kids-custody-lookup`,
      {
        method: 'POST',
        body: JSON.stringify({
          sessionId: input.sessionId,
          mode: input.mode,
          token: input.token,
        }),
      }
    );
    return {
      childMemberId: String(body.childMemberId || ''),
      childDisplayName: String(body.childDisplayName || 'Child'),
      sessionId: String(body.sessionId || ''),
      mode: body.mode === 'out' ? 'out' : 'in',
      custodyStatus: body.custodyStatus === 'in' ? 'in' : 'none',
      custodyId: body.custodyId ?? null,
      checkedInAt: body.checkedInAt ?? null,
      guardians: Array.isArray(body.guardians) ? body.guardians : [],
    };
  } catch (err) {
    throw mapErr(err, 'Could not look up that child card.');
  }
}

export async function kidsCustodyCheckin(input: {
  sessionId: string;
  childMemberId: string;
  guardianUserId: string;
}): Promise<{ custodyId: string; checkedInAt: string }> {
  try {
    const body = await apiFetch<{
      ok: boolean;
      custodyId: string;
      checkedInAt: string;
    }>(`${BASE}&subResource=kids-custody-checkin`, {
      method: 'POST',
      body: JSON.stringify({
        sessionId: input.sessionId,
        childMemberId: input.childMemberId,
        guardianUserId: input.guardianUserId,
        source: 'digital_card',
      }),
    });
    return {
      custodyId: String(body.custodyId || ''),
      checkedInAt: String(body.checkedInAt || ''),
    };
  } catch (err) {
    throw mapErr(err, 'Check-in failed.');
  }
}

export async function kidsCustodyCheckout(input: {
  custodyId: string;
  guardianUserId: string;
}): Promise<{ checkedOutAt: string }> {
  try {
    const body = await apiFetch<{ ok: boolean; checkedOutAt: string }>(
      `${BASE}&subResource=kids-custody-checkout`,
      {
        method: 'POST',
        body: JSON.stringify({
          custodyId: input.custodyId,
          guardianUserId: input.guardianUserId,
        }),
      }
    );
    return { checkedOutAt: String(body.checkedOutAt || '') };
  } catch (err) {
    throw mapErr(err, 'Check-out failed.');
  }
}

export async function fetchKidsCustodyOpenCount(sessionId: string): Promise<number> {
  try {
    const body = await apiFetch<{ ok: boolean; openCount: number }>(
      `${BASE}&subResource=kids-custody-open&sessionId=${encodeURIComponent(sessionId)}`,
      { method: 'GET' }
    );
    return Number(body.openCount) || 0;
  } catch {
    return 0;
  }
}

export type KidsCustodyOpenRecord = {
  id: string;
  sessionId: string;
  sessionTitle: string;
  childMemberId: string;
  childDisplayName: string;
  checkedInAt: string;
  source: string;
};

/** Open custody rows across open kids sessions — for Who checked in → Kids. */
export async function fetchKidsCustodyOpenList(): Promise<KidsCustodyOpenRecord[]> {
  try {
    const body = await apiFetch<{ ok?: boolean; records?: KidsCustodyOpenRecord[] }>(
      `${BASE}&subResource=kids-custody-open&list=1`,
      { method: 'GET' }
    );
    return Array.isArray(body.records) ? body.records : [];
  } catch {
    return [];
  }
}
