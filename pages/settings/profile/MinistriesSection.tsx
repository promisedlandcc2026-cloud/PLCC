import React, { useMemo, useState } from 'react';
import { Check, Loader2, Search, Users, Users2 } from 'lucide-react';
import { EmptyState, SectionCard } from './ui';
import type { LoadStatus, Team } from './useProfileForm';

type Props = {
  teams: Team[];
  status: LoadStatus;
  selected: string[];
  onToggle: (teamId: string) => void;
  onViewTeams: () => void;
};

/** Show a filter box once the list gets long enough to scroll on a phone. */
const FILTER_THRESHOLD = 12;

const MinistriesSection: React.FC<Props> = ({ teams, status, selected, onToggle, onViewTeams }) => {
  const [query, setQuery] = useState('');
  const selectedCount = useMemo(() => teams.filter((t) => selected.includes(t.id)).length, [teams, selected]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return teams;
    return teams.filter((t) => String(t.name || '').toLowerCase().includes(q) || selected.includes(t.id));
  }, [teams, query, selected]);

  return (
    <SectionCard
      id="profile-ministries"
      icon={Users}
      iconTone="gold"
      title="Ministry teams"
      subtitle={status === 'ready' && teams.length ? `${selectedCount} selected` : 'Teams you serve on'}
      action={
        <button
          type="button"
          onClick={onViewTeams}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-burgundy bg-burgundy/5 rounded-lg border border-burgundy/10 hover:bg-burgundy hover:text-gold transition-colors"
        >
          <Users2 size={14} />
          View teams
        </button>
      }
    >
      {status === 'loading' ? (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-gray-500 font-medium">
          <Loader2 size={16} className="animate-spin" /> Loading teams…
        </div>
      ) : status === 'error' ? (
        <EmptyState>Couldn't load teams right now. Refresh the page to try again.</EmptyState>
      ) : teams.length === 0 ? (
        <EmptyState>No ministry teams have been set up yet.</EmptyState>
      ) : (
        <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3 space-y-3">
          {teams.length >= FILTER_THRESHOLD && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a team…"
                aria-label="Find a team"
                className="w-full h-9 pl-8 pr-3 rounded-lg bg-white border border-gray-200 text-xs font-semibold text-[#0d1a14] outline-none focus:border-burgundy/30"
              />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {visible.map((team) => {
              const on = selected.includes(team.id);
              return (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => onToggle(team.id)}
                  aria-pressed={on}
                  className={`inline-flex items-center gap-1.5 max-w-full px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    on
                      ? 'bg-burgundy text-gold border-burgundy shadow-sm'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-burgundy/30 hover:text-[#0d1a14]'
                  }`}
                >
                  {on && <Check size={12} className="shrink-0 opacity-90" aria-hidden />}
                  <span className="truncate">{team.name}</span>
                </button>
              );
            })}
            {visible.length === 0 && <p className="text-xs text-gray-500 font-medium px-1">No teams match.</p>}
          </div>
          <p className="text-[11px] text-gray-500 font-medium">Tap a team to join or leave, then save changes.</p>
        </div>
      )}
    </SectionCard>
  );
};

export default MinistriesSection;
