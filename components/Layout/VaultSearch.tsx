import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, FileText, HandHeart, Loader2, Search, User, X } from 'lucide-react';
import { useNav } from '../../lib/NavContext';
import { SIMPLE_NAV_GROUPS, type SimpleNavLink } from '../../lib/simpleNav';
import { hasPermission, isAccountantRole, isKioskRole } from '../../lib/permissions';
import { fetchAuthorized } from '../../lib/api';
import { Role } from '../../types';

type PageHit = { label: string; group: string; path?: string; href?: string };
type Results = {
  members: Array<{ id: string; name: string; sub: string | null }>;
  events: Array<{ id: string; title: string; date: string | null; time: string | null; location: string | null }>;
  serve: Array<{ id: string; title: string; roleLabel: string | null; startsAt: string | null; status: string }>;
};
type Row = { key: string; icon: React.ReactNode; title: string; sub?: string | null; go: () => void };

function flattenPages(role: Role): PageHit[] {
  const out: PageHit[] = [];
  const walk = (items: SimpleNavLink[], group: string) => {
    for (const item of items) {
      if (item.children?.length) {
        walk(item.children, group);
        continue;
      }
      if (!item.path && !item.href) continue;
      if (item.path && !hasPermission(role, item.section, item.path)) continue;
      out.push({ label: item.label, group, path: item.path, href: item.href });
    }
  };
  for (const g of SIMPLE_NAV_GROUPS) walk(g.items, g.label);
  return out;
}

function eventWhen(date: string | null, time: string | null): string | null {
  if (!date) return time || null;
  const d = new Date(`${date}T12:00:00`);
  const day = Number.isNaN(d.getTime()) ? date : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  return time ? `${day} · ${time}` : day;
}

/**
 * Search the whole Vault from the top bar: pages you can open, members (staff who can
 * see People), events and Serve opportunities. Ctrl/⌘ K or "/" to focus on a computer.
 */
