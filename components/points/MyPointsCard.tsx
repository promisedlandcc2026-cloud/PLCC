/**
 * My Profile: this season's points, rank, recent awards, and the leaderboard opt-out.
 * Renders nothing until the points tables exist, so it never breaks the profile page.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, QrCode, ScanLine, Star } from 'lucide-react';
import {
  fetchMyPoints,
  setShowOnLeaderboard,
  type MyPoints,
} from '../../lib/checkinPointsClient';
import MyPassQrModal from './MyPassQrModal';

const MyPointsCard: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<MyPoints | null>(null);
  const [hidden, setHidden] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchMyPoints()
      .then((d) => alive && setData(d))
      .catch(() => alive && setHidden(true));
    return () => {
      alive = false;
    };
  }, []);

  if (hidden) return null;

  if (!data) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-center justify-center text-gray-400">
        <Loader2 className="animate-spin" size={18} aria-hidden />
      </div>
    );
  }

  const s = data.summary;

  const toggleShow = async () => {
    if (!s) return;
    setSaving(true);
    setError(null);
    try {
      const { showOnLeaderboard } = await setShowOnLeaderboard(!s.showOnLeaderboard);
      setData({ ...data, summary: { ...s, showOnLeaderboard, rank: showOnLeaderboard ? s.rank : null } });
    } catch (err: any) {
      setError(err?.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-5 text-white" style={{ background: 'var(--season-accent, #1d372c)' }}>
        <p className="text-[10px] font-black uppercase tracking-widest opacity-90 flex items-center gap-1.5">
          <Star size={12} aria-hidden /> {data.season.emoji} {data.season.label} points
        </p>
        <p className="text-4xl font-black tabular-nums mt-1">{s ? s.seasonPoints : 0}</p>
        {s && (
          <p className="text-xs font-bold opacity-90 mt-1">
            {s.rank ? `#${s.rank} on the leaderboard` : s.showOnLeaderboard ? 'Check in to get on the board' : 'Hidden from the leaderboard'}
          </p>
        )}
      </div>

      {!data.linked ? (
        <p className="p-5 text-sm text-gray-600">
          Points show up once your login is linked to your church record. Ask a leader to link it.
        </p>
      ) : (
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-left">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">All time</p>
              <p className="text-lg font-black text-[#0d1a14] tabular-nums">{s?.lifetimePoints ?? 0}</p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Check-ins</p>
              <p className="text-lg font-black text-[#0d1a14] tabular-nums">{s?.checkins ?? 0}</p>
            </div>
          </div>

          {data.history.length > 0 && (
            <ul className="space-y-1.5 text-left">
              {data.history.slice(0, 5).map((h, i) => (
                <li key={`${h.at}-${h.reason}-${i}`} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-gray-700">
                    <span className="font-bold text-[#0d1a14]">{h.label}</span>
                    {h.sessionTitle && <span> · {h.sessionTitle}</span>}
                  </span>
                  <span className={`font-black tabular-nums shrink-0 ${h.points < 0 ? 'text-red-700' : 'text-[#0d1a14]'}`}>
                    {h.points > 0 ? '+' : ''}
                    {h.points}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowQr(true)}
              className="w-full min-h-[48px] rounded-xl bg-[#0d1a14] text-white text-xs font-black uppercase tracking-widest inline-flex items-center justify-center gap-2"
            >
              <QrCode size={16} aria-hidden /> Show my QR
            </button>
            <button
              type="button"
              onClick={() => navigate('/scan-in')}
              className="w-full min-h-[44px] rounded-xl border border-[#0d1a14]/20 bg-white text-[#0d1a14] text-[11px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-2"
            >
              <ScanLine size={14} aria-hidden /> Scan the room code
            </button>
          </div>

          {s && (
            <label className="flex items-center justify-between gap-3 text-left cursor-pointer">
              <span className="text-xs font-bold text-gray-700">Show me on the leaderboard</span>
              <input
                type="checkbox"
                className="h-5 w-5 accent-[#1d372c]"
                checked={s.showOnLeaderboard}
                disabled={saving}
                onChange={() => void toggleShow()}
              />
            </label>
          )}
          {error && <p role="alert" className="text-xs font-semibold text-red-700">{error}</p>}
        </div>
      )}
      <MyPassQrModal open={showQr} onClose={() => setShowQr(false)} />
    </div>
  );
};

export default MyPointsCard;
