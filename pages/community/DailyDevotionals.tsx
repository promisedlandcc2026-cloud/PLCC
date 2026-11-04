import React, { useCallback, useEffect, useState } from 'react';
import { BookOpenText, CalendarDays, Loader2, RefreshCw, RotateCcw, Save, Sparkles } from 'lucide-react';
import AskAdminTitleLink from '../../components/common/AskAdminTitleLink';
import { fetchWithTimeout, getAuthHeaders } from '../../lib/api';

/**
 * Daily devotionals for PLCC Connect's Daily page.
 * Pastor / Ministry Leader / Super Admin write any day; days left alone use the
 * built-in starter devotional, so members always have something to read.
 */

type Day = {
  day: string;
  source: 'church' | 'starter';
  title: string;
  ref: string;
  verseText: string | null;
  body: string;
  question: string | null;
  prayer: string | null;
  seriesTitle: string | null;
  authorName: string | null;
};

type Form = { title: string; ref: string; verseText: string; body: string; question: string; prayer: string; seriesTitle: string };

const SERIF: React.CSSProperties = { fontFamily: "'Fraunces', Georgia, serif" };
const INK = 'text-[#16251f]';
const MUTED = 'text-[#6B5A5E]';
const FOCUS = 'focus:outline-none focus-visible:ring-4 focus-visible:ring-[#C9A35A]/40';
const FIELD = `w-full rounded-xl border border-[#E4DACB] bg-white px-4 py-3 text-[16px] ${INK} ${FOCUS}`;
const LABEL = 'block text-[13px] font-bold uppercase tracking-wider text-[#8A6A12] mb-1.5';

