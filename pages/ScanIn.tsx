/**
 * Member self check-in: scan the leader's rotating QR, earn points.
 * Route: /scan-in (also opened by a phone's own camera via /#/scan-in?c=TOKEN)
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, QrCode, ScanLine, Trophy } from 'lucide-react';
import CardScannerCamera from '../components/people/CardScannerCamera';
import KidsParentCheckin from '../components/attendance/KidsParentCheckin';
import { isKidsChooser, selfCheckIn, type KidsChooser, type SelfCheckinResult } from '../lib/checkinPointsClient';

const ScanInPage: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [cameraActive, setCameraActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SelfCheckinResult | null>(null);
  const [kids, setKids] = useState<KidsChooser | null>(null);
  const lastCodeRef = useRef<string | null>(null);

  const submit = useCallback(async (raw: string) => {
    const code = raw.trim();
    if (!code || code === lastCodeRef.current) return;
    lastCodeRef.current = code;
    setBusy(true);
    setError(null);
    try {
      const res = await selfCheckIn(code);
      if (isKidsChooser(res)) setKids(res);
      else setResult(res);
      setCameraActive(false);
    } catch (err: any) {
      setError(err?.message || 'Check-in didn’t go through. Try again.');
      // Let the same screen be scanned again after a moment (the code may have just rotated).
      window.setTimeout(() => {
        if (lastCodeRef.current === code) lastCodeRef.current = null;
      }, 1500);
    } finally {
      setBusy(false);
    }
  }, []);

  // Opened from a phone camera: /#/scan-in?c=TOKEN
  useEffect(() => {
    const fromLink = params.get('c');
    if (!fromLink) return;
    setParams({}, { replace: true });
    void submit(fromLink);
  }, [params, setParams, submit]);

  if (kids) {
    return (
      <KidsParentCheckin
        chooser={kids}
        onScanAgain={() => {
          setKids(null);
          lastCodeRef.current = null;
          setCameraActive(true);
        }}
        onDone={() => navigate('/')}
      />
    );
  }

  if (result) {
    const s = result.summary;
    return (
      <div className="max-w-md mx-auto px-4 py-8 space-y-5">
        <div className="rounded-3xl border border-gray-100 bg-white shadow-sm overflow-hidden text-center">
          <div className="p-6 text-white" style={{ background: 'var(--season-accent, #1d372c)' }}>
            <CheckCircle2 className="mx-auto mb-3" size={44} aria-hidden />
            <p className="text-sm font-bold opacity-90">{result.sessionTitle}</p>
            <h1 className="text-2xl font-black mt-1">
              {result.alreadyCheckedIn ? 'You’re already checked in 👍' : 'You’re checked in!'}
            </h1>
            {!result.alreadyCheckedIn && result.pointsEarned > 0 && (
              <p className="text-5xl font-black mt-4 tabular-nums">+{result.pointsEarned} 🔥</p>
            )}
          </div>

          {!result.alreadyCheckedIn && result.awards.length > 0 && (
            <ul className="p-5 space-y-2 text-left">
              {result.awards.map((a) => (
                <li key={a.reason} className="flex items-center justify-between text-sm">
                  <span className="font-bold text-[#0d1a14]">
                    {a.label}
                    {a.note && <span className="text-gray-500 font-medium"> · {a.note}</span>}
                  </span>
                  <span className="font-black tabular-nums text-[#0d1a14]">+{a.points}</span>
                </li>
              ))}
            </ul>
          )}

          {!result.pointsEnabled && (
            <p className="p-5 text-sm text-gray-600">This gathering doesn’t award points, but you’re on the list.</p>
          )}

          {s && (
            <div className="border-t border-gray-100 p-5 grid grid-cols-2 gap-3 text-left" style={{ background: 'var(--season-accent-soft, #fdf6d8)' }}>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-600">
                  {result.season.emoji} {result.season.label}
                </p>
                <p className="text-2xl font-black text-[#0d1a14] tabular-nums">{s.seasonPoints} pts</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-600">Your rank</p>
                <p className="text-2xl font-black text-[#0d1a14] tabular-nums">
                  {s.rank ? `#${s.rank}` : s.showOnLeaderboard ? '—' : 'Hidden'}
                </p>
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => navigate('/')}
          className="w-full min-h-[52px] rounded-2xl bg-[#0d1a14] text-white font-black inline-flex items-center justify-center gap-2"
        >
          <Trophy size={18} aria-hidden /> See the leaderboard
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8 space-y-5">
      <header className="text-center space-y-2">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-burgundy/5 text-burgundy flex items-center justify-center">
          <QrCode size={26} aria-hidden />
        </div>
        <h1 className="text-2xl font-black text-[#0d1a14] tracking-tight">Scan to check in</h1>
        <p className="text-sm text-gray-600">
          Point your camera at the check-in code on the leader’s screen (not your membership card). Dropping off kids? Scan the code at their classroom door.
        </p>
      </header>

      {busy && (
        <p className="flex items-center justify-center gap-2 text-sm font-bold text-gray-700" role="status">
          <Loader2 className="animate-spin" size={16} aria-hidden /> Checking you in…
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          {error}
        </p>
      )}

      <CardScannerCamera
        active={cameraActive}
        paused={busy}
        onStart={() => setCameraActive(true)}
        onStop={() => setCameraActive(false)}
        onDecode={(value) => void submit(value)}
        disabled={busy}
        hint="Hold the check-in code in the frame"
      />

      {!cameraActive && (
        <button
          type="button"
          onClick={() => setCameraActive(true)}
          className="w-full min-h-[52px] rounded-2xl bg-[#0d1a14] text-white font-black inline-flex items-center justify-center gap-2"
        >
          <ScanLine size={18} aria-hidden /> Start camera
        </button>
      )}

      <p className="text-xs text-center text-gray-500">
        Can’t scan? A leader can check you in by name, and you still get your points.
      </p>
    </div>
  );
};

export default ScanInPage;
