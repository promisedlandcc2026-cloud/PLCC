import { Role } from '../types';

const PREVIEW_KEY = 'awc_local_ui_preview';

/** True only on local Vite hosts — never on deployed domains. */
export function isLocalDevHost(): boolean {
  if (typeof window === 'undefined') return false;
  return /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
}

export function isLocalUiPreviewActive(): boolean {
  if (!isLocalDevHost()) return false;
  try {
    return sessionStorage.getItem(PREVIEW_KEY) === '1';
  } catch {
    return false;
  }
}

export function enableLocalUiPreview(): void {
  if (!isLocalDevHost()) return;
  try {
    sessionStorage.setItem(PREVIEW_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function clearLocalUiPreview(): void {
  try {
    sessionStorage.removeItem(PREVIEW_KEY);
  } catch {
    /* ignore */
  }
}

/** Synthetic profile so ProtectedRoute can open Dashboard without a Supabase JWT. */
export const LOCAL_UI_PREVIEW_PROFILE = {
  id: 'local-ui-preview',
  email: 'preview@localhost',
  name: 'Local Preview',
  role: Role.SUPER_ADMIN,
  title: 'UI Preview',
  avatar_url: '',
  birthday: '',
  localPreview: true as const,
};