function todayAtChurch(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function dayLabel(day: string, style: 'short' | 'long' = 'short'): string {
  const d = new Date(`${day}T12:00:00`);
  return d.toLocaleDateString(undefined, style === 'short' ? { weekday: 'short', month: 'short', day: 'numeric' } : { weekday: 'long', month: 'long', day: 'numeric' });
}

function toForm(d: Day): Form {
  return {
    title: d.title,
    ref: d.ref,
    verseText: d.verseText || '',
    body: d.body,
    question: d.question || '',
    prayer: d.prayer || '',
    seriesTitle: d.seriesTitle || '',
  };
}

const DailyDevotionalsPage: React.FC = () => {
  const [days, setDays] = useState<Day[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [selected, setSelected] = useState<string>('');
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async (keepSelected?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithTimeout(
        `/api/vault?resource=daily&action=admin&from=${todayAtChurch()}`,
        { headers: await getAuthHeaders() },
        15_000
      );
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Could not load devotionals.');
      const list = data.days as Day[];
      setDays(list);
      setSetupNeeded(Boolean(data.setupNeeded));
      const pick = list.find((d) => d.day === (keepSelected || selected)) || list[0];
      if (pick) {
        setSelected(pick.day);
        setForm(toForm(pick));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load devotionals.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const current = days.find((d) => d.day === selected) || null;

  const choose = (d: Day) => {
    setSelected(d.day);
    setForm(toForm(d));
    setNote(null);
  };

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => (f ? { ...f, [k]: e.target.value } : f));

  const save = async () => {
    if (!form || !current) return;
    setSaving(true);
    setNote(null);
    try {
      const res = await fetchWithTimeout(
        '/api/vault?resource=daily&action=save',
        { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify({ day: current.day, ...form }) },
        15_000
      );
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Could not save.');
      setDays((list) => list.map((d) => (d.day === current.day ? data.day : d)));
      setForm(toForm(data.day));
      setNote({ ok: true, text: `Saved. Members will see it on ${dayLabel(current.day, 'long')}.` });
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : 'Could not save.' });
    } finally {
      setSaving(false);
    }
  };

  const revert = async () => {
    if (!current || current.source !== 'church') return;
    if (!window.confirm(`Remove the devotional written for ${dayLabel(current.day, 'long')}? That day will use the starter devotional again.`)) return;
    setSaving(true);
    setNote(null);
    try {
      const res = await fetchWithTimeout(
        '/api/vault?resource=daily&action=delete',
        { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify({ day: current.day }) },
        15_000
      );
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Could not remove it.');
      setDays((list) => list.map((d) => (d.day === current.day ? data.day : d)));
      setForm(toForm(data.day));
      setNote({ ok: true, text: 'Removed. That day now uses the starter devotional.' });
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : 'Could not remove it.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`min-h-full bg-[#F9F9F7] ${INK}`}>
      <div className="max-w-5xl mx-auto px-4 py-8 md:px-8 md:py-12">
        <header className="mb-8">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-4xl md:text-5xl font-semibold leading-tight" style={SERIF}>
              Daily Devotional
            </h1>
            <AskAdminTitleLink prompt="How do I write the daily devotional for PLCC Connect?" />
          </div>
          <p className={`mt-2 text-[17px] leading-relaxed ${MUTED}`}>
            What members read on the Daily page in PLCC Connect. Write any day you like — days you leave alone use a built-in starter devotional.
          </p>
        </header>

        {setupNeeded ? (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[15px] text-amber-900" role="alert">
            One setup step first: run <b>daily_devotionals.sql</b> in Supabase. Until then, members see the starter devotionals.
          </div>
        ) : null}
        {error ? (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[15px] text-red-800 flex flex-wrap items-center justify-between gap-3" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => void load(selected)} className={`inline-flex items-center gap-2 min-h-11 px-4 rounded-lg bg-white border border-red-200 font-semibold ${FOCUS}`}>
              <RefreshCw size={16} /> Try again
            </button>
          </div>
        ) : null}

        {loading && !days.length ? (
          <div className={`flex items-center gap-2 ${MUTED}`}>
            <Loader2 className="animate-spin" size={18} /> Loading the next two weeks…
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)] items-start">
            <nav aria-label="Next 14 days" className="rounded-2xl bg-white border border-[#EDE6DA] p-2">
              <p className="px-3 pt-2 pb-1 text-[12px] font-bold uppercase tracking-wider text-[#8A6A12] flex items-center gap-1.5">
                <CalendarDays size={14} /> Next 14 days
              </p>
              <ul className="space-y-1">
                {days.map((d) => {
                  const active = d.day === selected;
                  return (
                    <li key={d.day}>
                      <button
                        type="button"
                        onClick={() => choose(d)}
                        aria-current={active ? 'true' : undefined}
                        className={`w-full text-left rounded-xl px-3 py-2.5 min-h-[52px] ${FOCUS} ${active ? 'bg-[#1d372c] text-white' : 'hover:bg-[#F6F0E6]'}`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-[14px] font-bold">{dayLabel(d.day)}</span>
                          <span
                            className={`text-[11px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 ${
                              d.source === 'church'
                                ? active ? 'bg-white/20 text-white' : 'bg-[#E8F3EA] text-[#1F6B33]'
                                : active ? 'bg-white/15 text-white/90' : 'bg-[#F3EDE3] text-[#7A6A55]'
                            }`}
                          >
                            {d.source === 'church' ? 'Written' : 'Starter'}
                          </span>
                        </span>
                        <span className={`block text-[13px] truncate ${active ? 'text-white/85' : MUTED}`}>{d.title}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>

            {current && form ? (
              <section className="rounded-2xl bg-white border border-[#EDE6DA] p-5 md:p-7" aria-label={`Devotional for ${dayLabel(current.day, 'long')}`}>
                <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
                  <div>
                    <p className="text-[13px] font-bold uppercase tracking-wider text-[#8A6A12]">{dayLabel(current.day, 'long')}</p>
                    <h2 className="text-3xl font-semibold" style={SERIF}>
                      {current.source === 'church' ? 'Written for this day' : 'Using the starter devotional'}
                    </h2>
                    <p className={`text-[15px] ${MUTED}`}>
                      {current.source === 'church'
                        ? current.authorName ? `By ${current.authorName}.` : 'Written by church staff.'
                        : 'Edit anything below and save to make it your own for this day.'}
                    </p>
                  </div>
                  {current.source === 'starter' ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F3EDE3] px-3 py-1 text-[13px] font-semibold text-[#7A6A55]">
                      <Sparkles size={14} /> Starter
                    </span>
                  ) : null}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block md:col-span-2">
                    <span className={LABEL}>Title</span>
                    <input className={FIELD} maxLength={120} value={form.title} onChange={set('title')} placeholder="Great Is Thy Faithfulness" />
                  </label>
                  <label className="block">
                    <span className={LABEL}>Bible verse</span>
                    <input className={FIELD} maxLength={80} value={form.ref} onChange={set('ref')} placeholder="Lamentations 3:22-23" />
                    <span className={`mt-1 block text-[13px] ${MUTED}`}>Connect shows the King James text for this verse automatically.</span>
                  </label>
                  <label className="block">
                    <span className={LABEL}>This week's message (optional)</span>
                    <input className={FIELD} maxLength={120} value={form.seriesTitle} onChange={set('seriesTitle')} placeholder="New Every Morning" />
                    <span className={`mt-1 block text-[13px] ${MUTED}`}>Sunday's sermon title. Set it on one day and it heads the whole week.</span>
                  </label>
                  <label className="block md:col-span-2">
                    <span className={LABEL}>Verse text (optional)</span>
                    <textarea className={FIELD} rows={2} maxLength={1200} value={form.verseText} onChange={set('verseText')} placeholder="Leave blank to use the King James text, or paste another translation." />
                  </label>
                  <label className="block md:col-span-2">
                    <span className={LABEL}>Reflection</span>
                    <textarea className={FIELD} rows={8} maxLength={4000} value={form.body} onChange={set('body')} placeholder="A few short paragraphs. Leave a blank line between paragraphs." />
                  </label>
                  <label className="block md:col-span-2">
                    <span className={LABEL}>Carry this with you (question)</span>
                    <textarea className={FIELD} rows={2} maxLength={400} value={form.question} onChange={set('question')} />
                  </label>
                  <label className="block md:col-span-2">
                    <span className={LABEL}>A prayer for today</span>
                    <textarea className={FIELD} rows={3} maxLength={600} value={form.prayer} onChange={set('prayer')} />
                  </label>
                </div>

                <div className="mt-6 flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void save()}
                    className={`inline-flex items-center justify-center gap-2 rounded-xl bg-[#1d372c] text-white px-6 py-3.5 text-[16px] font-bold disabled:opacity-50 ${FOCUS}`}
                  >
                    {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                    {current.source === 'church' ? 'Save changes' : 'Save for this day'}
                  </button>
                  {current.source === 'church' ? (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void revert()}
                      className={`inline-flex items-center justify-center gap-2 rounded-xl border border-[#E4DACB] bg-white px-6 py-3.5 text-[16px] font-semibold ${INK} disabled:opacity-50 ${FOCUS}`}
                    >
                      <RotateCcw size={18} /> Use the starter devotional
                    </button>
                  ) : null}
                </div>
                {note ? (
                  <p role="status" className={`mt-3 text-[15px] font-semibold ${note.ok ? 'text-[#1F6B33]' : 'text-red-700'}`}>
                    {note.text}
                  </p>
                ) : null}

                <p className={`mt-6 flex items-start gap-2 text-[14px] ${MUTED}`}>
                  <BookOpenText size={16} className="mt-0.5 flex-shrink-0" />
                  Members who turn on the morning reminder get an alert at 7 AM with the day’s title.
                </p>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

export default DailyDevotionalsPage;
