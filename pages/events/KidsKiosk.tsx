/**
 * Phase 2.7D.6 — Kids Kiosk: legacy household path + Family Pass child card custody.
 * Child AWC1 identifies the child; staff confirms authorized guardian.
 * Adult AWC1 loads that family's children on the kiosk (no Start check-in bounce).
 * Legacy UUID/4-digit unchanged.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LogIn,
  LogOut,
  CheckCircle2,
  X,
  Users,
  ListChecks,
  Hash,
  ArrowLeft,
  Loader2,
} from 'lucide-react';
import { useNav } from '../../App';
import { Role } from '../../types';
import { canPerform } from '../../lib/permissions';
import { apiFetch } from '../../lib/api';
import { isValidCardToken } from '../../lib/cardScannerUi';
import { looksLikeBackupOrLegacyId, resolveMembershipPass } from '../../lib/memberPassClient';
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
import { checkInMemberManual } from '../../lib/attendanceRecordsClient';
import {
  fetchKidsCustodyOpenCount,
  kidsCustodyCheckin,
  kidsCustodyCheckout,
  lookupKidsCustodyByCard,
  type KidsCustodyGuardian,
  type KidsCustodyLookupResult,
} from '../../lib/kidsCustodyClient';
import CardScannerCamera from '../../components/people/CardScannerCamera';
import AskAdminTitleLink from '../../components/common/AskAdminTitleLink';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const POST_SUCCESS_SCAN_COOLDOWN_MS = 8000;

type KioskMode = 'in' | 'out';

type KioskChild = {
  id: string;
  name: string;
  age?: number | string | null;
  room?: string;
  access_code?: string;
  parent_id?: string;
  attendanceId?: string | null;
  custodyId?: string | null;
  checkInGuardianUserId?: string | null;
  status?: 'in' | 'out' | 'none';
  checkInTime?: string | null;
  isAdultPass?: boolean;
  allergyAlert?: string | null;
  notes?: string | null;
};

const KidsKioskPage: React.FC = () => {
  const { userRole } = useNav();
  const canManageSessions = canPerform(userRole as Role, 'attendance.session.manage');
  const [mode, setMode] = useState<KioskMode>('in');
  const [code, setCode] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [scannerPaused, setScannerPaused] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [familyName, setFamilyName] = useState('');
  const [scannedName, setScannedName] = useState('');
  const [children, setChildren] = useState<KioskChild[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<{
    type: 'ok' | 'err';
    message: string;
    href?: string;
    hrefLabel?: string;
  } | null>(null);
  const [todayInCount, setTodayInCount] = useState(0);
  const [kidsSessions, setKidsSessions] = useState<AttendanceSession[]>([]);
  const [sessionId, setSessionId] = useState<string>('');
  const [custody, setCustody] = useState<KidsCustodyLookupResult | null>(null);
  const [selectedGuardianUserId, setSelectedGuardianUserId] = useState<string | null>(null);
  const [custodyOpenCount, setCustodyOpenCount] = useState(0);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const lastScanRef = useRef<{ value: string; at: number }>({ value: '', at: 0 });
  const scanCooldownUntilRef = useRef(0);
  const successHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualRef = useRef<HTMLInputElement>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  const applyOpenKidsSessions = useCallback((sessions: AttendanceSession[]) => {
    setKidsSessions(sessions);
    if (!sessions.length) {
      setSessionId('');
      return;
    }
    const current = sessionIdRef.current;
    if (current && sessions.some((s) => s.id === current)) return;
    setSessionId(sessions[0].id);
  }, []);

  const loadKidsSessions = useCallback(async () => {
    try {
      const sessions = await fetchAttendanceSessions({ status: 'open', type: 'kids', limit: 20 });
      applyOpenKidsSessions(sessions);
      return sessions;
    } catch {
      applyOpenKidsSessions([]);
      return [] as AttendanceSession[];
    }
  }, [applyOpenKidsSessions]);

  useEffect(() => {
    void loadKidsSessions();
  }, [loadKidsSessions]);

  useEffect(
    () => () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      if (successHoldTimerRef.current) clearTimeout(successHoldTimerRef.current);
    },
    []
  );

  // Refresh when returning from Sessions / unlocking tablet
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') void loadKidsSessions();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
    };
  }, [loadKidsSessions]);

  useEffect(() => {
    const refreshLegacyCount = async () => {
      try {
        const res = await fetch(
          '/api/vault?resource=events&subResource=attendance&kids=true&limit=100&all=false'
        );
        const data = await res.json();
        if (data.ok) {
          const open = (data.attendance || []).filter((a: any) => !a.check_out_time);
          setTodayInCount(open.length);
        }
      } catch {
        /* ignore */
      }
    };
    refreshLegacyCount();
    const t = setInterval(refreshLegacyCount, 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!sessionId) {
      setCustodyOpenCount(0);
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      const n = await fetchKidsCustodyOpenCount(sessionId);
      if (!cancelled) setCustodyOpenCount(n);
    };
    refresh();
    const t = setInterval(refresh, 30000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [sessionId]);

  useEffect(() => {
    if (showManual) setTimeout(() => manualRef.current?.focus(), 80);
  }, [showManual]);

  const dismissFlash = useCallback(() => {
    if (flashTimerRef.current) {
      clearTimeout(flashTimerRef.current);
      flashTimerRef.current = null;
    }
    setFlash(null);
  }, []);

  const showFlash = useCallback(
    (type: 'ok' | 'err', message: string, link?: { href: string; label: string }) => {
      if (flashTimerRef.current) {
        clearTimeout(flashTimerRef.current);
        flashTimerRef.current = null;
      }
      setFlash({ type, message, href: link?.href, hrefLabel: link?.label });
      flashTimerRef.current = setTimeout(() => {
        setFlash(null);
        flashTimerRef.current = null;
      }, type === 'ok' ? 2500 : 6000);
    },
    []
  );

  const clearFamily = useCallback(() => {
    setFamilyName('');
    setScannedName('');
    setChildren([]);
    setSelected(new Set());
    setCode('');
    setCustody(null);
    setSelectedGuardianUserId(null);
    setSheetError(null);
    setShowManual(false);
    setScannerPaused(false);
  }, []);

  /** Close sheet, block the same QR from instantly reopening while still in frame. */
  const finishSuccessfulCheckin = useCallback(() => {
    lastScanRef.current = { value: lastScanRef.current.value, at: Date.now() };
    scanCooldownUntilRef.current = Date.now() + POST_SUCCESS_SCAN_COOLDOWN_MS;
    clearFamily();
    setScannerPaused(true);
    setCameraActive(true);
    if (successHoldTimerRef.current) clearTimeout(successHoldTimerRef.current);
    successHoldTimerRef.current = setTimeout(() => {
      setScannerPaused(false);
      successHoldTimerRef.current = null;
    }, POST_SUCCESS_SCAN_COOLDOWN_MS);
  }, [clearFamily]);

  /** Create (or open draft) + open a Kids session so Family Pass scans stay on the kiosk. */
  const startKidsSessionNow = useCallback(async (): Promise<string | null> => {
    if (isStartingSession) return null;
    setIsStartingSession(true);
    try {
      const alreadyOpen = await fetchAttendanceSessions({ status: 'open', type: 'kids', limit: 20 });
      if (alreadyOpen.length) {
        applyOpenKidsSessions(alreadyOpen);
        return alreadyOpen[0].id;
      }

      const drafts = await fetchAttendanceSessions({ status: 'draft', type: 'kids', limit: 20 });
      let session: AttendanceSession;
      if (drafts.length) {
        const opened = await openAttendanceSession(drafts[0].id);
        session = opened.session;
      } else {
        const nowIso = new Date().toISOString();
        const startsLocal = isoToChurchLocalInput(nowIso);
        const startsAt = churchLocalInputToIso(startsLocal);
        if (!startsAt) throw new Error('Could not set session start time.');
        const created = await createAttendanceSession({
          type: 'kids',
          title: `Kids Check-In — ${formatSessionDate(nowIso)}`,
          startsAt,
          endsAt: null,
          timezone: CHURCH_TIMEZONE,
        });
        const opened = await openAttendanceSession(created.id);
        session = opened.session;
      }

      applyOpenKidsSessions([session]);
      showFlash('ok', `Kids session open: ${session.title || 'Kids Check-In'}`);
      return session.id;
    } catch (err: any) {
      showFlash('err', String(err?.message || 'Could not start a kids session.'));
      return null;
    } finally {
      setIsStartingSession(false);
    }
  }, [applyOpenKidsSessions, isStartingSession]);

  const applyLegacyFamily = useCallback(
    (data: { familyName?: string; scannedName?: string; children?: KioskChild[] }) => {
      setFamilyName(data.familyName || '');
      setScannedName(data.scannedName || '');
      setChildren(data.children || []);
      setShowManual(false);

      const next = new Set<string>();
      for (const c of data.children || []) {
        if (mode === 'in' && c.status !== 'in') next.add(c.id);
        if (mode === 'out' && c.status === 'in') next.add(c.id);
      }
      setSelected(next);
      setCode('');
    },
    [mode]
  );

  const lookupLegacy = useCallback(
    async (q: string) => {
      setIsLookingUp(true);
      setScannerPaused(true);
      try {
        const useCardPost = isValidCardToken(q);
        const data = useCardPost
          ? await apiFetch<{
              ok?: boolean;
              found?: boolean;
              error?: string;
              familyName?: string;
              scannedName?: string;
              children?: KioskChild[];
            }>('/api/vault?resource=events&subResource=kiosk-lookup', {
              method: 'POST',
              body: JSON.stringify({ token: q }),
            })
          : await apiFetch<{
              ok?: boolean;
              found?: boolean;
              error?: string;
              familyName?: string;
              scannedName?: string;
              children?: KioskChild[];
            }>(
              `/api/vault?resource=events&subResource=kiosk-lookup&query=${encodeURIComponent(q)}`,
              { method: 'GET' }
            );
        if (!data.ok) {
          showFlash('err', data.error || 'Could not look up that code');
          setScannerPaused(false);
          return false;
        }
        if (!data.found || !data.children?.length) {
          showFlash('err', 'No family found — try again');
          setScannerPaused(false);
          return false;
        }

        applyLegacyFamily(data);
        return true;
      } catch (err: any) {
        console.error(err);
        showFlash('err', String(err?.message || 'Lookup failed. Check the connection.'));
        setScannerPaused(false);
        return false;
      } finally {
        setIsLookingUp(false);
      }
    },
    [applyLegacyFamily]
  );

  const lookupFamilyPass = useCallback(
    async (token: string) => {
      let activeSessionId = sessionId;
      if (!activeSessionId) {
        if (canManageSessions) {
          showFlash('ok', 'Starting kids session…');
          activeSessionId = (await startKidsSessionNow()) || '';
        }
        if (!activeSessionId) {
          // Parent membership cards can still load the legacy family list without a kids session.
          const ok = await lookupLegacy(token);
          if (!ok) {
            showFlash('err', 'Open a Kids attendance session for Family Pass child cards, or use a 4-digit code.', {
              href: ATTENDANCE_SESSIONS_ROUTE,
              label: 'Open Sessions',
            });
          }
          return;
        }
      }
      setIsLookingUp(true);
      setScannerPaused(true);
      try {
        const result = await lookupKidsCustodyByCard({
          sessionId: activeSessionId,
          mode,
          token,
        });

        if (mode === 'in' && result.custodyStatus === 'in') {
          showFlash('err', `${result.childDisplayName} is already checked in for this session.`);
          setScannerPaused(false);
          return;
        }
        // Checked in via parent/legacy desk path — fall back so Going out still works.
        if (mode === 'out' && result.custodyStatus !== 'in') {
          setIsLookingUp(false);
          const ok = await lookupLegacy(token);
          if (!ok) {
            showFlash(
              'err',
              `${result.childDisplayName} is not checked in. Try the parent membership QR or confirm they were checked in on this kiosk.`
            );
            setScannerPaused(false);
          }
          return;
        }
        if (!result.guardians.length) {
          showFlash(
            'err',
            mode === 'in'
              ? 'No authorized drop-off guardians for this child. Set Check In in Family & Access.'
              : 'No authorized pickup guardians for this child. Set Check Out in Family & Access.'
          );
          setScannerPaused(false);
          return;
        }

        setCustody(result);
        setSelectedGuardianUserId(
          result.guardians.length === 1 ? result.guardians[0].guardianUserId : null
        );
        setShowManual(false);
        setCode('');
      } catch (err: any) {
        const msg = String(err?.message || '');
        // Adult membership QR → stay on kiosk and load that family's children (no Start check-in bounce).
        if (/adult membership card|adult_card/i.test(msg)) {
          setIsLookingUp(false);
          const ok = await lookupLegacy(token);
          if (!ok) {
            showFlash(
              'err',
              'That’s a parent membership card with no children on file. Scan the child’s Family Pass QR, or type their 4-digit code.'
            );
            setScannerPaused(false);
          }
          return;
        }
        showFlash('err', msg || 'Could not look up that child card');
        setScannerPaused(false);
      } finally {
        setIsLookingUp(false);
      }
    },
    [canManageSessions, lookupLegacy, mode, sessionId, startKidsSessionNow]
  );

  const lookup = useCallback(
    async (raw: string) => {
      const q = raw.trim();
      if (!q) return;

      // Family Pass child cards share AWC1 format with adult cards — resolve server-side.
      if (isValidCardToken(q) || /^AWC1\./i.test(q)) {
        if (!isValidCardToken(q)) {
          showFlash('err', 'That QR is not a valid PLCC membership card.');
          setScannerPaused(false);
          return;
        }
        await lookupFamilyPass(q);
        return;
      }

      if (looksLikeBackupOrLegacyId(q)) {
        try {
          const resolved = await resolveMembershipPass(q);
          if (resolved) {
            await lookupFamilyPass(resolved);
            return;
          }
        } catch {
          /* keep the older family lookup when the pass cannot be resolved */
        }
      }

      await lookupLegacy(q);
    },
    [lookupFamilyPass, lookupLegacy]
  );

  const onDecode = useCallback(
    (rawValue: string) => {
      const value = String(rawValue || '').trim();
      if (!value || isLookingUp || isSaving || children.length > 0 || custody) return;

      const now = Date.now();
      if (now < scanCooldownUntilRef.current) return;
      if (lastScanRef.current.value === value && now - lastScanRef.current.at < 2500) return;
      lastScanRef.current = { value, at: now };

      setShowManual(false);
      setSheetError(null);
      showFlash('ok', 'QR detected — looking up…');
      void lookup(value);
    },
    [children.length, custody, isLookingUp, isSaving, lookup]
  );

  // Same as Sessions: stop camera when the tab is backgrounded (iPad Safari)
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') setCameraActive(false);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    lookup(code);
  };

  const toggleChild = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirmLegacy = async () => {
    const picked = children.filter((c) => selected.has(c.id));
    if (picked.length === 0) {
      setSheetError(mode === 'in' ? 'Select who is coming in' : 'Select who is going out');
      return;
    }

    setIsSaving(true);
    setSheetError(null);
    try {
      let successMsg = '';
      if (mode === 'in') {
        const data = await apiFetch<{ ok?: boolean; error?: string; securityCode?: string }>(
          '/api/vault?resource=events&subResource=checkin',
          {
            method: 'POST',
            body: JSON.stringify({
              kind: 'kids',
              memberIds: picked.map((c) => c.id),
              entries: picked.map((c) => ({ id: c.id, name: c.name })),
            }),
          }
        );
        if (!data.ok) throw new Error(data.error || 'Check-in failed');

        // Mirror real child members onto the open kids session roster (Who checked in).
        if (sessionId) {
          for (const c of picked) {
            if (!UUID_RE.test(c.id)) continue;
            try {
              await checkInMemberManual({ sessionId, memberId: c.id });
            } catch {
              /* already in / not eligible — desk list still has custody or legacy */
            }
          }
        }

        successMsg = `Checked in ${picked.length}${
          data.securityCode ? ` · code ${data.securityCode}` : ''
        }`;
        setTodayInCount((n) => n + picked.length);
        if (sessionId) setCustodyOpenCount((n) => n + picked.length);
      } else {
        const attendanceIds = picked
          .map((c) => c.attendanceId)
          .filter((id): id is string => !!id);
        const custodyCheckouts = picked.filter((c) => c.custodyId && c.checkInGuardianUserId);

        if (attendanceIds.length === 0 && custodyCheckouts.length === 0) {
          setSheetError(
            'Those children are not checked in yet. Switch to Coming in, check them in, then try Going out.'
          );
          return;
        }

        let nOut = 0;
        if (attendanceIds.length) {
          const data = await apiFetch<{ ok?: boolean; error?: string; checkedOut?: number }>(
            '/api/vault?resource=events&subResource=attendance',
            {
              method: 'PATCH',
              body: JSON.stringify({ attendanceIds }),
            }
          );
          if (!data.ok) throw new Error(data.error || 'Check-out failed');
          nOut += data.checkedOut || attendanceIds.length;
        }
        for (const c of custodyCheckouts) {
          try {
            await kidsCustodyCheckout({
              custodyId: String(c.custodyId),
              guardianUserId: String(c.checkInGuardianUserId),
            });
            nOut += 1;
          } catch (err: any) {
            // If drop-off guardian cannot also pick up, surface a clear desk message.
            throw new Error(
              err?.message ||
                `Could not check out ${c.name}. Confirm a Check Out guardian in Family & Access.`
            );
          }
        }
        successMsg = `Checked out ${nOut}`;
        setTodayInCount((n) => Math.max(0, n - nOut));
        if (sessionId) setCustodyOpenCount((n) => Math.max(0, n - custodyCheckouts.length));
      }
      finishSuccessfulCheckin();
      showFlash('ok', successMsg);
    } catch (err: any) {
      console.error(err);
      setSheetError(String(err?.message || 'Something went wrong'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmCustody = async () => {
    if (!custody || !selectedGuardianUserId) {
      setSheetError('Select the authorized guardian');
      return;
    }
    const childName = custody.childDisplayName;
    const guardian = custody.guardians.find((g) => g.guardianUserId === selectedGuardianUserId);
    const sessionForCheckin = custody.sessionId;
    const childMemberId = custody.childMemberId;
    const custodyId = custody.custodyId;
    setIsSaving(true);
    setSheetError(null);
    try {
      let successMsg = '';
      if (mode === 'in') {
        await kidsCustodyCheckin({
          sessionId: sessionForCheckin,
          childMemberId,
          guardianUserId: selectedGuardianUserId,
        });
        // Also presence on the kids session roster so Who checked in shows the name.
        try {
          await checkInMemberManual({
            sessionId: sessionForCheckin,
            memberId: childMemberId,
          });
        } catch {
          /* custody is source of truth if roster insert is blocked */
        }
        successMsg = `Checked in ${childName}${guardian ? ` · with ${guardian.displayName}` : ''}`;
        setCustodyOpenCount((n) => n + 1);
      } else {
        if (!custodyId) {
          setSheetError('No open custody record for this child');
          return;
        }
        await kidsCustodyCheckout({
          custodyId,
          guardianUserId: selectedGuardianUserId,
        });
        successMsg = `Checked out ${childName}${guardian ? ` · to ${guardian.displayName}` : ''}`;
        setCustodyOpenCount((n) => Math.max(0, n - 1));
      }
      finishSuccessfulCheckin();
      showFlash('ok', successMsg);
    } catch (err: any) {
      console.error(err);
      setSheetError(String(err?.message || 'Something went wrong'));
    } finally {
      setIsSaving(false);
    }
  };

  const hereCount = sessionId ? custodyOpenCount : todayInCount;

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#1a0008] text-white flex flex-col">
      {/* Top bar */}
      <header className="relative z-20 flex items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <Link
          to="/events/check-someone-in"
          className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white/90 font-bold text-sm min-h-[44px]"
        >
          <ArrowLeft size={18} />
          Exit
        </Link>
        <div className="text-center min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold/80">PLCC Vault</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <h1 className="text-lg sm:text-xl font-black tracking-tight truncate">Kids Kiosk Scanner</h1>
            <AskAdminTitleLink className="text-gold/90 hover:text-gold border-white/10 hover:bg-white/10" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex px-3 py-2 rounded-xl bg-white/10 text-sm font-bold">
            <span className="text-white/50 font-medium mr-2">Here</span>
            {hereCount}
          </div>
          <Link
            to="/events/kids-checked-in"
            className="p-2.5 rounded-xl bg-white/10 hover:bg-white/15 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Checked-in list"
          >
            <ListChecks size={18} />
          </Link>
        </div>
      </header>

      {/* Kids session picker (Family Pass custody) */}
      <div className="relative z-20 px-4 pb-2">
        {kidsSessions.length === 0 ? (
          <div className="rounded-2xl bg-amber-500/15 border border-amber-400/30 px-4 py-3 text-amber-100 text-xs font-bold leading-relaxed space-y-3">
            <p>
              Family Pass child cards need an open Kids attendance session. Legacy 4-digit codes still
              work without one.
            </p>
            {canManageSessions ? (
              <button
                type="button"
                disabled={isStartingSession}
                onClick={() => void startKidsSessionNow()}
                className="w-full inline-flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-gold text-[#0d1a14] font-black text-sm disabled:opacity-50"
              >
                {isStartingSession ? <Loader2 size={16} className="animate-spin" /> : null}
                {isStartingSession ? 'Starting…' : 'Start Kids Session'}
              </button>
            ) : (
              <Link
                to={ATTENDANCE_SESSIONS_ROUTE}
                className="inline-flex items-center justify-center min-h-[44px] rounded-xl bg-white/15 px-3 text-xs font-black uppercase tracking-widest text-gold"
              >
                Open Sessions
              </Link>
            )}
          </div>
        ) : (
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">
              Kids session (Family Pass)
            </span>
            <select
              className="mt-1 w-full rounded-2xl bg-white/10 border border-white/15 px-4 py-3 text-sm font-bold text-white min-h-[48px]"
              value={sessionId}
              onChange={(e) => {
                setSessionId(e.target.value);
                clearFamily();
              }}
            >
              {kidsSessions.map((s) => (
                <option key={s.id} value={s.id} className="text-[#0d1a14]">
                  {s.title || 'Kids session'}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Mode toggle */}
      <div className="relative z-20 px-4 pb-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            setMode('in');
            clearFamily();
          }}
          className={`py-3.5 rounded-2xl font-black text-sm min-h-[52px] flex items-center justify-center gap-2 transition-all ${
            mode === 'in' ? 'bg-gold text-[#0d1a14]' : 'bg-white/10 text-white/60'
          }`}
        >
          <LogIn size={18} />
          Coming in
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('out');
            clearFamily();
          }}
          className={`py-3.5 rounded-2xl font-black text-sm min-h-[52px] flex items-center justify-center gap-2 transition-all ${
            mode === 'out' ? 'bg-gold text-[#0d1a14]' : 'bg-white/10 text-white/60'
          }`}
        >
          <LogOut size={18} />
          Going out
        </button>
      </div>

      {/* Camera stage — same CardScannerCamera stack as Sessions (works on iPad) */}
      <div className="relative flex-1 min-h-0 mx-4 mb-3">
        <CardScannerCamera
          variant="kiosk"
          active={cameraActive}
          paused={
            scannerPaused || children.length > 0 || !!custody || isLookingUp || isSaving
          }
          onStart={() => setCameraActive(true)}
          onStop={() => setCameraActive(false)}
          onDecode={onDecode}
          disabled={isLookingUp || isSaving || children.length > 0 || !!custody}
          hint={
            isLookingUp
              ? 'Looking up…'
              : mode === 'in'
                ? 'Scan child Family Pass, parent membership QR, or use 4-digit code'
                : 'Scan to check children out'
          }
        />
        {isLookingUp && (
          <div className="absolute inset-0 z-10 bg-black/50 flex items-center justify-center rounded-3xl">
            <div className="w-12 h-12 border-4 border-white/20 border-t-gold rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Manual code + actions */}
      <div className="relative z-20 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3">
        {flash && (
          <div
            className={`relative z-40 rounded-2xl px-4 py-3.5 font-bold text-sm flex flex-col gap-2 ${
              flash.type === 'ok' ? 'bg-green-500/20 text-green-200' : 'bg-red-500/20 text-red-200'
            }`}
          >
            <div className="flex items-start gap-3">
              {flash.type === 'ok' ? (
                <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
              ) : (
                <X size={18} className="shrink-0 mt-0.5" />
              )}
              <span className="flex-1 min-w-0">{flash.message}</span>
              <button
                type="button"
                onClick={dismissFlash}
                className="shrink-0 p-1.5 rounded-lg hover:bg-white/10 min-h-[36px] min-w-[36px] flex items-center justify-center"
                aria-label="Dismiss"
              >
                <X size={16} />
              </button>
            </div>
            {flash.href && flash.hrefLabel && (
              <Link
                to={flash.href}
                className="ml-8 inline-flex items-center justify-center min-h-[40px] rounded-xl bg-white/15 px-3 text-xs font-black uppercase tracking-widest text-gold"
              >
                {flash.hrefLabel}
              </Link>
            )}
          </div>
        )}

        {!showManual ? (
          <button
            type="button"
            onClick={() => {
              setShowManual(true);
              // Do not pause the camera — staff can still scan while the field is open
            }}
            className="w-full py-3.5 rounded-2xl bg-white/10 border border-white/10 font-bold text-sm text-white/90 inline-flex items-center justify-center gap-2 min-h-[48px]"
          >
            <Hash size={16} />
            Type 4-digit code instead
          </button>
        ) : (
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              ref={manualRef}
              type="text"
              inputMode="text"
              maxLength={80}
              placeholder="4-digit code or paste AWC1…"
              className="flex-1 px-4 py-3.5 rounded-2xl bg-white text-[#0d1a14] font-black text-lg tracking-[0.08em] text-center outline-none min-h-[52px]"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <button
              type="submit"
              disabled={!code.trim() || isLookingUp}
              className="px-5 rounded-2xl bg-gold text-[#0d1a14] font-black text-sm disabled:opacity-40 min-h-[52px]"
            >
              Go
            </button>
            <button
              type="button"
              onClick={() => {
                setShowManual(false);
                setCode('');
                if (children.length === 0 && !custody) setScannerPaused(false);
              }}
              className="px-4 rounded-2xl bg-white/10 font-bold text-sm min-h-[52px]"
            >
              Camera
            </button>
          </form>
        )}
      </div>

      {/* Family Pass custody sheet */}
      {custody && (
        <div className="absolute inset-0 z-30 flex flex-col justify-end bg-black/55 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white text-[#0d1a14] rounded-t-3xl max-h-[78dvh] overflow-hidden flex flex-col shadow-2xl">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 shrink-0">
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
                onClick={clearFamily}
                className="p-2.5 text-gray-300 hover:text-burgundy rounded-xl min-h-[44px] min-w-[44px] flex items-center justify-center"
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

            <div className="p-5 border-t border-gray-100 shrink-0 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-3">
              {sheetError ? (
                <p className="text-sm font-bold text-red-600 bg-red-50 rounded-xl px-3 py-2.5">
                  {sheetError}
                </p>
              ) : null}
              <button
                type="button"
                disabled={isSaving || !selectedGuardianUserId}
                onClick={() => void handleConfirmCustody()}
                className="w-full py-4 rounded-2xl bg-burgundy text-gold font-black text-base disabled:opacity-40 min-h-[56px]"
              >
                {isSaving
                  ? 'Saving…'
                  : mode === 'in'
                    ? 'Check In Child'
                    : 'Check Out Child'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Legacy family sheet after scan */}
      {children.length > 0 && !custody && (
        <div className="absolute inset-0 z-30 flex flex-col justify-end bg-black/55 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white text-[#0d1a14] rounded-t-3xl max-h-[78dvh] overflow-hidden flex flex-col shadow-2xl">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-gold uppercase tracking-wider">Family found</p>
                <h2 className="text-xl font-black truncate">{familyName}</h2>
                {scannedName && (
                  <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                    <Users size={11} />
                    Pass: {scannedName}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={clearFamily}
                className="p-2.5 text-gray-300 hover:text-burgundy rounded-xl min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Close"
              >
                <X size={22} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 divide-y divide-gray-50">
              {children.map((child) => {
                const isSelected = selected.has(child.id);
                const badge =
                  child.status === 'in'
                    ? { label: 'Inside now', className: 'bg-green-50 text-green-700' }
                    : child.status === 'out'
                      ? { label: 'Already out', className: 'bg-gray-100 text-gray-500' }
                      : { label: 'Not in yet', className: 'bg-amber-50 text-amber-800' };

                return (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() => toggleChild(child.id)}
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
                      <p className="font-bold truncate">{child.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {child.isAdultPass ? 'Member pass' : child.room || 'Kids'}
                      </p>
                      {child.allergyAlert ? (
                        <p className="mt-1.5 inline-flex max-w-full text-[10px] font-black uppercase tracking-wide bg-[#0d1a14] text-[#C9A35A] px-2 py-1 rounded-md">
                          Allergy:{' '}
                          <span className="normal-case tracking-normal font-bold ml-1 truncate">
                            {child.allergyAlert}
                          </span>
                        </p>
                      ) : null}
                    </div>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-lg ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="p-5 border-t border-gray-100 shrink-0 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-3">
              {sheetError ? (
                <p className="text-sm font-bold text-red-600 bg-red-50 rounded-xl px-3 py-2.5">
                  {sheetError}
                </p>
              ) : null}
              <button
                type="button"
                disabled={isSaving || selected.size === 0}
                onClick={() => void handleConfirmLegacy()}
                className="w-full py-4 rounded-2xl bg-burgundy text-gold font-black text-base disabled:opacity-40 min-h-[56px]"
              >
                {isSaving
                  ? 'Saving…'
                  : mode === 'in'
                    ? `Check in (${selected.size})`
                    : `Check out (${selected.size})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KidsKioskPage;
