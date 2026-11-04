/**
 * Phase 2.7D.7 — Household check-in client (Vault API only).
 */
import { ApiError, apiFetch } from './api';

const BASE = '/api/vault?resource=attendance';

export type HouseholdPreviewMember = {
  memberId: string;
  displayName: string;
  relationshipType: string | null;
  alreadyCheckedIn: boolean;
  isAnchor: boolean;
};

export type HouseholdPreviewResult = {
  anchorMemberId: string;
  sessionId: string;
  householdId: string | null;
  members: HouseholdPreviewMember[];
  eligibleCount: number;
};

function mapErr(err: unknown, fallback: string): Error {
  if (err instanceof ApiError) {
    const body = err.body as { error?: string } | null;
    return new Error(body?.error || err.message || fallback);
  }
  if (err instanceof Error) return err;
  return new Error(fallback);
}

export async function previewHouseholdByCard(input: {
  sessionId: string;
  token: string;
}): Promise<HouseholdPreviewResult> {
  try {
    const body = await apiFetch<HouseholdPreviewResult & { ok: boolean }>(
      `${BASE}&subResource=household-preview`,
      {
        method: 'POST',
        body: JSON.stringify({ sessionId: input.sessionId, token: input.token }),
      }
    );
    return {
      anchorMemberId: String(body.anchorMemberId || ''),
      sessionId: String(body.sessionId || ''),
      householdId: body.householdId ?? null,
      members: Array.isArray(body.members) ? body.members : [],
      eligibleCount: Number(body.eligibleCount) || 0,
    };
  } catch (err) {
    throw mapErr(err, 'Could not load household for check-in.');
  }
}

export async function checkInHousehold(input: {
  sessionId: string;
  anchorMemberId: string;
  memberIds: string[];
}): Promise<{ checkedInCount: number; alreadyCheckedInCount: number }> {
  try {
    const body = await apiFetch<{
      ok: boolean;
      checkedInCount: number;
      alreadyCheckedInCount: number;
    }>(`${BASE}&subResource=household-checkin`, {
      method: 'POST',
      body: JSON.stringify({
        sessionId: input.sessionId,
        anchorMemberId: input.anchorMemberId,
        memberIds: input.memberIds,
      }),
    });
    return {
      checkedInCount: Number(body.checkedInCount) || 0,
      alreadyCheckedInCount: Number(body.alreadyCheckedInCount) || 0,
    };
  } catch (err) {
    throw mapErr(err, 'Household check-in failed.');
  }
}
