/**
 * PLCC ONE — the app launcher. One sign-in (the Vault's) opens every PLCC app.
 *
 * Connect (and PLCC Ark, which Connect serves at /ark) and PLCC Chat share the Vault's
 * Supabase tenant, so the launcher asks the Vault API for a single-use sign-in token
 * and the app finishes sign-in at its /auth/sso page. Tithe needs no sign-in to give.
 * Sanctum (corporate prayer rooms) runs on its own stack and keeps its own sign-in.
 * The Digital Contribution Book is intentionally not on the launcher.
 */
import { authedFetch } from './authedFetch';

export type AwcOneAppId = 'chat' | 'vault' | 'connect' | 'sanctum' | 'tithe' | 'ark';

export interface AwcOneApp {
  id: AwcOneAppId;
  name: string;
  /** Short line under the name on the larger tiles. */
  blurb: string;
  icon: string;
  /** Icon height on the phone tile, in px (the artwork has different shapes). */
  iconH: number;
}

const env = import.meta.env;
const trimSlash = (s: string) => s.replace(/\/+$/, '');

export const CONNECT_ORIGIN = trimSlash(env.VITE_CONNECT_ORIGIN || 'https://plcc-connect.vercel.app');
export const CHAT_ORIGIN = trimSlash(env.VITE_CHAT_ORIGIN || 'https://plcc-chat.vercel.app');
/** Sanctum Live — PLCC's corporate prayer rooms (its own sign-in for now). */
export const SANCTUM_URL = env.VITE_SANCTUM_URL || 'https://plcc-sanctum.onrender.com/dashboard';
export const TITHE_URL = env.VITE_TITHE_URL || 'https://plcc-tithe.vercel.app/';
/** Set VITE_AWC_ONE_SSO=false to open the apps without the sign-on handoff. */
const SSO_ENABLED = env.VITE_AWC_ONE_SSO !== 'false';

export const AWC_ONE_APPS: AwcOneApp[] = [
  { id: 'chat', name: 'PLCC Chat', blurb: 'Communication & Live Calls', icon: '/images/awc-one/icon-chat.webp', iconH: 50 },
  { id: 'vault', name: 'PLCC Canaan', blurb: 'Church Administration', icon: '/images/awc-one/icon-vault.webp', iconH: 54 },
  { id: 'connect', name: 'PLCC Connect', blurb: 'Members & Community', icon: '/images/awc-one/icon-connect.webp', iconH: 46 },
  { id: 'sanctum', name: 'PLCC Sanctum', blurb: 'Corporate Prayer Rooms', icon: '/images/awc-one/icon-chat.webp', iconH: 50 },
  { id: 'tithe', name: 'PLCC Tithe', blurb: 'Giving & Contributions', icon: '/images/awc-one/icon-tithe.webp', iconH: 52 },
];

/** Where each app opens when there is no sign-on handoff. */
export function plainAppUrl(id: AwcOneAppId): string {
  switch (id) {
    case 'chat': return `${CHAT_ORIGIN}/community/chat`;
    case 'connect': return `${CONNECT_ORIGIN}/`;
    case 'ark': return `${CONNECT_ORIGIN}/ark/`;
    case 'sanctum': return SANCTUM_URL;
    case 'tithe': return TITHE_URL;
    case 'vault': return '/#/dashboard';
  }
}

function ssoTarget(id: AwcOneAppId): { target: 'connect' | 'chat'; origin: string; next: string } | null {
  if (id === 'connect') return { target: 'connect', origin: CONNECT_ORIGIN, next: '/' };
  if (id === 'ark') return { target: 'connect', origin: CONNECT_ORIGIN, next: '/ark' };
  if (id === 'chat') return { target: 'chat', origin: CHAT_ORIGIN, next: '/community/chat' };
  return null;
}

/**
 * The URL to open an app already signed in. Falls back to the plain URL when the
 * member isn't signed in, signs in by phone only, or the handoff is unavailable.
 */
export async function signedInAppUrl(id: AwcOneAppId, signedIn: boolean, nextPath?: string): Promise<string> {
  const base = ssoTarget(id);
  const sso = base && nextPath && nextPath.startsWith('/') && !nextPath.startsWith('//') ? { ...base, next: nextPath } : base;
  if (!sso || !signedIn || !SSO_ENABLED) return sso && nextPath ? `${sso.origin}${sso.next}` : plainAppUrl(id);
  try {
    const res = await authedFetch('/api/vault?resource=sso', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: sso.target }),
    });
    const body = await res.json().catch(() => null);
    const tokenHash = res.ok && body?.ok ? String(body.tokenHash || '') : '';
    if (!tokenHash) return nextPath ? `${sso.origin}${sso.next}` : plainAppUrl(id);
    const hash = new URLSearchParams({ th: tokenHash, next: sso.next }).toString();
    return `${sso.origin}/auth/sso#${hash}`;
  } catch {
    return nextPath ? `${sso.origin}${sso.next}` : plainAppUrl(id);
  }
}

/**
 * Chat moved to PLCC Chat. Off until VITE_CHAT_MOVED=true is set in Vercel (then redeploy);
 * while off, the Vault keeps its own Chat. The old Chat stays at /community/chat-classic.
 */
export const CHAT_MOVED = env.VITE_CHAT_MOVED === 'true';

export function firstNameOf(name?: string | null): string {
  const n = String(name || '').trim();
  if (!n || n.includes('@')) return '';
  return n.split(/\s+/)[0];
}

const PENDING_KEY = 'awc_one_pending_app';

/** A tile tapped before sign-in: open that app right after the member signs in. */
export function rememberPendingApp(id: AwcOneAppId): void {
  try { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ id, at: Date.now() })); } catch { /* private mode */ }
}

export function takePendingApp(): AwcOneAppId | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    if (!raw) return null;
    const { id, at } = JSON.parse(raw) || {};
    // Only honour a tap from the last 15 minutes.
    if (!at || Date.now() - Number(at) > 15 * 60 * 1000) return null;
    return AWC_ONE_APPS.some((a) => a.id === id) ? (id as AwcOneAppId) : null;
  } catch {
    return null;
  }
}
