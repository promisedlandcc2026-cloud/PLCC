import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, BookOpen, ExternalLink, Loader2, Maximize2, RefreshCw, Search, X } from 'lucide-react';
import AskAdminTitleLink from '../../components/common/AskAdminTitleLink';
import { fetchWithTimeout, getAuthHeaders } from '../../lib/api';

type GuideCard = {
  id: string;
  title: string;
  theme: string;
  speaker: string;
  summary: string;
  dayCount: number;
  publishedAt: string;
  shareToken: string;
  shareUrl: string;
};

type GuideDay = {
  dayNumber: number;
  title: string;
  scriptureReference: string;
  scriptureText: string;
  observation: string;
  application: string;
  prayer: string;
  challenge: string;
  groupDiscussion: string;
};

type StudyGuide = GuideCard & {
  keyVerse: string;
  keyVerseReference: string;
  centralMessage: string;
  keyPoints: string[];
  quotes: string[];
  applications: string[];
  prayers: string[];
  reflections: string[];
  scriptures: Array<{ reference: string; note: string }>;
  days: GuideDay[];
  coverUrl: string | null;
};

/* Reading-first design: serif for titles and Scripture, a large comfortable body size,
   one gold accent used sparingly. Gold text uses a darker tone so it stays readable on white. */
const SERIF: React.CSSProperties = { fontFamily: "'Fraunces', Georgia, serif" };
const INK = 'text-[#16251f]';
const MUTED = 'text-[#6B5A5E]';
const GOLD_TEXT = 'text-[#8A6A12]';
const FOCUS = 'focus:outline-none focus-visible:ring-4 focus-visible:ring-[#C9A35A]/40';

