/**
 * Compact @mention picker for Community Feed composers (Phase 4C).
 */
import React, { useEffect, useRef, useState } from 'react';
import { getAuthHeaders } from '../../lib/api';
import {
  buildFeedMentionToken,
  extractFeedMentionIds,
  formatMentionCandidateHint,
} from '../../api/_utils/communityFeedMentions.js';

export type FeedMentionCandidate = {
  id: string;
  name: string;
  avatar_url?: string | null;
  /** Optional disambiguator when multiple members share a display name. */
  role?: string | null;
  emailHint?: string | null;
};

type Props = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
  disabled?: boolean;
  className?: string;
  'data-testid'?: string;
  ariaLabel?: string;
};

function findActiveMentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at < 0) return null;
  if (at > 0 && /[\w\]]/.test(before[at - 1] || '')) return null;
  const fragment = before.slice(at + 1);
  if (fragment.includes('\n') || fragment.includes('](')) return null;
  if (fragment.length > 40) return null;
  // Don't reopen while inside a completed token
  if (fragment.includes('[')) return null;
  return { start: at, query: fragment };
}

export function collectMentionedUserIds(content: string): string[] {
  return extractFeedMentionIds(content);
}

const FeedMentionComposer: React.FC<Props> = ({
  value,
  onChange,
  placeholder,
  maxLength,
  rows = 3,
  disabled,
  className,
  'data-testid': testId,
  ariaLabel,
}) => {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const [picker, setPicker] = useState<{
    start: number;
    query: string;
    items: FeedMentionCandidate[];
    active: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, []);

  const fetchCandidates = (query: string, start: number) => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(
          `/api/vault?resource=community&subResource=feed&subResource=mention-candidates&q=${encodeURIComponent(query)}`,
          { headers }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setPicker(null);
          return;
        }
        const items = Array.isArray(data.candidates) ? data.candidates : [];
        setPicker({ start, query, items, active: 0 });
      } catch {
        setPicker(null);
      } finally {
        setLoading(false);
      }
    }, 180);
  };

  const insertMention = (candidate: FeedMentionCandidate) => {
    if (!picker) return;
    const token = buildFeedMentionToken(candidate.name, candidate.id);
    const before = value.slice(0, picker.start);
    const caret = taRef.current?.selectionStart ?? value.length;
    const after = value.slice(caret);
    const next = `${before}${token} ${after}`;
    onChange(next);
    setPicker(null);
    requestAnimationFrame(() => {
      const el = taRef.current;
      if (!el) return;
      const pos = (before + token + ' ').length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!picker || picker.items.length === 0) {
      if (e.key === 'Escape') setPicker(null);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setPicker((p) => (p ? { ...p, active: (p.active + 1) % p.items.length } : p));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setPicker((p) =>
        p ? { ...p, active: (p.active - 1 + p.items.length) % p.items.length } : p
      );
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insertMention(picker.items[picker.active] || picker.items[0]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setPicker(null);
    }
  };

  const onInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    onChange(next);
    const caret = e.target.selectionStart ?? next.length;
    const active = findActiveMentionQuery(next, caret);
    if (!active) {
      setPicker(null);
      return;
    }
    fetchCandidates(active.query, active.start);
  };

  return (
    <div className="relative">
      <textarea
        ref={taRef}
        value={value}
        onChange={onInput}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={rows}
        disabled={disabled}
        className={className}
        data-testid={testId}
        aria-label={ariaLabel || 'Community post text'}
        aria-autocomplete="list"
        aria-expanded={Boolean(picker && picker.items.length)}
        aria-controls={picker ? 'feed-mention-listbox' : undefined}
      />
      {picker ? (
        <div
          id="feed-mention-listbox"
          role="listbox"
          aria-label="Mention members"
          className="absolute z-20 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-xl border border-burgundy/15 bg-white shadow-lg"
          data-feed-mention-picker="true"
        >
          {loading && picker.items.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-500">Searching…</p>
          ) : picker.items.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-500">No members found</p>
          ) : (
            picker.items.map((c, idx) => {
              const initial = (c.name || '?').charAt(0).toUpperCase();
              const hint = formatMentionCandidateHint(c);
              return (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={idx === picker.active}
                  data-mention-candidate-id={c.id}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm ${
                    idx === picker.active ? 'bg-burgundy/8' : 'hover:bg-gray-50'
                  }`}
                  onMouseDown={(ev) => {
                    ev.preventDefault();
                    insertMention(c);
                  }}
                >
                  {c.avatar_url ? (
                    <img
                      src={c.avatar_url}
                      alt=""
                      className="w-7 h-7 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <span className="w-7 h-7 rounded-lg bg-burgundy/10 text-burgundy text-xs font-black flex items-center justify-center shrink-0">
                      {initial}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold text-burgundy truncate block">{c.name}</span>
                    {hint ? (
                      <span className="text-[11px] text-gray-400 font-medium truncate block" data-mention-candidate-hint="true">
                        {hint}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
};

export default FeedMentionComposer;
