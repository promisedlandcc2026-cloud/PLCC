/**
 * Vault staff card scanner — authenticated resolver client.
 * POST /api/vault?resource=people&subResource=card-resolver
 * Body: { token } only. Never puts token in query/URL/storage.
 */

import { ApiError, apiFetch } from './api';
import {
  isValidCardToken,
  mapResolverResponse,
  type ScannerUiState,
} from './cardScannerUi';

export const CARD_RESOLVER_PATH =
  '/api/vault?resource=people&subResource=card-resolver';

export async function resolveAwcDigitalCard(token: string): Promise<ScannerUiState> {
  if (!isValidCardToken(token)) {
    return { kind: 'malformed' };
  }

  try {
    const body = await apiFetch<{ ok?: boolean; result?: unknown; code?: string; error?: string }>(
      CARD_RESOLVER_PATH,
      {
        method: 'POST',
        body: JSON.stringify({ token }),
      }
    );
    return mapResolverResponse(200, body);
  } catch (err) {
    if (err instanceof ApiError) {
      return mapResolverResponse(err.status, err.body);
    }
    return { kind: 'unavailable' };
  }
}