function parseDay(value: string): Date | null {
  const raw = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [year, month, day] = raw.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatPublished(value: string): string {
  const date = parseDay(value);
  return date ? date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : '';
}

function shortDate(value: string): { month: string; day: string } | null {
  const date = parseDay(value);
  if (!date) return null;
  return {
    month: date.toLocaleDateString(undefined, { month: 'short' }),
    day: String(date.getDate()),
  };
}

const SermonNotesPage: React.FC = () => {
  const [guides, setGuides] = useState<GuideCard[]>([]);
  const [selected, setSelected] = useState<StudyGuide | null>(null);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const headers = await getAuthHeaders();
        const res = await fetchWithTimeout('/api/vault?resource=rhemanotes&action=library', { headers }, 20_000);
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) {
          throw new Error(data?.error || 'Could not load study guides from RhemaNotes.');
        }
        if (!cancelled) setGuides(Array.isArray(data.guides) ? data.guides : []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load study guides from RhemaNotes.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const openGuide = async (card: GuideCard) => {
    setOpeningId(card.id);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetchWithTimeout(
        `/api/vault?resource=rhemanotes&action=guide&token=${encodeURIComponent(card.shareToken)}`,
        { headers },
        20_000
      );
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.guide) {
        throw new Error(data?.error || 'That study guide is not published.');
      }
      setSelected(data.guide as StudyGuide);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That study guide is not published.');
    } finally {
      setOpeningId(null);
    }
  };

  // Newest first; the latest guide is featured as this week's study.
  const sorted = useMemo(
    () => [...guides].sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || ''))),
    [guides]
  );
  const [featured, ...earlier] = sorted;
  const q = query.trim().toLowerCase();
  const filtered = q
    ? sorted.filter((g) => [g.title, g.speaker, g.theme, g.summary].join(' ').toLowerCase().includes(q))
    : earlier;

  return (
    <div className={`min-h-full bg-[#F9F9F7] ${INK}`}>
      <div className="max-w-3xl mx-auto px-4 py-8 md:px-8 md:py-12">
        {selected ? (
          <GuideReading
            guide={selected}
            onBack={() => {
              setSelected(null);
              window.scrollTo({ top: 0 });
            }}
          />
        ) : (
          <>
            <header className="mb-8 md:mb-10">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h1 className="text-4xl md:text-5xl font-semibold leading-tight" style={SERIF}>
                  Sermon Notes
                </h1>
                <AskAdminTitleLink prompt="Where do I read the RhemaNotes study guides?" />
              </div>
              <p className={`mt-2 text-[17px] leading-relaxed ${MUTED}`}>
                Each Sunday's message as a study guide, with a short reading for every day of the week.
              </p>
            </header>

            {error ? (
              <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[15px] text-red-800 flex flex-wrap items-center justify-between gap-3" role="alert">
                <span>{error}</span>
                <button
                  type="button"
                  onClick={() => setReloadKey((k) => k + 1)}
                  className={`inline-flex items-center gap-2 min-h-11 px-4 rounded-lg bg-white border border-red-200 font-semibold ${FOCUS}`}
                >
                  <RefreshCw size={16} /> Try again
                </button>
              </div>
            ) : null}

            {loading ? (
              <LibrarySkeleton />
            ) : !sorted.length && !error ? (
              <div className="rounded-2xl bg-white border border-[#EDE6DA] px-6 py-12 text-center">
                <BookOpen className="mx-auto mb-4 text-[#B8912A]" size={32} />
                <p className="text-2xl font-semibold" style={SERIF}>
                  No study guides yet
                </p>
                <p className={`mt-2 text-[16px] ${MUTED}`}>
                  When the pastor publishes a guide in RhemaNotes, it will appear here.
                </p>
              </div>
            ) : sorted.length ? (
              <>
                {!q && featured ? (
                  <FeaturedGuide guide={featured} opening={openingId === featured.id} onOpen={() => void openGuide(featured)} />
                ) : null}

                {sorted.length > 4 ? (
                  <label className="mt-8 flex items-center gap-3 rounded-xl bg-white border border-[#EDE6DA] px-4 min-h-12 focus-within:ring-4 focus-within:ring-[#C9A35A]/30">
                    <Search size={18} className={MUTED} aria-hidden="true" />
                    <span className="sr-only">Search study guides</span>
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search by title, speaker or topic"
                      className="w-full bg-transparent py-3 text-[16px] outline-none placeholder:text-[#9A8B8E]"
                    />
                  </label>
                ) : null}

                {filtered.length ? (
                  <section className="mt-8" aria-labelledby="earlier-guides">
                    <h2 id="earlier-guides" className="text-2xl font-semibold mb-3" style={SERIF}>
                      {q ? `Results for “${query.trim()}”` : 'Earlier guides'}
                    </h2>
                    <ul className="rounded-2xl bg-white border border-[#EDE6DA] divide-y divide-[#EDE6DA] overflow-hidden">
                      {filtered.map((guide) => (
                        <li key={guide.id}>
                          <GuideRow guide={guide} opening={openingId === guide.id} onOpen={() => void openGuide(guide)} />
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : q ? (
                  <p className={`mt-6 text-[16px] ${MUTED}`}>No guides match “{query.trim()}”.</p>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
};

function FeaturedGuide({ guide, opening, onOpen }: { guide: GuideCard; opening: boolean; onOpen: () => void }) {
  const published = formatPublished(guide.publishedAt);
  return (
    <section aria-labelledby="featured-guide" className="rounded-3xl overflow-hidden bg-[#0d1914] text-white shadow-[0_18px_40px_-20px_rgba(58,10,20,0.6)]">
      <div className="px-6 py-8 md:px-10 md:py-10">
        <p className="text-[15px] text-[#E8CF7E]">This week's study{published ? `, ${published}` : ''}</p>
        <h2 id="featured-guide" className="mt-3 text-3xl md:text-[2.6rem] leading-[1.1] font-semibold" style={SERIF}>
          {guide.title}
        </h2>
        {guide.speaker ? <p className="mt-3 text-[16px] text-white/75">{guide.speaker}</p> : null}
        {guide.summary ? (
          <p className="mt-5 text-[17px] leading-relaxed text-white/85 line-clamp-3 max-w-[60ch]">{guide.summary}</p>
        ) : null}
        <div className="mt-7 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={onOpen}
            disabled={opening}
            className="inline-flex items-center justify-center gap-2 min-h-12 px-6 rounded-xl bg-[#C9A35A] text-[#16251f] text-[16px] font-semibold hover:bg-[#E0BE4F] disabled:opacity-70 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#E8CF7E]/60"
          >
            {opening ? <Loader2 className="animate-spin" size={18} /> : <BookOpen size={18} />}
            {opening ? 'Opening…' : 'Read the study guide'}
          </button>
          {guide.dayCount ? <span className="text-[15px] text-white/65">{guide.dayCount} daily readings</span> : null}
        </div>
      </div>
    </section>
  );
}

function GuideRow({ guide, opening, onOpen }: { guide: GuideCard; opening: boolean; onOpen: () => void }) {
  const d = shortDate(guide.publishedAt);
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={opening}
      className={`w-full text-left flex items-start gap-4 px-4 py-4 md:px-5 hover:bg-[#FBF7EE] disabled:opacity-70 ${FOCUS} focus-visible:ring-inset`}
    >
      <div className="w-12 shrink-0 text-center pt-0.5" aria-hidden="true">
        {d ? (
          <>
            <p className={`text-[13px] ${GOLD_TEXT}`}>{d.month}</p>
            <p className="text-2xl leading-none font-semibold" style={SERIF}>
              {d.day}
            </p>
          </>
        ) : (
          <BookOpen size={20} className={`mx-auto ${GOLD_TEXT}`} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xl leading-snug font-semibold" style={SERIF}>
          {guide.title}
        </p>
        {guide.speaker ? <p className={`mt-0.5 text-[15px] ${MUTED}`}>{guide.speaker}</p> : null}
        {guide.summary ? <p className={`mt-1.5 text-[15px] leading-relaxed ${MUTED} line-clamp-2`}>{guide.summary}</p> : null}
      </div>
      {opening ? <Loader2 className={`animate-spin shrink-0 mt-1 ${MUTED}`} size={18} /> : null}
    </button>
  );
}

function LibrarySkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading study guides" className="space-y-6">
      <div className="rounded-3xl bg-[#0d1914]/90 h-64 animate-pulse motion-reduce:animate-none" />
      <div className="rounded-2xl bg-white border border-[#EDE6DA] divide-y divide-[#EDE6DA]">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-4 px-5 py-4">
            <div className="w-12 h-10 rounded bg-[#F1ECE3] animate-pulse motion-reduce:animate-none" />
            <div className="flex-1 space-y-2">
              <div className="h-5 w-2/3 rounded bg-[#F1ECE3] animate-pulse motion-reduce:animate-none" />
              <div className="h-4 w-1/3 rounded bg-[#F1ECE3] animate-pulse motion-reduce:animate-none" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GuideReading({ guide, onBack }: { guide: StudyGuide; onBack: () => void }) {
  const [dayNumber, setDayNumber] = useState(guide.days[0]?.dayNumber || 1);
  const day = guide.days.find((item) => item.dayNumber === dayNumber) || guide.days[0] || null;
  const published = formatPublished(guide.publishedAt);
  const scriptures = guide.scriptures.filter((s) => (s.reference || '').trim() || (s.note || '').trim());

  return (
    <article>
      <button
        type="button"
        onClick={onBack}
        className={`inline-flex items-center gap-2 min-h-11 -ml-2 px-2 rounded-lg text-[16px] font-medium text-[#1d372c] hover:bg-[#1d372c]/5 ${FOCUS}`}
      >
        <ArrowLeft size={18} />
        All study guides
      </button>

      <header className="mt-4">
        {guide.coverUrl ? <GuideImage src={guide.coverUrl} title={guide.title} /> : null}
        {published ? <p className={`text-[15px] ${GOLD_TEXT}`}>{published}</p> : null}
        <h1 className="mt-1 text-4xl md:text-5xl leading-[1.08] font-semibold" style={SERIF}>
          {guide.title}
        </h1>
        {guide.speaker ? <p className={`mt-3 text-[17px] ${MUTED}`}>{guide.speaker}</p> : null}
        {guide.theme ? <p className={`mt-1 text-[17px] ${MUTED}`}>{guide.theme}</p> : null}
      </header>

      {guide.keyVerse ? (
        <figure className="mt-9 border-l-[3px] border-[#C9A35A] pl-5 md:pl-7">
          <blockquote className="text-[1.65rem] md:text-[2rem] leading-snug italic" style={SERIF}>
            “{guide.keyVerse.trim().replace(/^[“"]|[”"]$/g, '')}”
          </blockquote>
          {guide.keyVerseReference ? (
            <figcaption className={`mt-3 text-[16px] font-semibold ${GOLD_TEXT}`}>{guide.keyVerseReference}</figcaption>
          ) : null}
        </figure>
      ) : null}

      <div className="mt-10 space-y-10 max-w-[68ch]">
        {guide.centralMessage ? (
          <p className="text-[19px] leading-[1.7] font-medium">{guide.centralMessage}</p>
        ) : null}
        {guide.summary ? <Prose title="Summary" text={guide.summary} /> : null}
        <ItemList title="Key points" items={guide.keyPoints} ordered />

        {scriptures.length ? (
          <Section title="Scripture">
            <ul className="space-y-3">
              {scriptures.map((s, i) => (
                <li key={`${s.reference}-${i}`} className="text-[17px] leading-[1.7]">
                  {s.reference ? <span className="font-semibold">{s.reference}</span> : null}
                  {s.reference && s.note ? <span className={MUTED}>: </span> : null}
                  {s.note ? <span className={MUTED}>{s.note}</span> : null}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
      </div>

      {guide.days.length ? (
        <section className="mt-12" aria-labelledby="daily-study">
          <h2 id="daily-study" className="text-3xl font-semibold" style={SERIF}>
            Daily study
          </h2>
          <p className={`mt-1 text-[16px] ${MUTED}`}>One reading for each day of the week.</p>
          <div role="tablist" aria-label="Choose a day" className="mt-5 flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0">
            {guide.days.map((item) => {
              const active = day?.dayNumber === item.dayNumber;
              return (
                <button
                  key={item.dayNumber}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setDayNumber(item.dayNumber)}
                  className={`shrink-0 min-h-12 min-w-[4.5rem] px-4 rounded-xl text-[16px] font-semibold border transition-colors ${FOCUS} ${
                    active
                      ? 'bg-[#1d372c] text-white border-[#1d372c]'
                      : 'bg-white text-[#1d372c] border-[#EDE6DA] hover:border-[#C9A35A]'
                  }`}
                >
                  Day {item.dayNumber}
                </button>
              );
            })}
          </div>
          {day ? <DayPanel day={day} /> : null}
        </section>
      ) : null}

      <div className="mt-12 space-y-10 max-w-[68ch]">
        <ItemList title="Application" items={guide.applications} />
        <ItemList title="Prayer" items={guide.prayers} />
        <ItemList title="Reflection" items={guide.reflections} />
        <QuoteList items={guide.quotes} />
      </div>

      {guide.shareUrl ? (
        <div className="mt-14 pt-6 border-t border-[#EDE6DA]">
          <a
            href={guide.shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-2 min-h-11 text-[16px] font-semibold text-[#1d372c] hover:underline ${FOCUS} rounded`}
          >
            Open this guide in RhemaNotes
            <ExternalLink size={16} />
          </a>
        </div>
      ) : null}
    </article>
  );
}

/* Shows the whole image (no cropping) and opens it full screen when tapped. */
function GuideImage({ src, title }: { src: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (failed) return null;
  const alt = title ? `Image for ${title}` : 'Study guide image';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="View full image"
        className={`group relative block w-full mb-7 rounded-2xl overflow-hidden bg-[#F1ECE3] border border-[#EDE6DA] ${FOCUS}`}
      >
        <img
          src={src}
          alt={alt}
          onError={() => setFailed(true)}
          className="block w-full h-auto max-h-[75vh] object-contain mx-auto"
        />
        <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-black/60 text-white text-[13px] font-medium px-3 py-1.5 opacity-90 group-hover:opacity-100">
          <Maximize2 size={14} aria-hidden="true" />
          Tap to enlarge
        </span>
      </button>

      {open
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={alt}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[1000] bg-black/90 flex items-center justify-center p-3 md:p-8"
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close image"
                autoFocus
                className="absolute top-3 right-3 md:top-5 md:right-5 inline-flex items-center justify-center w-12 h-12 rounded-full bg-white/15 text-white hover:bg-white/25 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/50"
              >
                <X size={24} />
              </button>
              <img
                src={src}
                alt={alt}
                onClick={(e) => e.stopPropagation()}
                className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
              />
              <a
                href={src}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="absolute bottom-4 left-1/2 -translate-x-1/2 inline-flex items-center gap-2 rounded-full bg-white/15 text-white text-[14px] font-medium px-4 py-2 hover:bg-white/25 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/50"
              >
                Open original
                <ExternalLink size={14} />
              </a>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-2xl font-semibold mb-3" style={SERIF}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Prose({ title, text }: { title: string; text: string }) {
  return (
    <Section title={title}>
      <p className="text-[17px] leading-[1.75] whitespace-pre-wrap">{text}</p>
    </Section>
  );
}

function ItemList({ title, items, ordered = false }: { title: string; items: string[]; ordered?: boolean }) {
  const rows = (items || []).map((item) => String(item || '').trim()).filter(Boolean);
  if (!rows.length) return null;
  const ListTag = ordered ? 'ol' : 'ul';
  return (
    <Section title={title}>
      <ListTag className="space-y-3">
        {rows.map((item, index) => (
          <li key={`${title}-${index}`} className="flex gap-3 text-[17px] leading-[1.7]">
            {ordered ? (
              <span className={`shrink-0 w-6 text-right font-semibold ${GOLD_TEXT}`} style={SERIF}>
                {index + 1}.
              </span>
            ) : (
              <span className="shrink-0 mt-[0.7em] w-1.5 h-1.5 rounded-full bg-[#C9A35A]" aria-hidden="true" />
            )}
            <span>{item}</span>
          </li>
        ))}
      </ListTag>
    </Section>
  );
}

function QuoteList({ items }: { items: string[] }) {
  const rows = (items || []).map((item) => String(item || '').trim()).filter(Boolean);
  if (!rows.length) return null;
  return (
    <Section title="Quotes">
      <div className="space-y-5">
        {rows.map((item, index) => (
          <blockquote key={index} className="text-[1.35rem] leading-snug italic border-l-2 border-[#EDE6DA] pl-4" style={SERIF}>
            {item}
          </blockquote>
        ))}
      </div>
    </Section>
  );
}

function DayPanel({ day }: { day: GuideDay }) {
  const parts: Array<[string, string]> = [
    ['Observation', day.observation],
    ['Application', day.application],
    ['Prayer', day.prayer],
    ['Challenge', day.challenge],
    ['Group discussion', day.groupDiscussion],
  ].filter(([, text]) => String(text || '').trim()) as Array<[string, string]>;

  return (
    <div role="tabpanel" className="mt-5 rounded-2xl bg-white border border-[#EDE6DA] px-5 py-7 md:px-8 md:py-9">
      <h3 className="text-2xl md:text-[1.75rem] leading-tight font-semibold" style={SERIF}>
        Day {day.dayNumber}
        {day.title ? `: ${day.title}` : ''}
      </h3>

      {day.scriptureText || day.scriptureReference ? (
        <figure className="mt-5 rounded-xl bg-[#FBF7EE] px-5 py-4">
          {day.scriptureText ? (
            <blockquote className="text-[1.3rem] leading-relaxed italic whitespace-pre-wrap" style={SERIF}>
              {day.scriptureText}
            </blockquote>
          ) : null}
          {day.scriptureReference ? (
            <figcaption className={`${day.scriptureText ? 'mt-2' : ''} text-[15px] font-semibold ${GOLD_TEXT}`}>
              {day.scriptureReference}
            </figcaption>
          ) : null}
        </figure>
      ) : null}

      <div className="mt-6 space-y-6 max-w-[68ch]">
        {parts.map(([label, text]) => (
          <div key={label}>
            <h4 className="text-[17px] font-semibold">{label}</h4>
            <p className="mt-1 text-[17px] leading-[1.75] whitespace-pre-wrap">{text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default SermonNotesPage;
