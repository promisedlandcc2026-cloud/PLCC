import { useCallback, useEffect, useState } from 'react';
import {
  listPasskeys,
  registerPasskey,
  deletePasskey,
  listMfaFactors,
  startMfaEnroll,
  confirmMfaEnroll,
  removeMfaFactor,
  type PasskeyInfo,
  type MfaFactor,
  type MfaEnrollStart,
} from '../../../lib/authSecurity';
import { errorMessage } from './ui';

export type SecurityPanel = 'mfa' | 'passkey';

/** Passkeys + authenticator-app (TOTP) state for the signed-in user. */
export function useAccountSecurity(userId: string | null | undefined) {
  const [panel, setPanel] = useState<SecurityPanel | null>(null);
  const [passkeys, setPasskeys] = useState<PasskeyInfo[]>([]);
  const [mfaFactors, setMfaFactors] = useState<MfaFactor[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mfaEnroll, setMfaEnroll] = useState<MfaEnrollStart | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    Promise.all([listPasskeys(), listMfaFactors()])
      .then(([keys, factors]) => {
        if (cancelled) return;
        setPasskeys(keys);
        setMfaFactors(factors);
      })
      .catch((err) => console.warn('[Security] status load failed', err));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const run = async (fallback: string, task: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(errorMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  };

  const openPanel = async (next: SecurityPanel) => {
    setPanel(next);
    setError(null);
    setMfaEnroll(null);
    setLoading(true);
    try {
      if (next === 'passkey') setPasskeys(await listPasskeys());
      else setMfaFactors(await listMfaFactors());
    } catch (err) {
      setError(errorMessage(err, 'Could not load security settings'));
    } finally {
      setLoading(false);
    }
  };

  const closePanel = useCallback(() => {
    setPanel((current) => (busy ? current : null));
  }, [busy]);

  const addPasskey = () =>
    run('Could not add passkey. Check Supabase Passkeys settings (site address must match).', async () => {
      const label =
        typeof window !== 'undefined'
          ? `${window.navigator.platform || 'Device'} · ${new Date().toLocaleDateString()}`
          : 'My device';
      await registerPasskey(label);
      setPasskeys(await listPasskeys());
    });

  const removePasskey = async (id: string) => {
    if (!confirm('Remove this passkey from your account?')) return;
    await run('Could not remove passkey', async () => {
      await deletePasskey(id);
      setPasskeys(await listPasskeys());
    });
  };

  const startMfa = () =>
    run('Could not start 2-step setup', async () => {
      setMfaEnroll(await startMfaEnroll('PLCC-Canaan'));
    });

  /** Returns true when the factor was verified and turned on. */
  const confirmMfa = async (code: string): Promise<boolean> => {
    if (!mfaEnroll || code.trim().length < 6) return false;
    let ok = false;
    await run('That code did not work', async () => {
      await confirmMfaEnroll(mfaEnroll.factorId, code);
      setMfaEnroll(null);
      setMfaFactors(await listMfaFactors());
      ok = true;
    });
    return ok;
  };

  const removeMfa = async (id: string) => {
    if (!confirm('Turn off 2-step authentication for this app?')) return;
    await run('Could not turn off 2-step', async () => {
      await removeMfaFactor(id);
      setMfaFactors(await listMfaFactors());
    });
  };

  return {
    panel,
    openPanel,
    closePanel,
    passkeys,
    mfaFactors,
    loading,
    busy,
    error,
    setError,
    mfaEnroll,
    addPasskey,
    removePasskey,
    startMfa,
    confirmMfa,
    removeMfa,
  };
}

export type AccountSecurity = ReturnType<typeof useAccountSecurity>;
