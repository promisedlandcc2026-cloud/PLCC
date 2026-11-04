import React from 'react';
import { Sparkles } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useNav } from '../../App';
import { getAskAdminHintForPath } from '../../lib/askAdminPageHints';

type Props = {
  /** Override catalog question for this page. */
  prompt?: string;
  className?: string;
};

/**
 * Compact Ask Admin control for page titles.
 * Opens the topbar drawer and auto-asks a how-to for the current route.
 */
const AskAdminTitleLink: React.FC<Props> = ({ prompt, className = '' }) => {
  const { openAskAdmin } = useNav();
  const location = useLocation();
  const hint = (prompt || getAskAdminHintForPath(location.pathname) || '').trim();
  if (!hint) return null;

  return (
    <button
      type="button"
      onClick={() => openAskAdmin(hint)}
      className={`inline-flex items-center gap-1.5 shrink-0 rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-widest text-burgundy/70 hover:text-burgundy hover:bg-burgundy/5 border border-transparent hover:border-burgundy/15 transition-colors min-h-[32px] ${className}`}
      title={hint}
      aria-label={`Ask Admin: ${hint}`}
    >
      <Sparkles size={12} className="text-gold shrink-0" />
      Ask Admin
    </button>
  );
};

export default AskAdminTitleLink;
