import React, { useEffect, useState } from 'react';
import { useLocation, useSearchParams, Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useNav } from '../../lib/NavContext';
import { signedInAppUrl } from '../../lib/awcOne';

const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

/**
 * The Vault's Chat now lives in PLCC Chat. Opens it signed in (one sign-on handoff),
 * keeping a deep link to a room (?channel=…) when there is one.
 */
const OpenAwcChat: React.FC = () => {
  const { isAuthenticated } = useNav();
  const [params] = useSearchParams();
  const location = useLocation();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const channel = String(params.get('channel') || '').trim();
    const room = channel && ID_RE.test(channel) ? `/community/chat/${channel}` : '/community/chat';
    // Keep a huddle invite's one-tap Join card (?huddle=join) in PLCC Chat.
    const rawIntent = String(params.get('huddle') || '').trim();
    const intent = rawIntent === '1' ? 'join' : rawIntent; // Canaan invites use huddle=1
    const next = room !== '/community/chat' && (intent === 'join' || intent === 'start') ? `${room}?huddle=${intent}` : room;
    const t = window.setTimeout(() => setSlow(true), 8000);
    void signedInAppUrl('chat', isAuthenticated, next).then((url) => {
      if (!cancelled) window.location.replace(url);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  return (
    <div className="flex-1 min-h-[60vh] flex flex-col items-center justify-center gap-4 px-6 text-center">
      <Loader2 className="animate-spin text-burgundy" size={40} aria-hidden />
      <p className="text-lg font-bold text-[#0d1a14]" role="status">Opening PLCC Chat…</p>
      {slow ? (
        <p className="text-sm text-gray-600">
          Taking a while?{' '}
          <a href="https://plcc-chat.vercel.app/community/chat" className="font-bold text-burgundy underline">Open PLCC Chat</a>
          {' '}or use the{' '}
          <Link to="/community/chat-classic" className="font-bold text-burgundy underline">older Canaan chat</Link>.
        </p>
      ) : null}
    </div>
  );
};

export default OpenAwcChat;
