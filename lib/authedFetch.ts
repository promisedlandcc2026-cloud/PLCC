import { vaultFetch } from './api';

/**
 * fetch() that attaches the signed-in user's Supabase access token.
 * Use for every /api/vault call that needs a logged-in user — the server
 * rejects tools/forms/follow-up requests without a valid Bearer token.
 * 401s go through vaultFetch's single shared refresh + one retry.
 */
export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  return vaultFetch(input, init);
}
