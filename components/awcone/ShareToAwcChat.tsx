import React, { useState } from 'react';
import { Loader2, MessageCircle } from 'lucide-react';
import { useNav } from '../../lib/NavContext';
import { signedInAppUrl } from '../../lib/awcOne';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Post an event or Serve need into an PLCC Chat room as a card (opens PLCC Chat signed in). */
export const ShareToAwcChat: React.FC<{ kind: 'event' | 'serve'; id: string | null | undefined; compact?: boolean }> = ({ kind, id, compact }) => {
  const { isAuthenticated } = useNav();
  const [busy, setBusy] = useState(false);
  if (!id || !UUID_RE.test(String(id))) return null;
  const open = async () => {
    setBusy(true);
    const next = `/share?${new URLSearchParams({ kind, id: String(id) }).toString()}`;
    const url = await signedInAppUrl('chat', isAuthenticated, next);
    // Same tab: phones block pop-ups opened after a wait.
    window.location.assign(url);
    window.setTimeout(() => setBusy(false), 8000);
  };
  return (
    <button
      type="button"
      onClick={() => void open()}
      disabled={busy}
      className={
        compact
          ? 'inline-flex items-center gap-1 text-xs font-bold text-burgundy hover:underline disabled:opacity-60'
          : 'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-burgundy/30 text-burgundy text-xs font-bold hover:bg-burgundy/5 disabled:opacity-60'
      }
    >
      {busy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <MessageCircle size={13} aria-hidden />}
      Share to PLCC Chat
    </button>
  );
};
