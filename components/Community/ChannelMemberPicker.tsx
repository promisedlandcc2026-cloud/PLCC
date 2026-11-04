import React, { useMemo } from 'react';
import { Loader2, Search, Users, X } from 'lucide-react';

export type PickerPerson = {
  id: string;
  name: string;
  role?: string | null;
  avatar_url?: string | null;
  ministries?: string[];
};

type ChannelMemberPickerProps = {
  people: PickerPerson[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  loading?: boolean;
  search: string;
  onSearchChange: (q: string) => void;
  excludeIds?: string[];
  /** When true and not searching, empty means channel already has everyone eligible. */
  channelScoped?: boolean;
  /** Ministry create: hide church-wide Select All; extras are opt-in only. */
  allowSelectAll?: boolean;
  label?: string;
};

const ChannelMemberPicker: React.FC<ChannelMemberPickerProps> = ({
  people,
  selectedIds,
  onChange,
  loading,
  search,
  onSearchChange,
  excludeIds = [],
  channelScoped = false,
  allowSelectAll = true,
  label = 'Add Members',
}) => {
  const exclude = useMemo(() => new Set(excludeIds), [excludeIds]);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const hasSearch = Boolean(search.trim());

  const visible = useMemo(
    () => people.filter((p) => p.id && !exclude.has(p.id)),
    [people, exclude]
  );

  const selectedPeople = useMemo(
    () => visible.filter((p) => selected.has(p.id)),
    [visible, selected]
  );

  const emptyLabel = hasSearch
    ? 'No eligible members match your search'
    : channelScoped
      ? 'Everyone eligible is already in this channel'
      : 'No eligible members found';

  const toggle = (id: string) => {
    if (selected.has(id)) onChange(selectedIds.filter((x) => x !== id));
    else onChange([...selectedIds, id]);
  };

  const selectAllVisible = () => {
    const ids = new Set(selectedIds);
    visible.forEach((p) => ids.add(p.id));
    onChange([...ids]);
  };

  const clear = () => onChange([]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[10px] font-black text-burgundy uppercase tracking-[0.2em]">
          {label}
        </label>
        <span className="text-[10px] font-bold text-gold uppercase tracking-widest">
          {selectedIds.length} selected
        </span>
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search members…"
          className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gold/30 focus:border-gold/40"
        />
      </div>

      <div className="flex items-center gap-2">
        {allowSelectAll ? (
          <button
            type="button"
            onClick={selectAllVisible}
            className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-gold-cream text-gold border border-gold/20 hover:bg-gold hover:text-white transition-all"
          >
            Select All
          </button>
        ) : null}
        <button
          type="button"
          onClick={clear}
          className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest text-gray-400 hover:text-burgundy border border-transparent hover:border-gray-100 transition-all"
        >
          Clear
        </button>
      </div>

      {selectedPeople.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 max-w-full">
          {selectedPeople.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-start gap-1.5 max-w-full pl-1 pr-2 py-1 rounded-xl bg-burgundy/5 border border-burgundy/10 text-[11px] font-semibold text-[#0d1a14]"
            >
              <span className="w-5 h-5 mt-0.5 rounded-full bg-burgundy text-gold text-[9px] font-black flex items-center justify-center overflow-hidden shrink-0">
                {p.avatar_url ? (
                  <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  (p.name || '?').charAt(0)
                )}
              </span>
              <span className="min-w-0 break-words whitespace-normal leading-snug">{p.name}</span>
              <button
                type="button"
                onClick={() => toggle(p.id)}
                aria-label={`Remove ${p.name}`}
                className="mt-0.5 shrink-0"
              >
                <X size={12} className="text-gray-300 hover:text-burgundy" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="max-h-56 sm:max-h-64 overflow-y-auto overflow-x-hidden rounded-xl border border-gray-100 divide-y divide-gray-50 bg-white overscroll-contain">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-gray-300 text-[10px] font-black uppercase tracking-widest">
            <Loader2 size={14} className="animate-spin" /> Loading
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-gray-300 px-4 text-center">
            <Users size={18} />
            <span className="text-[10px] font-black uppercase tracking-widest leading-relaxed">
              {emptyLabel}
            </span>
          </div>
        ) : (
          visible.map((p) => {
            const checked = selected.has(p.id);
            const ministryLabel = (p.ministries || []).slice(0, 2).join(' · ');
            return (
              <label
                key={p.id}
                className={`flex items-start gap-3 px-3 py-3 min-h-[48px] cursor-pointer transition-colors ${
                  checked ? 'bg-gold-cream/40' : 'hover:bg-gray-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(p.id)}
                  className="mt-1.5 shrink-0 rounded border-gray-300 text-burgundy focus:ring-gold"
                />
                <div className="w-9 h-9 mt-0.5 rounded-xl bg-burgundy overflow-hidden shrink-0 flex items-center justify-center text-gold text-xs font-black">
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    (p.name || '?').charAt(0)
                  )}
                </div>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <div className="text-[13px] font-bold text-[#0d1a14] break-words whitespace-normal leading-snug">
                    {p.name}
                  </div>
                  <div className="mt-0.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider break-words whitespace-normal leading-snug">
                    {p.role || 'Member'}
                    {ministryLabel ? ` · ${ministryLabel}` : ''}
                  </div>
                </div>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ChannelMemberPicker;
