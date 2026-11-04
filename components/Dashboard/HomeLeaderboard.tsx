/**
 * Home: this season's check-in leaderboard (first name + last initial only).
 * Uses the current season accent. Renders nothing until points are set up.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QrCode, ScanLine, Trophy } from 'lucide-react';
import { fetchLeaderboard, type Leaderboard } from '../../lib/checkinPointsClient';
import MyPassQrModal from '../points/MyPassQrModal';

const MEDALS = ['🥇', '🥈', '🥉'];

const HomeLeaderboard: React.FC = () => {
  const navigate = useNavigate();
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [hidden, setHidden] = useState(false);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchLeaderboard()
      .then((b) => alive && setBoard(b))
      .catch(() => alive && setHidden(true));
    return () => {
      alive = false;
    };
  }, []);

  if (hidden || !board) return null;

  const meOnBoard = board.leaders.some((l) => l.isMe);

  return (
    <section
      className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden"
      aria-labelledby="home-leaderboard-title"
    >
      <div
        className="px-5 py-4 flex items-center justify-between gap-3 text-white"
        style={{ background: 'var(--season-accent, #1d372c)' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
            <Trophy size={20} aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 id="home-leaderboard-title" className="text-base font-black tracking-tight truncate">
              {board.season.emoji} {board.season.label} Leaderboard
            </h2>
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-90">Check in to climb</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowQr(true)}
          className="shrink-0 min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-white text-[#0d1a14] px-3 text-[10px] font-black uppercase tracking-widest"
        >
          <QrCode size={14} aria-hidden /> My QR
        </button>
      </div>

      {board.leaders.length === 0 ? (
        <p className="px-5 py-6 text-sm text-gray-600">
          Nobody’s on the board yet this season. Check in at the next gathering and claim the top spot.
        </p>
      ) : (
        <ol className="divide-y divide-gray-50">
          {board.leaders.map((l) => (
            <li
              key={`${l.rank}-${l.name}`}
              className={`flex items-center gap-3 px-5 py-3 ${l.isMe ? 'font-black' : ''}`}
              style={l.isMe ? { background: 'var(--season-accent-soft, #fdf6d8)' } : undefined}
            >
              <span className="w-8 text-center text-lg tabular-nums shrink-0" aria-label={`Rank ${l.rank}`}>
                {l.rank <= 3 ? MEDALS[l.rank - 1] : <span className="text-sm font-black text-gray-500">{l.rank}</span>}
              </span>
              <span className="flex-1 min-w-0 truncate text-sm text-[#0d1a14] font-bold">
                {l.name}
                {l.isMe && <span className="ml-1.5 text-[10px] uppercase tracking-widest text-gray-600">You</span>}
              </span>
              <span className="text-sm font-black tabular-nums text-[#0d1a14]">{l.points}</span>
            </li>
          ))}
        </ol>
      )}

      {board.me && !meOnBoard && (
        <p className="px-5 py-3 border-t border-gray-100 text-xs font-bold text-gray-700">
          {board.me.showOnLeaderboard
            ? board.me.rank
              ? `You’re #${board.me.rank} with ${board.me.points} points. Keep going!`
              : 'You’re not on the board yet. Check in to start earning.'
            : `You have ${board.me.points} points (hidden from the board).`}
        </p>
      )}
      <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-3">
        <p className="text-xs text-gray-600">Leader showing a code on screen?</p>
        <button
          type="button"
          onClick={() => navigate('/scan-in')}
          className="inline-flex items-center gap-1.5 text-xs font-black text-[#0d1a14] underline underline-offset-2"
        >
          <ScanLine size={14} aria-hidden /> Scan the room code
        </button>
      </div>

      <MyPassQrModal open={showQr} onClose={() => setShowQr(false)} />
    </section>
  );
};

export default HomeLeaderboard;
