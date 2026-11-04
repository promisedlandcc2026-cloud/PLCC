import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Gamepad2, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { getAuthHeaders } from '../../lib/api';

/** PLCC Ark lives at PLCC Connect's /ark (its own site, same sign-in). */
export const ARK_URL = 'https://plcc-connect.vercel.app/ark/';

const GAME_TITLE: Record<string, string> = {
  pong: 'Pong Plus',
  breakout: 'Breakout',
  invaders: 'Space Invaders',
  tetris: 'Tetris',
  dove: 'Dove Defender',
};

type ArkScoreRow = {
  id: string;
  name: string;
  isChild: boolean;
  game: string;
  score: number;
  status: 'ok' | 'held' | 'removed';
  note: string | null;
  bucks: number;
  createdAt: string;
};

type ArkAdmin = {
  settings: { bucksEnabled: boolean; weeklyCap: number; holdMultiplier: number };
  canEditSettings: boolean;
  canRemove: boolean;
  stats: { playersThisWeek: number; gamesThisWeek: number; bucksThisWeek: number; mostPlayed: string | null };
  scores: ArkScoreRow[];
};

async function arkCall<T>(method: 'GET' | 'POST' | 'PATCH', action: string, body?: unknown): Promise<T> {
  const headers = await getAuthHeaders(body ? { 'Content-Type': 'application/json' } : undefined);
  const res = await fetch(`/api/vault?resource=ark&action=${action}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) throw new Error(data?.error || 'The Ark is not available right now.');
  return data as T;
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Kampala' })
    : '';
}

/**
 * PLCC Ark — staff view: this week's activity, recent scores (remove one, or approve a
 * held one), and the PLCC Bucks rules for the Ark (Super Admin).
 */
const ArkScoresPage: React.FC = () => {
  const [data, setData] = useState<ArkAdmin | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [capDraft, setCapDraft] = useState('');
  const [savingRules, setSavingRules] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await arkCall<ArkAdmin>('GET', 'admin');
      setData(d);
      setCapDraft(String(d.settings.weeklyCap));
    } catch (err: any) {
      setError(err?.message || 'Could not load the Ark.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (row: ArkScoreRow) => {
    const reason = window.prompt(
      `Remove ${row.name}'s ${GAME_TITLE[row.game] || row.game} score of ${row.score.toLocaleString('en-US')}?` +
        (row.bucks > 0 ? `\n\nThe ${row.bucks} PLCC Bucks it earned will be taken back.` : '') +
        '\n\nShort reason (shown in the Bucks history):',
      'Score removed by a leader'
    );
    if (reason == null) return;
    setBusyId(row.id);
    setNotice(null);
    try {
      const r = await arkCall<{ reversed?: number }>('POST', 'remove', { scoreId: row.id, note: reason });
      setNotice(r.reversed ? `Score removed. ${r.reversed} PLCC Bucks award${r.reversed === 1 ? '' : 's'} taken back.` : 'Score removed.');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Could not remove that score.');
    } finally {
      setBusyId(null);
    }
  };

  const approve = async (row: ArkScoreRow) => {
    setBusyId(row.id);
    setNotice(null);
    try {
      const r = await arkCall<{ awarded?: number }>('POST', 'approve', { scoreId: row.id });
      setNotice(r.awarded ? `Score approved. +${r.awarded} PLCC Bucks for a new best.` : 'Score approved. It is on the board now.');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Could not approve that score.');
    } finally {
      setBusyId(null);
    }
  };

  const saveRules = async (patch: Record<string, unknown>) => {
    setSavingRules(true);
    setNotice(null);
    try {
      await arkCall('PATCH', 'settings', patch);
      setNotice('Ark rules saved.');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Could not save the rules.');
    } finally {
      setSavingRules(false);
    }
  };

  const held = data?.scores.filter((s) => s.status === 'held') || [];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 text-[#0d1a14]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-gray-400">Events · PLCC Ark</p>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight mt-1 flex items-center gap-2">
            <Gamepad2 size={26} className="text-burgundy" /> Ark scores and rewards
          </h1>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl border border-gray-200 bg-white text-sm font-bold"
          >
            <RefreshCw size={16} /> Refresh
          </button>
          <a
            href={ARK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl bg-burgundy text-white text-sm font-bold"
          >
            Open the Ark <ExternalLink size={15} />
          </a>
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 flex items-center gap-2">
          <CheckCircle2 size={16} /> {notice}
        </p>
      ) : null}

      {!data && !error ? (
        <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-burgundy" size={28} /></div>
      ) : null}

      {data ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              ['Players this week', data.stats.playersThisWeek.toLocaleString('en-US')],
              ['Games played', data.stats.gamesThisWeek.toLocaleString('en-US')],
              ['PLCC Bucks from the Ark', data.stats.bucksThisWeek.toLocaleString('en-US')],
              ['Most played', data.stats.mostPlayed ? GAME_TITLE[data.stats.mostPlayed] || data.stats.mostPlayed : '—'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-white border border-gray-100 px-4 py-3.5">
                <p className="text-xs font-bold text-gray-400">{label}</p>
                <p className="text-xl font-black mt-1">{value}</p>
              </div>
            ))}
          </div>

          <div className="grid lg:grid-cols-[1.6fr_1fr] gap-4 items-start">
            <section className="rounded-2xl bg-white border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
                <h2 className="text-base font-black">Recent scores</h2>
                {held.length ? (
                  <span className="text-xs font-bold rounded-full bg-amber-50 text-amber-800 px-2.5 py-1">
                    {held.length} waiting for a check
                  </span>
                ) : null}
              </div>
              {data.scores.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-gray-500">No games played yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[#FAF8F6] text-xs text-gray-400">
                      <tr>
                        <th className="text-left font-black px-5 py-2.5">Player</th>
                        <th className="text-left font-black px-3 py-2.5">Game</th>
                        <th className="text-right font-black px-3 py-2.5">Score</th>
                        <th className="text-left font-black px-3 py-2.5">Bucks</th>
                        <th className="px-5 py-2.5"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.scores.map((s) => (
                        <tr key={s.id} className={`border-t border-gray-50 ${s.status === 'held' ? 'bg-amber-50/60' : s.status === 'removed' ? 'opacity-50' : ''}`}>
                          <td className="px-5 py-3">
                            <p className="font-bold">{s.name}</p>
                            <p className="text-[11px] text-gray-400">{when(s.createdAt)}{s.isChild ? '' : ' · adult'}</p>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">{GAME_TITLE[s.game] || s.game}</td>
                          <td className="px-3 py-3 text-right font-bold tabular-nums">{s.score.toLocaleString('en-US')}</td>
                          <td className="px-3 py-3 text-xs">
                            {s.status === 'held' ? (
                              <span className="font-bold text-amber-800">Held: {s.note}</span>
                            ) : s.status === 'removed' ? (
                              <span className="text-gray-500">Removed{s.note ? ` · ${s.note}` : ''}</span>
                            ) : s.bucks > 0 ? (
                              <span className="font-bold text-emerald-700">+{s.bucks}</span>
                            ) : (
                              <span className="text-gray-400">{s.isChild ? '—' : 'Adults don’t earn'}</span>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex justify-end gap-2">
                              {s.status === 'held' ? (
                                <button
                                  type="button"
                                  disabled={busyId === s.id}
                                  onClick={() => void approve(s)}
                                  className="min-h-[36px] px-3 rounded-lg bg-emerald-600 text-white text-xs font-bold disabled:opacity-50"
                                >
                                  Approve
                                </button>
                              ) : null}
                              {s.status !== 'removed' && (data.canRemove || s.bucks === 0) ? (
                                <button
                                  type="button"
                                  disabled={busyId === s.id}
                                  onClick={() => void remove(s)}
                                  aria-label={`Remove ${s.name}'s score`}
                                  className="min-h-[36px] px-3 rounded-lg border border-gray-200 text-burgundy text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50"
                                >
                                  {busyId === s.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Remove
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="px-5 py-3 border-t border-gray-50 text-xs text-gray-500">
                Removing a score takes back any PLCC Bucks it earned. Parents see the change in Kids View.
              </p>
            </section>

            <section className="rounded-2xl bg-white border-2 border-burgundy/80 p-5 space-y-4">
              <h2 className="text-base font-black">PLCC Bucks rules for the Ark</h2>
              <label className="flex items-center justify-between gap-3 text-sm font-semibold">
                <span>Ark earns PLCC Bucks</span>
                <input
                  type="checkbox"
                  checked={data.settings.bucksEnabled}
                  disabled={!data.canEditSettings || savingRules}
                  onChange={(e) => void saveRules({ bucksEnabled: e.target.checked })}
                  className="h-5 w-5 accent-[#1d372c]"
                />
              </label>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span>First game of the day</span><span className="font-black">+2</span></div>
                <div className="flex justify-between"><span>New personal best</span><span className="font-black">+5</span></div>
                <div className="flex justify-between"><span>Weekly top 3 kids (per game)</span><span className="font-black">+10 / +6 / +4</span></div>
              </div>
              <label className="block">
                <span className="text-sm font-bold">Most a kid can earn here each week</span>
                <span className="mt-1.5 flex gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    inputMode="numeric"
                    value={capDraft}
                    disabled={!data.canEditSettings}
                    onChange={(e) => setCapDraft(e.target.value)}
                    className="flex-1 min-h-[44px] rounded-xl border border-gray-200 px-3 font-bold"
                  />
                  {data.canEditSettings ? (
                    <button
                      type="button"
                      disabled={savingRules || capDraft === String(data.settings.weeklyCap)}
                      onClick={() => void saveRules({ weeklyCap: Number(capDraft) })}
                      className="min-h-[44px] px-4 rounded-xl bg-burgundy text-white text-sm font-bold disabled:opacity-40"
                    >
                      Save
                    </button>
                  ) : null}
                </span>
              </label>
              <p className="text-xs text-gray-500 leading-relaxed">
                From playing (first game, new best). Top-3 prizes are extra. Everything counts inside the{' '}
                PLCC Bucks weekly cap. Scores over {data.settings.holdMultiplier}× a player’s best are held for a leader to check.
                Amounts can be changed under Kids Bucks reasons.
              </p>
              {!data.canEditSettings ? <p className="text-xs text-gray-500">Only a Super Admin can change these rules.</p> : null}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
};

export default ArkScoresPage;
