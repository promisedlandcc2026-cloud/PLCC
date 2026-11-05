/**
 * Unified Desk Check-in — one scanner detects adult vs child AWC1.
 * Adult → open non-kids session presence + optional household.
 * Child → open kids session custody with guardian confirm (in/out).
 * Kids Kiosk remains available as full-screen kids desk.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Baby,
  CheckCircle2,
  Loader2,
  LogIn,
  LogOut,
  ScanLine,
  Users,
  X,
} from 'lucide-react';
import { useNav } from '../../App';
import { Role } from '../../types';
import { canPerform } from '../../lib/permissions';
import AccessDenied from '../../components/Layout/AccessDenied';
import AskAdminTitleLink from '../../components/common/AskAdminTitleLink';
import CardScannerCamera from '../../components/people/CardScannerCamera';
import {
  checkInMemberDigitalCard,
} from '../../lib/attendanceRecordsClient';
import { mapCheckinApiError } from '../../lib/attendanceRecordsUi';
import {
  createAttendanceSession,
  fetchAttendanceSessions,
  openAttendanceSession,
} from '../../lib/attendanceSessionsClient';
import {
  ATTENDANCE_SESSIONS_ROUTE,
  CHURCH_TIMEZONE,
  type AttendanceSession,
} from '../../lib/attendanceSessionsTypes';
import {
  churchLocalInputToIso,
  formatSessionDate,
  isoToChurchLocalInput,
} from '../../lib/attendanceSessionsUi';
import { precheckScannedToken } from '../../lib/cardScannerUi';
import { looksLikeBackupOrLegacyId, resolveMembershipPass } from '../../lib/memberPassClient';
import {
  checkInHousehold,
  previewHouseholdByCard,
  type HouseholdPreviewMember,
  type HouseholdPreviewResult,
} from '../../lib/householdCheckinClient';
import {
  kidsCustodyCheckin,
  kidsCustodyCheckout,
  lookupKidsCustodyByCard,
  type KidsCustodyGuardian,
  type KidsCustodyLookupResult,
} from '../../lib/kidsCustodyClient';

type DeskMode = 'in' | 'out';

const DeskCheckInPage: React.FC = () => {
  const { userRole } = useNav();
  const canCheckin = canPerform(userRole as Role, 'attendance.checkin');
  const canManageSessions = canPerform(userRole as Role, 'attendance.session.manage');

  const [mode, setMode] = useState<DeskMode>('in');
  const [adultSessions, setAdultSessions] = useState<AttendanceSession[]>([]);
  const [kidsSessions, setKidsSessions] = useState<AttendanceSession[]>([]);
  const [adultSessionId, setAdultSessionId] = useState('');
  const [kidsSessionId, setKidsSessionId] = useState('');
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [cameraActive, setCameraActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ type: 'ok' | 'err'; message: string } | null>(null);
  const [manualCode, setManualCode] = useState('');

  const [custody, setCustody] = useState<KidsCustodyLookupResult | null>(null);
  const [selectedGuardianUserId, setSelectedGuardianUserId] = useState<string | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [household, setHousehold] = useState<HouseholdPreviewResult | null>(null);
  const [selectedHh, setSelectedHh] = useState<Set<string>>(new Set());
  const [hhSaving, setHhSaving] = useState(false);
  const [hhMsg, setHhMsg] = useState<string | null>(null);
  const [lastAdultToken, setLastAdultToken] = useState<string | null>(null);

  const lastScanRef = useRef<{ value: string; at: number }>({ value: '', at: 0 });
  const scanCooldownUntilRef = useRef(0);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFlash = useCallback((type: 'ok' | 'err', message: string) => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setFlash({ type, message });
    flashTimerRef.current = setTimeout(() => {
      setFlash(null);
      flashTimerRef.current = null;
    }, type === 'ok' ? 2800 : 6000);
  }, []);

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const open = await fetchAttendanceSessions({ status: 'open', limit: 50 });
      const kids = open.filter((s) => String(s.type).toLowerCase() === 'kids');
      const adults = open.filter((s) => String(s.type).toLowerCase() !== 'kids');
      setKidsSessions(kids);
      setAdultSessions(adults);
      setKidsSessionId((prev) =>
        prev && kids.some((s) => s.id === prev) ? prev : kids[0]?.id || ''
      );
      setAdultSessionId((prev) =>
        prev && adults.some((s) => s.id === prev) ? prev : adults[0]?.id || ''
      );
    } catch {
      setKidsSessions([]);
      setAdultSessions([]);
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    if (!canCheckin) return;
    void loadSessions();
  }, [canCheckin, loadSessions]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') setCameraActive(false);
      if (document.visibilityState === 'visible') void loadSessions();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [loadSessions]);

  useEffect(
    () => () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    },
    []
  );

  const ensureKidsSession = useCallback(async (): Promise<string | null> => {
    if (kidsSessionId) return kidsSessionId;
    if (!canManageSessions) return null;
    try {
      const already = await fetchAttendanceSessions({ status: 'open', type: 'kids', limit: 5 });
      if (already[0]?.id) {
        setKidsSessions(already);
        setKidsSessionId(already[0].id);
        return already[0].id;
      }
      const drafts = await fetchAttendanceSessions({ status: 'draft', type: 'kids', limit: 5 });
      let session: AttendanceSession;
      if (drafts[0]?.id) {
        session = (await openAttendanceSession(drafts[0].id)).session;
      } else {
        const nowIso = new Date().toISOString();
        const startsAt = churchLocalInputToIso(isoToChurchLocalInput(nowIso));
        if (!startsAt) throw new Error('Could not set session start time.');
        const created = await createAttendanceSession({
          type: 'kids',
          title: `Kids Check-In — ${formatSessionDate(nowIso)}`,
          startsAt,
          endsAt: null,
          timezone: CHURCH_TIMEZONE,
        });
        session = (await openAttendanceSession(created.id)).session;
      }
      setKidsSessions([session]);
      setKidsSessionId(session.id);
      return session.id;
    } catch (err: any) {
      showFlash('err', String(err?.message || 'Could not start a kids session.'));
      return null;
    }
  }, [canManageSessions, kidsSessionId, showFlash]);

  const clearSheets = useCallback(() => {
    setCustody(null);
    setSelectedGuardianUserId(null);
    setSheetError(null);
    setHousehold(null);
    setSelectedHh(new Set());
    setHhMsg(null);
    setLastAdultToken(null);
  }, []);

  const runAdultCheckin = useCallback(
    async (token: string) => {
      if (!adultSessionId) {
        showFlash('err', 'Open a worship/event session first for adult check-in.');
        return;
      }
      if (mode === 'out') {
        showFlash(
          'err',
          'Going out is for child pickup. Switch to Coming in for adult attendance, or use Kids Kiosk for children.'
        );
        return;
      }
      setBusy(true);
      try {
        const result = await checkInMemberDigitalCard({ sessionId: adultSessionId, token });
        const name = result.displayName || 'PLCC Member';
        showFlash(
          'ok',
          result.alreadyCheckedIn ? `${name} is already checked in.` : `Checked in ${name}`
        );
        setLastAdultToken(token);
        try {
          const preview = await previewHouseholdByCard({ sessionId: adultSessionId, token });
          const eligible = preview.members.filter((m) => !m.alreadyCheckedIn);
          if (eligible.length > 0) {
            setHousehold(preview);
            setSelectedHh(new Set(eligible.map((m) => m.memberId)));
          }
        } catch {
          /* household offer is best-effort */
        }
        scanCooldownUntilRef.current = Date.now() + 4000;
      } catch (err: any) {
        const msg = String(
          err?.message || mapCheckinApiError({}, 'Could not check in this member.')
        );
        showFlash('err', msg);
      } finally {
        setBusy(false);
      }
    },
    [adultSessionId, mode, showFlash]
  );

  const runChildLookup = useCallback(
    async (token: string) => {
      let sessionId = kidsSessionId;
      if (!sessionId) {
        sessionId = (await ensureKidsSession()) || '';
      }
      if (!sessionId) {
        showFlash('err', 'Open a Kids attendance session first (or use Kids Kiosk).');
        return;
      }
      setBusy(true);
      try {
        const result = await lookupKidsCustodyByCard({
          sessionId,
          mode,
          token,
        });
        if (mode === 'in' && result.custodyStatus === 'in') {
          showFlash('err', `${result.childDisplayName} is already checked in for this session.`);
          return;
        }
        if (mode === 'out' && result.custodyStatus !== 'in') {
          showFlash('err', `${result.childDisplayName} is not checked in for this session.`);
          return;
        }
        if (!result.guardians.length) {
          showFlash(
            'err',
            mode === 'in'
              ? 'No authorized drop-off guardians. Set Check In in Family & Access.'
              : 'No authorized pickup guardians. Set Check Out in Family & Access.'
          );
          return;
        }
        setCustody(result);
        setSelectedGuardianUserId(
          result.guardians.length === 1 ? result.guardians[0].guardianUserId : null
        );
        setSheetError(null);
      } catch (err: any) {
        const msg = String(err?.message || '');
        if (/adult membership card|adult_card/i.test(msg)) {
          await runAdultCheckin(token);
          return;
        }
        showFlash('err', msg || 'Could not look up that child card.');
      } finally {
        setBusy(false);
      }
    },
    [ensureKidsSession, kidsSessionId, mode, runAdultCheckin, showFlash]
  );

  const handleToken = useCallback(
    async (raw: string) => {
      const pre = precheckScannedToken(raw);
      if (!pre.ok) {
        const code = String(raw || '').trim();
        if (looksLikeBackupOrLegacyId(code)) {
          try {
            const resolved = await resolveMembershipPass(code);
            if (resolved) {
              await handleToken(resolved);
              return;
            }
          } catch {
            /* fall through to the invalid-card message */
          }
        }
        showFlash('err', 'That QR is not a valid PLCC membership card.');
        return;
      }
      const token = pre.token;
      const now = Date.now();
      if (now < scanCooldownUntilRef.current) return;
      if (lastScanRef.current.value === token && now - lastScanRef.current.at < 2500) return;
      lastScanRef.current = { value: token, at: now };
      clearSheets();

      // Prefer kids custody probe when a kids session exists (or can be started) —
      // adult cards bounce to adult path; dependents stay on custody.
      if (kidsSessionId || canManageSessions || mode === 'out') {
        await runChildLookup(token);
        return;
      }
      // No kids session and cannot create — adult-only desk
      await runAdultCheckin(token);
    },
    [canManageSessions, clearSheets, kidsSessionId, mode, runAdultCheckin, runChildLookup, showFlash]
  );

  const onDecode = useCallback(
    (rawValue: string) => {
      if (busy || isSaving || hhSaving || custody || household) return;
      void handleToken(rawValue);
    },
    [busy, custody, handleToken, hhSaving, household, isSaving]
  );

  const confirmCustody = async () => {
    if (!custody || !selectedGuardianUserId) {
      setSheetError('Select the authorized guardian');
      return;
    }
    const guardian = custody.guardians.find((g) => g.guardianUserId === selectedGuardianUserId);
    setIsSaving(true);
    setSheetError(null);
    try {
      if (mode === 'in') {
        await kidsCustodyCheckin({
          sessionId: custody.sessionId,
          childMemberId: custody.childMemberId,
          guardianUserId: selectedGuardianUserId,
        });
        showFlash(
          'ok',
          `Checked in ${custody.childDisplayName}${guardian ? ` · with ${guardian.displayName}` : ''}`
        );
      } else {
        if (!custody.custodyId) {
          setSheetError('No open custody record for this child');
          return;
        }
        await kidsCustodyCheckout({
          custodyId: custody.custodyId,
          guardianUserId: selectedGuardianUserId,
        });
        showFlash(
          'ok',
          `Checked out ${custody.childDisplayName}${guardian ? ` · to ${guardian.displayName}` : ''}`
        );
      }
      clearSheets();
      scanCooldownUntilRef.current = Date.now() + 5000;
    } catch (err: any) {
      setSheetError(String(err?.message || 'Something went wrong'));
    } finally {
      setIsSaving(false);
    }
  };

  const confirmHousehold = async () => {
    if (!household || selectedHh.size === 0) return;
    setHhSaving(true);
    setHhMsg(null);
    try {
      const result = await checkInHousehold({
        sessionId: household.sessionId,
        anchorMemberId: household.anchorMemberId,
        memberIds: Array.from(selectedHh),
      });
      setHhMsg(
        `Checked in ${result.checkedInCount} household member${
          result.checkedInCount === 1 ? '' : 's'
        }${result.alreadyCheckedInCount ? ` (${result.alreadyCheckedInCount} already in)` : ''}`
      );
      showFlash('ok', 'Household check-in saved.');
      setTimeout(() => {
        clearSheets();
        scanCooldownUntilRef.current = Date.now() + 3000;
      }, 1600);
    } catch (err: any) {
      setHhMsg(err?.message || 'Household check-in failed.');
    } finally {
      setHhSaving(false);
    }
  };

  const onManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = manualCode.trim();
    if (!code) return;
    void handleToken(code);
    setManualCode('');
  };

  if (!canCheckin) {
    return <AccessDenied />;
  }

  const sheetOpen = !!custody || !!household;
  const scannerPaused = busy || isSaving || hhSaving || sheetOpen;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8 pb-28 space-y-5">
      <header className="space-y-2">
        <p className="text-xs font-black uppercase tracking-widest text-burgundy">PLCC Vault</p>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-black text-burgundy tracking-tight flex items-center gap-2">
            <ScanLine size={28} aria-hidden />
            Desk check-in
          </h1>
          <AskAdminTitleLink />
        </div>
        <p className="text-sm text-gray-600 font-medium max-w-lg">
          One scanner: adult cards check into the service session (then you can check in family).
          Child Family Pass cards use Kids custody with guardian confirm. Full-screen kids desk stays
          available.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            setMode('in');
            clearSheets();
          }}
          className={`py-3.5 rounded-2xl font-black text-sm min-h-[52px] inline-flex items-center justify-center gap-2 ${
            mode === 'in'
              ? 'bg-[#0d1a14] text-gold'
              : 'bg-white border border-gray-200 text-gray-600'
          }`}
        >
          <LogIn size={18} />
          Coming in
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('out');
            clearSheets();
          }}
          className={`py-3.5 rounded-2xl font-black text-sm min-h-[52px] inline-flex items-center justify-center gap-2 ${
            mode === 'out'
              ? 'bg-[#0d1a14] text-gold'
              : 'bg-white border border-gray-200 text-gray-600'
          }`}
        >
          <LogOut size={18} />
          Going out
        </button>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3 shadow-sm">
        {loadingSessions ? (
          <p className="text-sm text-gray-500 font-medium flex items-center gap-2">
            <Loader2 size={16} className="animate-spin" /> Loading open sessions…
          </p>
        ) : (
          <>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                Adult / service session
              </span>
              {adultSessions.length === 0 ? (
                <p className="mt-1 text-sm font-semibold text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
                  No open worship/event session.{' '}
                  <Link to={ATTENDANCE_SESSIONS_ROUTE} className="underline font-black">
                    Open Sessions
                  </Link>
                </p>
              ) : (
                <select
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-3 text-sm font-bold text-[#0d1a14] min-h-[48px]"
                  value={adultSessionId}
                  onChange={(e) => setAdultSessionId(e.target.value)}
                >
                  {adultSessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title || s.type} ({s.type})
                    </option>
                  ))}
                </select>
              )}
            </label>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                Kids session (custody)
              </span>
              {kidsSessions.length === 0 ? (
                <p className="mt-1 text-sm font-semibold text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
                  No open Kids session.
                  {canManageSessions
                    ? ' One will start automatically when you scan a child card.'
                    : ' Ask staff to open a Kids session, or use Kids Kiosk.'}
                </p>
              ) : (
                <select
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-3 text-sm font-bold text-[#0d1a14] min-h-[48px]"
                  value={kidsSessionId}
                  onChange={(e) => setKidsSessionId(e.target.value)}
                >
                  {kidsSessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title || 'Kids session'}
                    </option>
                  ))}
                </select>
              )}
            </label>
          </>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-4">
        <CardScannerCamera
          active={cameraActive}
          paused={scannerPaused}
          onStart={() => setCameraActive(true)}
          onStop={() => setCameraActive(false)}
          onDecode={onDecode}
          disabled={scannerPaused}
          hint={
            busy
              ? 'Looking up…'
              : mode === 'in'
                ? 'Scan an adult or child PLCC card'
                : 'Scan child Family Pass for pickup'
          }
        />
        <form onSubmit={onManualSubmit} className="flex gap-2">
          <input
            type="text"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="Card code or backup code"
            className="flex-1 min-h-[48px] rounded-xl border border-gray-200 px-3 font-mono text-sm"
            disabled={scannerPaused}
          />
          <button
            type="submit"
            disabled={scannerPaused || !manualCode.trim()}
            className="min-h-[48px] px-4 rounded-xl bg-[#0d1a14] text-gold font-black text-sm disabled:opacity-40"
          >
            Go
          </button>
        </form>
      </div>

      {flash && (
        <div
          className={`rounded-2xl px-4 py-3.5 font-bold text-sm flex items-start gap-3 ${
            flash.type === 'ok'
              ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
              : 'bg-red-50 text-red-900 border border-red-200'
          }`}
        >
          {flash.type === 'ok' ? <CheckCircle2 size={18} /> : <X size={18} />}
          <span className="flex-1">{flash.message}</span>
          <button type="button" onClick={() => setFlash(null)} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-sm">
        <Link
          to="/events/kids-kiosk"
          className="inline-flex items-center gap-2 font-bold text-burgundy hover:underline"
        >
          <Baby size={16} />
          Full-screen Kids Kiosk
        </Link>
        <Link
          to={ATTENDANCE_SESSIONS_ROUTE}
          className="inline-flex items-center gap-2 font-bold text-gray-600 hover:underline"
        >
          <Users size={16} />
          Attendance Sessions
        </Link>
      </div>

      {/* Child custody sheet */}
      {custody && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end bg-black/50 backdrop-blur-sm">
          <div className="bg-white text-[#0d1a14] rounded-t-3xl max-h-[78dvh] overflow-hidden flex flex-col shadow-2xl">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-gold uppercase tracking-wider">
                  {mode === 'in' ? 'Check in child' : 'Check out child'}
                </p>
                <h2 className="text-xl font-black truncate">{custody.childDisplayName}</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Confirm authorized {mode === 'in' ? 'drop-off' : 'pickup'} guardian
                </p>
              </div>
              <button
                type="button"
                onClick={clearSheets}
                className="p-2.5 text-gray-300 hover:text-burgundy rounded-xl min-h-[44px] min-w-[44px]"
                aria-label="Close"
              >
                <X size={22} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-gray-50">
              {custody.guardians.map((g: KidsCustodyGuardian) => {
                const isSelected = selectedGuardianUserId === g.guardianUserId;
                return (
                  <button
                    key={g.guardianUserId}
                    type="button"
                    onClick={() => setSelectedGuardianUserId(g.guardianUserId)}
                    className={`w-full p-5 flex items-center gap-4 text-left ${
                      isSelected ? 'bg-burgundy/[0.04]' : ''
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-burgundy border-burgundy text-gold' : 'border-gray-200'
                      }`}
                    >
                      {isSelected && <CheckCircle2 size={16} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold truncate">{g.displayName}</p>
                      <p className="text-xs text-gray-400 mt-0.5 capitalize">
                        {String(g.relationshipType || 'guardian').replace(/_/g, ' ')}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="p-5 border-t border-gray-100 space-y-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              {sheetError ? (
                <p className="text-sm font-bold text-red-600 bg-red-50 rounded-xl px-3 py-2.5">
                  {sheetError}
                </p>
              ) : null}
              <button
                type="button"
                disabled={isSaving || !selectedGuardianUserId}
                onClick={() => void confirmCustody()}
                className="w-full py-4 rounded-2xl bg-burgundy text-gold font-black text-base disabled:opacity-40 min-h-[56px]"
              >
                {isSaving ? 'Saving…' : mode === 'in' ? 'Check In Child' : 'Check Out Child'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Household offer after adult scan */}
      {household && !custody && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end bg-black/50 backdrop-blur-sm">
          <div className="bg-white text-[#0d1a14] rounded-t-3xl max-h-[78dvh] overflow-hidden flex flex-col shadow-2xl">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-gold uppercase tracking-wider">
                  Check in family?
                </p>
                <h2 className="text-xl font-black">Household members</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Select who is with this adult (linked on their family profile).
                </p>
              </div>
              <button
                type="button"
                onClick={clearSheets}
                className="p-2.5 text-gray-300 hover:text-burgundy rounded-xl min-h-[44px] min-w-[44px]"
                aria-label="Close"
              >
                <X size={22} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-gray-50">
              {household.members.map((m: HouseholdPreviewMember) => {
                const isSelected = selectedHh.has(m.memberId);
                const locked = m.alreadyCheckedIn;
                return (
                  <button
                    key={m.memberId}
                    type="button"
                    disabled={locked}
                    onClick={() => {
                      if (locked) return;
                      setSelectedHh((prev) => {
                        const next = new Set(prev);
                        if (next.has(m.memberId)) next.delete(m.memberId);
                        else next.add(m.memberId);
                        return next;
                      });
                    }}
                    className={`w-full p-5 flex items-center gap-4 text-left disabled:opacity-50 ${
                      isSelected ? 'bg-burgundy/[0.04]' : ''
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-burgundy border-burgundy text-gold' : 'border-gray-200'
                      }`}
                    >
                      {isSelected && <CheckCircle2 size={16} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold truncate">{m.displayName}</p>
                      <p className="text-xs text-gray-400 mt-0.5 capitalize">
                        {locked
                          ? 'Already checked in'
                          : String(m.relationshipType || 'member').replace(/_/g, ' ')}
                        {m.isAnchor ? ' · card holder' : ''}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="p-5 border-t border-gray-100 space-y-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              {hhMsg ? (
                <p className="text-sm font-bold text-emerald-800 bg-emerald-50 rounded-xl px-3 py-2.5">
                  {hhMsg}
                </p>
              ) : null}
              <button
                type="button"
                disabled={hhSaving || selectedHh.size === 0}
                onClick={() => void confirmHousehold()}
                className="w-full py-4 rounded-2xl bg-burgundy text-gold font-black text-base disabled:opacity-40 min-h-[56px]"
              >
                {hhSaving ? 'Saving…' : `Check in family (${selectedHh.size})`}
              </button>
              <button
                type="button"
                disabled={hhSaving}
                onClick={clearSheets}
                className="w-full py-3 rounded-2xl border border-gray-200 font-bold text-sm text-gray-600 min-h-[48px]"
              >
                Skip — adult only
              </button>
              {lastAdultToken ? (
                <p className="text-[11px] text-gray-400 text-center">
                  Adult already recorded on the service session.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeskCheckInPage;