export const VaultSearch: React.FC = () => {
  const { userRole } = useNav();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const role = userRole as Role;
  const hidden = isKioskRole(role) || isAccountantRole(role);

  const pages = useMemo(() => flattenPages(role), [role]);
  const term = q.trim().toLowerCase();
  const pageHits = useMemo(
    () => (term.length < 2 ? [] : pages.filter((p) => `${p.label} ${p.group}`.toLowerCase().includes(term)).slice(0, 6)),
    [pages, term]
  );

  useEffect(() => {
    if (term.length < 2) {
      setResults(null);
      return;
    }
    let alive = true;
    setLoading(true);
    const t = window.setTimeout(async () => {
      try {
        const res = await fetchAuthorized(`/api/vault?resource=vault-search&q=${encodeURIComponent(term)}`);
        const data = await res.json().catch(() => null);
        if (alive) setResults(res.ok && data?.ok ? data : { members: [], events: [], serve: [] });
      } catch {
        if (alive) setResults({ members: [], events: [], serve: [] });
      } finally {
        if (alive) setLoading(false);
      }
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [term]);

  // Ctrl/⌘ K or "/" opens search on a computer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /input|textarea|select/i.test((e.target as HTMLElement)?.tagName || '') || (e.target as HTMLElement)?.isContentEditable;
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        setOpen(true);
        window.setTimeout(() => inputRef.current?.focus(), 0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Close when tapping outside.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    setQ('');
    setResults(null);
  };

  const sections: Array<{ title: string; rows: Row[] }> = [];
  if (pageHits.length) {
    sections.push({
      title: 'Pages',
      rows: pageHits.map((p) => ({
        key: `p:${p.path || p.href}`,
        icon: <FileText size={16} />,
        title: p.label,
        sub: p.group,
        go: () => {
          close();
          if (p.path) navigate(p.path);
          else if (p.href) window.open(p.href, '_blank', 'noopener');
        },
      })),
    });
  }
  if (results?.members.length) {
    sections.push({
      title: 'Members',
      rows: results.members.map((m) => ({
        key: `m:${m.id}`,
        icon: <User size={16} />,
        title: m.name,
        sub: m.sub,
        go: () => {
          close();
          navigate(`/members?q=${encodeURIComponent(m.name)}`);
        },
      })),
    });
  }
  if (results?.events.length) {
    sections.push({
      title: 'Events',
      rows: results.events.map((e) => ({
        key: `e:${e.id}`,
        icon: <CalendarDays size={16} />,
        title: e.title,
        sub: [eventWhen(e.date, e.time), e.location].filter(Boolean).join(' · ') || null,
        go: () => {
          close();
          navigate(e.date ? `/events/overview?date=${encodeURIComponent(e.date)}` : '/events/overview');
        },
      })),
    });
  }
  if (results?.serve.length) {
    sections.push({
      title: 'Serve',
      rows: results.serve.map((o) => ({
        key: `s:${o.id}`,
        icon: <HandHeart size={16} />,
        title: o.title,
        sub: [o.roleLabel, o.startsAt ? new Date(o.startsAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null, o.status !== 'open' ? o.status : null]
          .filter(Boolean)
          .join(' · ') || null,
        go: () => {
          close();
          navigate(`/events/serve?id=${encodeURIComponent(o.id)}`);
        },
      })),
    });
  }
  const flat = sections.flatMap((s) => s.rows);

  useEffect(() => setActive(0), [term, results]);

  if (hidden) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(flat.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && flat[active]) {
      e.preventDefault();
      flat[active].go();
    }
  };

  let index = -1;
  return (
    <div ref={boxRef} className="relative flex-1 max-w-xl mx-2 md:mx-4">
      {/* Phone: a search button that opens a full-width box */}
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          window.setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className={`${open ? 'hidden' : 'flex'} md:hidden ml-auto items-center justify-center w-11 h-11 rounded-2xl bg-white border border-gray-100 text-gray-500 hover:text-burgundy`}
        aria-label="Search PLCC Canaan"
      >
        <Search size={20} />
      </button>

      <div
        className={`${open ? 'fixed inset-x-0 top-0 z-[130] p-3 bg-white shadow-lg md:static md:p-0 md:shadow-none md:bg-transparent' : 'hidden'} md:block`}
      >
        <div className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" aria-hidden />
          <input
            ref={inputRef}
            type="text"
            enterKeyHint="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Search members, events, Serve, pages…"
            aria-label="Search PLCC Canaan"
            role="combobox"
            aria-expanded={open && term.length >= 2}
            aria-controls="vault-search-results"
            autoComplete="off"
            className="w-full h-12 rounded-2xl border border-gray-200 bg-gray-50 pl-11 pr-11 text-[15px] text-[#1A1A1A] placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-burgundy/20"
          />
          {loading ? (
            <Loader2 size={18} className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-gray-400" aria-hidden />
          ) : q || open ? (
            <button
              type="button"
              onClick={close}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:text-burgundy md:hidden"
              aria-label="Close search"
            >
              <X size={18} />
            </button>
          ) : null}
        </div>

        {open && term.length >= 2 ? (
          <div
            id="vault-search-results"
            role="listbox"
            className="absolute left-3 right-3 md:left-0 md:right-0 mt-2 max-h-[70vh] overflow-y-auto rounded-2xl bg-white border border-gray-100 shadow-2xl py-2"
          >
            {sections.length ? (
              sections.map((s) => (
                <div key={s.title} className="py-1">
                  <p className="px-4 pt-1 pb-1 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">{s.title}</p>
                  {s.rows.map((r) => {
                    index += 1;
                    const i = index;
                    return (
                      <button
                        key={r.key}
                        type="button"
                        role="option"
                        aria-selected={i === active}
                        onMouseEnter={() => setActive(i)}
                        onClick={r.go}
                        className={`w-full min-h-[48px] px-4 py-2 flex items-center gap-3 text-left ${i === active ? 'bg-burgundy/5' : 'hover:bg-gray-50'}`}
                      >
                        <span className="shrink-0 w-8 h-8 rounded-xl bg-burgundy/10 text-burgundy flex items-center justify-center">{r.icon}</span>
                        <span className="min-w-0">
                          <span className="block text-sm font-bold text-[#1A1A1A] truncate">{r.title}</span>
                          {r.sub ? <span className="block text-xs text-gray-500 truncate">{r.sub}</span> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))
            ) : loading ? (
              <p className="px-4 py-6 text-sm text-gray-500 text-center">Searching…</p>
            ) : (
              <p className="px-4 py-6 text-sm text-gray-500 text-center">Nothing found for “{q.trim()}”.</p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};
