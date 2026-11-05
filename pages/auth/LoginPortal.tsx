import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ShieldCheck, Lock,
  ArrowRight, ArrowLeft, Loader2, Key, Mail, RefreshCcw,
  LogIn, Fingerprint, HelpCircle, Phone,
} from 'lucide-react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useNav } from '../../lib/NavContext';
import { Section } from '../../types';
import { accountantHomePath, isAccountantRole, isKioskRole, kioskHomePath } from '../../lib/permissions';
import {
  sendEmailOtp,
  sendPhoneOtp,
  verifyEmailOtp, verifyPhoneOtp,
  isPhoneNumber, normalisePhone,
  sanitizeAuthIdentifier,
  signUpWithPassword,
  signInWithPassword,
  signInWithPhonePassword,
  signUpWithPhone,
  withAuthTimeout,
} from '../../lib/authOtp';
import { signInWithPasskey } from '../../lib/authSecurity';
import {
  consumeReturnTo,
  consumeSessionExpiredNotice,
  peekReturnTo,
  peekSessionExpiredNotice,
  returnToFromRouterLocation,
  sanitizeReturnTo,
} from '../../lib/authSession';
import { isLocalDevHost, LOCAL_UI_PREVIEW_PROFILE } from '../../lib/localUiPreview';
import { AwcOneBackground, AwcOneHeader, AwcOneScene, AwcOneTiles, AwcOneFooter } from '../../components/awcone/AwcOneChrome';
import { TITHE_URL as AWC_ONE_TITHE_URL, rememberPendingApp, type AwcOneAppId } from '../../lib/awcOne';

// ─── Types ───────────────────────────────────────────────────────────────────

type Stage =
  | 'idle'
  | 'identifier'   // Enter email or phone (Login)
  | 'method'       // Choose email OTP vs phone OTP
  | 'otp'          // Enter 6-digit email OTP
  | 'password'     // Phone + vault password (no SMS)
  | 'sms'          // Phone + SMS consent → text a sign-in code
  | 'registration' // Sign-up: First/Last Name, Phone
  | 'credentials'  // Sign-up: Email, Password, Terms
  | 'authorizing'; // Success animation

type OtpMethod = 'email' | 'phone';

/**
 * Text-message sign-in codes. Off until Twilio toll-free verification is approved and the
 * Phone provider is set up in Supabase → Authentication → Providers. Turn on with
 * VITE_SMS_SIGNIN_ENABLED=true in Vercel.
 */
const SMS_SIGNIN_ENABLED = import.meta.env.VITE_SMS_SIGNIN_ENABLED === 'true';

/** Must match the opt-in shown at sanctum-live-nine.vercel.app/sms (carrier review). */
const SMS_CONSENT_TEXT =
  'I agree to receive one-time sign-in codes by text message from Promised Land Christian Center (PLCC Vault) at the mobile number above. Message frequency varies (one text per sign-in request). Message and data rates may apply. Reply STOP to opt out, HELP for help. Consent is not a condition of membership.';
const SMS_TERMS_URL = 'https://sanctum-live-nine.vercel.app/terms';
const SMS_PRIVACY_URL = 'https://sanctum-live-nine.vercel.app/privacy';
type AuthMode = 'login' | 'signup';
type PortalView = 'choose' | 'member';

const MEMBER_SETUP_HELP = '/help/member-setup';

const HelpCreateAccountLink: React.FC<{ className?: string; light?: boolean }> = ({ className = '', light }) => (
  <Link
    to={MEMBER_SETUP_HELP}
    className={`inline-flex items-center justify-center gap-1.5 text-sm font-bold underline-offset-2 hover:underline ${
      light ? 'text-gold/90 hover:text-gold' : 'text-burgundy'
    } ${className}`}
  >
    <HelpCircle size={15} className="shrink-0" />
    How to create your account
  </Link>
);

// ─── OTP Input ───────────────────────────────────────────────────────────────

const OTP_BOX_COUNT = 6;
const OTP_MIN_LEN = 6;
const OTP_MAX_LEN = 6;

const OtpBoxes: React.FC<{
  value: string[];
  onChange: (v: string[]) => void;
  onComplete: (digits: string[]) => void;
}> = ({ value, onChange, onComplete }) => {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const applyDigits = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, OTP_MAX_LEN).split('');
    if (!digits.length) return;
    const next = Array(OTP_BOX_COUNT).fill('');
    digits.forEach((d, i) => { next[i] = d; });
    onChange(next);
    const focusIdx = Math.min(digits.length, OTP_BOX_COUNT) - 1;
    inputRefs.current[Math.max(0, focusIdx)]?.focus();
    if (digits.length >= OTP_MIN_LEN) onComplete(next);
  };

  const set = (idx: number, raw: string) => {
    const cleaned = raw.replace(/\D/g, '');
    // Autofill / OS paste into a single box may deliver the whole code
    if (cleaned.length > 1) {
      applyDigits(cleaned);
      return;
    }
    const next = [...value];
    while (next.length < OTP_BOX_COUNT) next.push('');
    next[idx] = cleaned.slice(0, 1);
    onChange(next);
    if (cleaned && idx < OTP_BOX_COUNT - 1) inputRefs.current[idx + 1]?.focus();
    // Digits only: paste/autofill verify via applyDigits; Confirm Identity for typed codes
  };

  const handleKey = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !value[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    applyDigits(e.clipboardData.getData('text'));
  };

  return (
    <div className="flex gap-2 justify-center" onPaste={handlePaste}>
      {Array.from({ length: OTP_BOX_COUNT }).map((_, i) => (
        <input
          key={i}
          ref={el => inputRefs.current[i] = el}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={i === 0 ? OTP_MAX_LEN : 1}
          value={value[i] || ''}
          onChange={e => set(i, e.target.value)}
          onKeyDown={e => handleKey(i, e)}
          className="w-11 h-14 text-center text-xl font-black text-white bg-white/10 border border-white/15 rounded-xl focus:border-gold/60 focus:bg-white/20 focus:shadow-[0_0_16px_rgba(201, 163, 90,0.2)] outline-none transition-all caret-gold"
        />
      ))}
    </div>
  );
};

// ─── Resend Timer ─────────────────────────────────────────────────────────────

const ResendTimer: React.FC<{ onResend: () => void }> = ({ onResend }) => {
  const [secs, setSecs] = useState(60);
  useEffect(() => {
    if (secs === 0) return;
    const t = setTimeout(() => setSecs(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secs]);

  return secs > 0 ? (
    <span className="text-white/30 text-xs font-bold tabular-nums">Resend in {secs}s</span>
  ) : (
    <button
      type="button"
      onClick={() => { onResend(); setSecs(60); }}
      className="flex items-center gap-1.5 text-gold text-xs font-black hover:text-white transition-colors"
    >
      <RefreshCcw size={12} /> Resend code
    </button>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const LoginPortal: React.FC = () => {
  const { login, setActiveSection } = useNav();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo =
    returnToFromRouterLocation(
      (location.state as { from?: { pathname?: string; search?: string } } | null)?.from
    ) ||
    peekReturnTo() ||
    '';
  const needsCheckInSignIn =
    returnTo.includes('/events/check-in') || returnTo.includes('/events/kids-checkin');
  const [sessionExpiredNotice] = useState(() => peekSessionExpiredNotice());
  useEffect(() => {
    consumeSessionExpiredNotice();
  }, []);

  const [portal, setPortal] = useState<PortalView>('choose');
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [stage, setStage] = useState<Stage>('idle');

  // Login Data
  const [identifier, setIdentifier] = useState('');
  const [identifierType, setIdentifierType] = useState<OtpMethod>('email');
  const [method, setMethod] = useState<OtpMethod>('email');
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(OTP_BOX_COUNT).fill(''));
  const [loginPassword, setLoginPassword] = useState('');
  const [smsConsent, setSmsConsent] = useState(false);
  /** Whether the texted code signs in, or finishes a new sign-up. */
  const [phoneCodePurpose, setPhoneCodePurpose] = useState<'signin' | 'signup'>('signin');

  // Signup Data
  const [regData, setRegData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    password: '',
    agreeToTerms: false
  });

  const [otpLoading, setOtpLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [error, setError] = useState('');
  const identifierInputRef = useRef<HTMLInputElement | null>(null);
  const passkeyTapLockRef = useRef(false);
  const isBusy = otpLoading || passkeyLoading;
  // Passkeys are registered against the production RP ID in Supabase; WebAuthn
  // rejects that on localhost / preview hosts.
  const passkeysAvailable =
    typeof window === 'undefined' ||
    !/^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
  const localUiPreviewAvailable = isLocalDevHost();

  // If they scanned Check-in QR while logged out, open Member Sign In and explain why
  useEffect(() => {
    if (needsCheckInSignIn) {
      setPortal('member');
      setAuthMode('login');
      setStage('idle');
    }
  }, [needsCheckInSignIn]);

  const enterLocalUiPreview = () => {
    setError('');
    login(LOCAL_UI_PREVIEW_PROFILE);
    setActiveSection(Section.Dashboard);
    navigate('/launcher', { replace: true });
  };

  // ── Stage helpers ──────────────────────────────────────────────────────────

  const beginAuth = () => {
    setStage(authMode === 'login' ? 'identifier' : 'registration');
  };

  /** Safari/WebKit often autofills the DOM without firing onChange — read the live input. */
  const readIdentifierFromDom = () => {
    const fromInput = identifierInputRef.current?.value ?? '';
    return sanitizeAuthIdentifier(fromInput || identifier);
  };

  const handlePasskeySignIn = async () => {
    if (passkeyTapLockRef.current || passkeyLoading) return;
    if (!passkeysAvailable) {
      setError(
        'Passkeys only work on the live site. On localhost, use Email / Phone to sign in.'
      );
      return;
    }
    passkeyTapLockRef.current = true;
    setPasskeyLoading(true);
    setError('');
    try {
      const session = await withAuthTimeout(
        signInWithPasskey(),
        60_000,
        'Passkey sign-in timed out. Cancel any browser prompts and try again, or use email code instead.'
      );
      if (!session?.user) throw new Error('Passkey sign-in did not complete');
      await handleAuthSuccess(session.user, session.access_token);
    } catch (err: any) {
      const raw = String(err?.message || err?.error_description || '');
      const isGateway =
        /\b504\b/i.test(raw) ||
        /gateway timeout|timed out|timeout/i.test(raw) ||
        err?.status === 504 ||
        err?.statusCode === 504;
      const isStaleChallenge =
        /challenge not found|already used|invalid challenge|could not finish on this phone/i.test(
          raw
        );
      const isRpIdMismatch = /RP ID|relying party|invalid for this domain/i.test(raw);
      setError(
        isRpIdMismatch
          ? 'Passkeys only work on the live site. On this host, use Email / Phone to sign in.'
          : isGateway
            ? 'Supabase Auth is timing out (HTTP 504). Use Email / Phone for a one-time code, or restart the Supabase project and try passkey again in a few minutes.'
            : isStaleChallenge
              ? raw.includes('Email / Phone')
                ? raw
                : 'That passkey prompt expired or was used twice (common on phones). Use Email / Phone for a login code, or wait a few seconds and tap Passkey only once.'
              : raw || 'Passkey sign-in failed'
      );
      setPasskeyLoading(false);
    } finally {
      passkeyTapLockRef.current = false;
    }
  };

  const handleIdentifierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const val = readIdentifierFromDom();
    if (!val) {
      setError('Enter your email or phone number.');
      return;
    }
    setIdentifier(val);

    const isPhone = isPhoneNumber(val);
    const type: OtpMethod = isPhone ? 'phone' : 'email';
    setIdentifierType(type);
    setMethod(type);

    if (isPhone) {
      setLoginPassword('');
      setStage('password');
      return;
    }
    // Device / kiosk emails cannot receive OTP — use password sign-in
    const emailNorm = val.trim().toLowerCase();
    if (emailNorm.endsWith('@awc-vault.local') || emailNorm === 'kids.kiosk@awc-vault.local') {
      setLoginPassword('');
      setStage('password');
      return;
    }
    await dispatchOtp('email', val);
  };

  const handlePhonePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loginPassword.trim().length < 6) {
      setError('Enter your Vault password (at least 6 characters).');
      return;
    }
    setOtpLoading(true);
    setError('');
    try {
      const id = (identifier || readIdentifierFromDom()).trim();
      // Kids Desk Kiosk (and other @awc-vault.local device emails)
      if (!isPhoneNumber(id) && id.includes('@')) {
        const session = await signInWithPassword(id.toLowerCase(), loginPassword);
        if (!session?.user && !session?.access_token) {
          throw new Error('Could not sign in with that email.');
        }
        await handleAuthSuccess(session.user, session.access_token);
        return;
      }
      const phone = normalisePhone(id);
      if (!phone || phone.replace(/\D/g, '').length < 10) {
        setError('Enter a valid mobile number.');
        setOtpLoading(false);
        return;
      }
      const session = await signInWithPhonePassword(phone, loginPassword);
      if (!session?.user && !session?.access_token) {
        throw new Error('Could not sign in with that phone number.');
      }
      await handleAuthSuccess(session.user, session.access_token);
    } catch (err: any) {
      setError(err.message || 'That login or password is incorrect.');
      setOtpLoading(false);
    }
  };

  const dispatchOtp = async (m: OtpMethod, id?: string, purpose: 'signin' | 'signup' = phoneCodePurpose) => {
    const target = sanitizeAuthIdentifier(id ?? readIdentifierFromDom());
    if (!target) {
      setError('Enter your email or phone number.');
      return;
    }
    setIdentifier(target);
    setOtpLoading(true);
    setError('');
    try {
      if (m === 'email') {
        await sendEmailOtp(target);
      } else if (SMS_SIGNIN_ENABLED && smsConsent) {
        const phone = normalisePhone(target);
        if (!phone || phone.replace(/\D/g, '').length < 10) {
          setError('Enter a valid mobile number.');
          return;
        }
        await sendPhoneOtp(phone, purpose);
      } else {
        setLoginPassword('');
        setStage('password');
        return;
      }
      setMethod(m);
      setOtpDigits(Array(OTP_BOX_COUNT).fill(''));
      setStage('otp');
    } catch (err: any) {
      setError(err.message || 'Failed to send verification code');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = useCallback(async (digits?: string[]) => {
    const token = (digits ?? otpDigits).join('').replace(/\D/g, '');
    if (token.length < OTP_MIN_LEN) {
      setError('Enter the 6-digit code from your email or text.');
      return;
    }
    if (token.length > OTP_MAX_LEN) {
      setError('Code should be 6 digits.');
      return;
    }
    setOtpLoading(true);
    setError('');

    try {
      let session: any;
      if (method === 'email') {
        session = await verifyEmailOtp(identifier.trim(), token);
      } else {
        session = await verifyPhoneOtp(
          normalisePhone(identifier.trim()),
          token,
          phoneCodePurpose === 'signup'
            ? { firstName: regData.firstName.trim(), lastName: regData.lastName.trim(), email: regData.email.trim() }
            : undefined
        );
      }

      if (!session) throw new Error('That code is invalid or expired. Request a new code and try again.');

      await handleAuthSuccess(session.user, session.access_token);
    } catch (err: any) {
      setError(err.message || 'Invalid verification code');
      setOtpLoading(false);
    }
  }, [otpDigits, method, identifier, phoneCodePurpose, regData]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regData.agreeToTerms) {
      setError('Please agree to the Terms & Privacy Policy');
      return;
    }
    const hasPhone = isPhoneNumber(regData.phone);
    const hasEmail = !!regData.email.trim();
    if (!hasPhone && !hasEmail) {
      setError('Enter a mobile number or an email address.');
      return;
    }
    if (regData.password.trim().length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setOtpLoading(true);
    setError('');
    try {
      if (hasPhone) {
        const session = await signUpWithPhone({
          phone: regData.phone,
          password: regData.password,
          firstName: regData.firstName,
          lastName: regData.lastName,
          email: hasEmail ? regData.email : undefined,
        });
        if (session?.user || session?.access_token) {
          await handleAuthSuccess(session.user, session.access_token);
          return;
        }
        throw new Error('Signup failed');
      }

      const data = await signUpWithPassword(regData.email, regData.password, {
        first_name: regData.firstName,
        last_name: regData.lastName,
        phone: regData.phone,
        role: 'PENDING'
      });
      
      if (data.user) {
        handleAuthSuccess(data.user, data.session?.access_token);
      } else {
        setOtpLoading(false);
      }
    } catch (err: any) {
      setError(err.message || 'Signup failed');
      setOtpLoading(false);
    }
  };

  const handleAuthSuccess = async (user: any, accessToken?: string) => {
    setStage('authorizing');
    // Store the real Supabase JWT so the API can verify it
    if (accessToken) {
      localStorage.setItem('awc_auth_token', accessToken);
    }

    // Fetch the user's profile from the database to check if they've already onboarded
    let dbUser: any = null;
    try {
      const res = await fetch('/api/vault?resource=users&self=true', {
        headers: {
          'x-user-id': user.id,
          ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {})
        }
      });
      const data = await res.json();
      // With self=true, we should only get the authenticated user's record
      dbUser = data?.users?.[0] || null;
    } catch (e) {
      // If fetch fails, fall back to metadata check
    }

    setTimeout(() => {
      login({
        id: user.id,
        email: user.email,
        accessToken,
        name: dbUser?.name || (user.user_metadata?.first_name
          ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ''}`.trim()
          : (user.user_metadata?.full_name || user.user_metadata?.name || '')),
        role: dbUser?.role || user.user_metadata?.role || 'PENDING',
        title: dbUser?.title || user.user_metadata?.title || '',
        avatar_url: dbUser?.avatar_url || user.user_metadata?.avatar_url || '',
        birthday: dbUser?.birthday || user.user_metadata?.birthday || '',
      });

      setActiveSection(Section.Dashboard);

      const role = String(dbUser?.role || user.user_metadata?.role || 'PENDING').toUpperCase();
      // Onboarding completion is explicit. A PENDING stub with an email-local-part
      // "name" must still go through /onboarding (and land in Pending approval).
      const completedOnboarding = !!(
        dbUser?.notification_prefs?.onboarding?.completedAt ||
        dbUser?.notification_prefs?.onboarding?.path
      );
      const emailLocal = String(dbUser?.email || user.email || '')
        .split('@')[0]
        ?.trim()
        .toLowerCase();
      const displayName = String(dbUser?.name || '').trim();
      const nameIsEmailLocal =
        !!displayName && !!emailLocal && displayName.toLowerCase() === emailLocal;
      const alreadyOnboarded =
        completedOnboarding ||
        (role !== 'PENDING' && !!displayName && !nameIsEmailLocal);
      if (alreadyOnboarded) {
        // Kids Desk Kiosk tablet always lands on Kids Kiosk
        if (isKioskRole(role)) {
          navigate(kioskHomePath, { replace: true });
          return;
        }
        // Accountants always land on Fundraisers
        if (isAccountantRole(role)) {
          navigate(accountantHomePath, { replace: true });
          return;
        }
        // Return to check-in (or other protected page) when that was the original destination
        // Land on the PLCC ONE launcher unless they were headed somewhere specific.
        const dest = sanitizeReturnTo(returnTo) || consumeReturnTo() || '/launcher';
        const home = !dest || dest === '/' || dest === '/login' || dest === '/dashboard';
        navigate(home ? '/launcher' : dest, { replace: true });
      } else {
        // Kiosk device accounts are pre-named — never send them through member onboarding
        if (isKioskRole(role)) {
          navigate(kioskHomePath, { replace: true });
          return;
        }
        navigate('/onboarding', { replace: true });
      }
    }, 2000);
  };

  const goBack = () => {
    setError('');
    if (stage === 'sms') setStage('password');
    else if (stage === 'otp' && phoneCodePurpose === 'signup') setStage('registration');
    else if (stage === 'otp' || stage === 'password') setStage('identifier');
    else if (stage === 'method') setStage('identifier');
    else if (stage === 'credentials') setStage('registration');
    else if (stage === 'identifier' || stage === 'registration') setStage('idle');
  };

  const openMemberPortal = () => {
    setError('');
    setPortal('member');
    setStage('idle');
  };

  const backToChooser = () => {
    setError('');
    setStage('idle');
    setPortal('choose');
  };

  /** PLCC ONE tiles before sign-in: Tithe opens straight away; the rest sign in first, then open. */
  const openFromChooser = (id: AwcOneAppId) => {
    if (id === 'tithe') {
      window.location.assign(AWC_ONE_TITHE_URL);
      return;
    }
    if (id !== 'vault') rememberPendingApp(id);
    setAuthMode('login');
    openMemberPortal();
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AwcOneBackground className="font-inter">
      <div className="min-h-screen flex flex-col items-center justify-center py-6">
      <div className={`relative z-10 w-full px-6 ${portal === 'choose' && stage === 'idle' ? 'max-w-6xl' : 'max-w-md'}`}>

        {/* Branding — PLCC ONE */}
        <div className={`mb-6 transition-all duration-700 ${stage !== 'idle' ? 'scale-90 opacity-60 -translate-y-2 pointer-events-none' : 'scale-100'}`}>
          <AwcOneHeader compact={portal !== 'choose' || stage !== 'idle'} />
          {portal === 'choose' && stage === 'idle' && (
            <div className="mt-2 md:hidden -mx-6">
              <AwcOneScene className="h-[170px]" />
            </div>
          )}
        </div>

        {sessionExpiredNotice && (
          <div
            role="status"
            className="mb-6 bg-burgundy text-white rounded-2xl p-5 flex items-start gap-3 shadow-lg animate-in fade-in slide-in-from-top-2 duration-500"
          >
            <div className="w-10 h-10 rounded-xl bg-gold/20 text-gold flex items-center justify-center shrink-0">
              <Lock size={18} />
            </div>
            <p className="text-sm text-white/90 leading-relaxed self-center">{sessionExpiredNotice}</p>
          </div>
        )}

        {needsCheckInSignIn && (
          <div className="mb-6 bg-burgundy text-white rounded-2xl p-5 flex items-start gap-3 shadow-lg animate-in fade-in slide-in-from-top-2 duration-500">
            <div className="w-10 h-10 rounded-xl bg-gold/20 text-gold flex items-center justify-center shrink-0">
              <LogIn size={18} />
            </div>
            <div>
              <p className="font-black text-sm text-gold uppercase tracking-wide">Sign in required for check-in</p>
              <p className="text-sm text-white/80 mt-1 leading-relaxed">
                Please sign in (log in) first. After you sign in, you will go back to check-in.
              </p>
            </div>
          </div>
        )}

        {portal === 'choose' && stage === 'idle' && (
          <div className="animate-in fade-in zoom-in-95 duration-500 space-y-6">
            <div className="relative z-10 mx-auto w-full max-w-md grid gap-3">
              <button
                type="button"
                onClick={() => { setAuthMode('login'); openMemberPortal(); }}
                className="min-h-[60px] rounded-2xl flex items-center justify-center gap-3 text-[#112019] text-lg font-black shadow-[0_0_18px_rgba(255,190,70,0.6),inset_0_1px_0_rgba(255,255,255,0.7)] active:scale-[0.99] transition-transform"
                style={{ background: 'linear-gradient(180deg, #FFE08A 0%, #E4C98F 45%, #C98F1E 100%)' }}
              >
                <LogIn size={22} aria-hidden /> Sign in to PLCC ONE
              </button>
              <button
                type="button"
                onClick={() => { setAuthMode('signup'); openMemberPortal(); }}
                className="min-h-[56px] rounded-2xl border-2 border-[#E4C98F] bg-[rgba(9, 17, 14,0.55)] text-white text-base font-extrabold hover:bg-white/10 transition-colors"
              >
                New here? Create your account
              </button>
            </div>

            <div className="hidden md:block">
              <AwcOneScene className="h-[220px] rounded-[24px] overflow-hidden" />
            </div>

            <AwcOneTiles onOpen={openFromChooser} />
            <p className="text-center text-sm text-[#F3E3D0]">One sign-in opens every PLCC app. Giving with PLCC Tithe needs no sign-in.</p>
          </div>
        )}

        {portal === 'choose' && stage === 'idle' && (
          <div className="mt-6 mb-2 text-center">
            <HelpCreateAccountLink light />
          </div>
        )}

        {/* Mode Tabs */}
        {portal === 'member' && stage === 'idle' && (
          <div className="flex justify-center mb-8 animate-in fade-in duration-700">
            <div
              role="tablist"
              aria-label="Account type"
              className="inline-flex w-full max-w-md p-1.5 rounded-2xl bg-white border-2 border-[#0d1a14]/12 shadow-sm"
            >
              <button
                type="button"
                role="tab"
                aria-selected={authMode === 'login'}
                onClick={() => setAuthMode('login')}
                className={`flex-1 min-h-[48px] px-4 py-3 rounded-xl text-[11px] sm:text-xs font-black uppercase tracking-[0.14em] transition-all ${
                  authMode === 'login'
                    ? 'bg-burgundy text-gold shadow-md'
                    : 'bg-transparent text-[#0d1a14] hover:bg-burgundy/5'
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={authMode === 'signup'}
                onClick={() => setAuthMode('signup')}
                className={`flex-1 min-h-[48px] px-4 py-3 rounded-xl text-[11px] sm:text-xs font-black uppercase tracking-[0.14em] transition-all ${
                  authMode === 'signup'
                    ? 'bg-burgundy text-gold shadow-md'
                    : 'bg-transparent text-[#0d1a14] hover:bg-burgundy/5'
                }`}
              >
                Create account
              </button>
            </div>
          </div>
        )}

        {/* Stage Content */}
        <div className={`${portal === 'member' || stage !== 'idle' ? 'min-h-[460px]' : ''} flex items-center justify-center perspective-1000`}>

          {/* ── IDLE (member vault) ── */}
          {portal === 'member' && stage === 'idle' && (
            <div className="text-center space-y-6 animate-in fade-in zoom-in-95 duration-700 w-full max-w-md mx-auto">
              <button
                type="button"
                onClick={backToChooser}
                className="inline-flex items-center gap-2 text-sm font-bold text-white/85 hover:text-white underline-offset-4 hover:underline"
              >
                <ArrowLeft size={14} /> Back to PLCC ONE
              </button>

              <div className="rounded-[2rem] bg-white border border-[#0d1a14]/8 shadow-[0_20px_50px_rgba(13, 26, 20,0.08)] overflow-hidden text-left">
                <div className="px-7 pt-8 pb-6 border-b border-gray-100">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-burgundy mb-2">
                    {authMode === 'login' ? 'Returning member' : 'New member'}
                  </p>
                  <h2 className="text-2xl font-black text-[#0d1a14] tracking-tight leading-tight">
                    {authMode === 'login' ? 'Sign in to PLCC ONE' : 'Create your account'}
                  </h2>
                  <p className="text-[15px] text-gray-600 font-medium leading-relaxed mt-3">
                    {needsCheckInSignIn
                      ? 'Sign in with email, phone, or passkey first. Then you can check in.'
                      : authMode === 'login'
                        ? passkeysAvailable
                          ? 'Use your email for a login code, or your phone number and password. Passkey works when Face ID finishes in one try.'
                          : 'Use your email for a login code, or your phone number and password. Passkey is only available on the live site.'
                        : 'Use a mobile number and password if you prefer not to use email.'}
                  </p>
                </div>

                <div className="px-7 py-7 space-y-4">
                  {authMode === 'signup' ? (
                    <button
                      type="button"
                      onClick={beginAuth}
                      disabled={isBusy}
                      className="group w-full min-h-[56px] px-6 py-4 bg-burgundy text-gold font-black text-xs uppercase tracking-[0.18em] rounded-2xl shadow-lg shadow-burgundy/20 hover:bg-burgundy-dark transition-all active:scale-[0.99] disabled:opacity-60 flex items-center justify-center gap-3"
                    >
                      <Lock size={18} className="group-hover:scale-105 transition-transform" />
                      Start registration
                    </button>
                  ) : (
                    <div className="rounded-2xl border-2 border-[#0d1a14]/20 bg-[#F9F9F7] overflow-hidden flex divide-x-2 divide-[#0d1a14]/15">
                      <button
                        type="button"
                        onClick={beginAuth}
                        disabled={isBusy}
                        className="group flex-1 min-h-[72px] min-w-0 px-2 sm:px-3 py-3.5 text-[#0d1a14] hover:bg-white transition-all active:scale-[0.99] disabled:opacity-60 flex flex-col items-center justify-center gap-1 text-center"
                      >
                        {otpLoading ? <Loader2 size={16} className="animate-spin text-burgundy" /> : <Mail size={16} className="text-burgundy shrink-0" />}
                        <span className="font-black text-[11px] sm:text-xs uppercase tracking-wide whitespace-nowrap">
                          Email / Phone
                        </span>
                        <span className="normal-case tracking-normal font-medium text-[11px] sm:text-[12px] text-gray-600 leading-snug px-1">
                          Email code or phone + password
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={handlePasskeySignIn}
                        disabled={isBusy || !passkeysAvailable}
                        title={
                          passkeysAvailable
                            ? undefined
                            : 'Passkeys only work on the live site — use Email / Phone here'
                        }
                        className="group flex-1 min-h-[72px] min-w-0 px-2 sm:px-3 py-3.5 text-[#0d1a14] hover:bg-white transition-all active:scale-[0.99] disabled:opacity-60 flex flex-col items-center justify-center gap-1 text-center"
                      >
                        {passkeyLoading ? <Loader2 size={16} className="animate-spin text-burgundy" /> : <Fingerprint size={16} className="text-burgundy shrink-0" />}
                        <span className="font-black text-[11px] sm:text-xs uppercase tracking-wide whitespace-nowrap">
                          Passkey
                        </span>
                        <span className="normal-case tracking-normal font-medium text-[11px] sm:text-[12px] text-gray-600 leading-snug px-1">
                          {passkeysAvailable ? 'Face ID or fingerprint' : 'Live site only'}
                        </span>
                      </button>
                    </div>
                  )}

                  {authMode === 'signup' && (
                    <p className="text-center text-sm text-gray-600 font-medium pt-1">
                      Already have an account?{' '}
                      <button
                        type="button"
                        onClick={() => setAuthMode('login')}
                        className="font-black text-burgundy underline underline-offset-2"
                      >
                        Sign in
                      </button>
                    </p>
                  )}

                  {authMode === 'login' && (
                    <p className="text-center text-sm text-gray-600 font-medium pt-1">
                      New here?{' '}
                      <button
                        type="button"
                        onClick={() => setAuthMode('signup')}
                        className="font-black text-burgundy underline underline-offset-2"
                      >
                        Create an account
                      </button>
                    </p>
                  )}

                  {error && (
                    <p className="text-red-700 text-sm font-semibold bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-center">
                      {error}
                    </p>
                  )}

                  {localUiPreviewAvailable && (
                    <div className="pt-1 border-t border-gray-100 space-y-2">
                      <p className="text-center text-[11px] text-gray-500 font-medium">
                        Local only — skip sign-in to review UI (API data may be empty).
                      </p>
                      <button
                        type="button"
                        onClick={enterLocalUiPreview}
                        className="w-full min-h-[48px] px-4 py-3 rounded-2xl border border-dashed border-[#0d1a14]/25 text-[#0d1a14] font-black text-[11px] uppercase tracking-[0.14em] hover:bg-[#F9F9F7] transition-colors"
                      >
                        Preview Home (local only)
                      </button>
                    </div>
                  )}

                  <div className="pt-2 text-center border-t border-gray-100">
                    <p className="text-xs text-gray-500 font-medium mb-2">Need a walkthrough?</p>
                    <HelpCreateAccountLink />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── IDENTIFIER (Login) ── */}
          {stage === 'identifier' && (
            <form onSubmit={handleIdentifierSubmit} className="w-full bg-gradient-to-br from-[#13241c] to-[#0b1410] p-10 rounded-[3rem] border border-white/10 shadow-2xl animate-in zoom-in-95 duration-500 relative overflow-hidden">
              <div className="space-y-8 relative z-10">
                <div className="flex items-center justify-between">
                   <div className="space-y-1">
                    <h2 className="text-xl font-black text-white tracking-tight">Sign In</h2>
                    <p className="text-white/40 text-xs font-medium">Email gets a code. Phone uses your password.</p>
                  </div>
                  <button type="button" onClick={goBack} className="p-2 text-white/20 hover:text-white"><ArrowLeft size={18}/></button>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-gold/80 uppercase tracking-[0.3em] ml-1">Email or Phone</label>
                  <div className="relative">
                    <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-[#0d1a14]/45 pointer-events-none" size={18} />
                    <input
                      ref={identifierInputRef}
                      type="text"
                      name="email"
                      id="awc-login-identifier"
                      inputMode="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      autoComplete="username email"
                      spellCheck={false}
                      enterKeyHint="send"
                      autoFocus
                      defaultValue={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      onInput={(e) => setIdentifier((e.target as HTMLInputElement).value)}
                      placeholder="name@email.com or phone"
                      className="w-full pl-14 pr-5 py-5 bg-white text-[#0d1a14] caret-[#0d1a14] border border-white/20 rounded-2xl outline-none focus:ring-2 focus:ring-gold/60 font-bold placeholder:text-[#0d1a14]/35 [&:-webkit-autofill]:[-webkit-text-fill-color:#0d1a14]"
                      required
                    />
                  </div>
                </div>
                {error && <div className="text-red-200 text-xs font-bold normal-case tracking-normal leading-relaxed bg-red-500/10 p-3 rounded-xl border border-red-500/20">{error}</div>}
                <button type="submit" disabled={isBusy} className="w-full py-5 bg-gold text-burgundy font-black text-sm uppercase tracking-[0.2em] rounded-2xl shadow-xl hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                  {otpLoading ? <Loader2 className="animate-spin" size={18}/> : <>{isPhoneNumber(identifier) ? 'Continue' : 'Send code'} <ArrowRight size={18}/></>}
                </button>
                <div className="pt-1 text-center">
                  <HelpCreateAccountLink light />
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <div className="h-px flex-1 bg-white/10" />
                  <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/25">or</span>
                  <div className="h-px flex-1 bg-white/10" />
                </div>
                {passkeysAvailable && (
                  <button
                    type="button"
                    onClick={handlePasskeySignIn}
                    disabled={isBusy}
                    className="w-full py-4 rounded-2xl border border-white/15 bg-white/5 text-white font-black text-[11px] uppercase tracking-[0.18em] hover:bg-white/10 hover:border-gold/40 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {passkeyLoading ? <Loader2 className="animate-spin" size={16} /> : <Fingerprint size={16} className="text-gold" />}
                    Sign in with passkey
                  </button>
                )}
              </div>
            </form>
          )}

          {/* ── REGISTRATION (Sign Up - Step 1: Details) ── */}
          {stage === 'registration' && (
            <div className="w-full bg-gradient-to-br from-[#13241c] to-[#0b1410] p-10 rounded-[3rem] border border-white/10 shadow-2xl animate-in zoom-in-95 duration-500 relative overflow-hidden">
              <div className="space-y-8 relative z-10">
                <div className="flex items-center justify-between">
                   <div className="space-y-1">
                    <h2 className="text-xl font-black text-white tracking-tight">Join Us ✨</h2>
                    <p className="text-white/40 text-xs font-medium">Step 1: Your Identity</p>
                  </div>
                  <button type="button" onClick={goBack} className="p-2 text-white/20 hover:text-white"><ArrowLeft size={18}/></button>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                       <label className="text-[9px] font-black text-gold/60 uppercase tracking-widest ml-1">First Name</label>
                      <input 
                        type="text" value={regData.firstName} onChange={e => setRegData({...regData, firstName: e.target.value})}
                        className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-gold/30 font-bold text-sm"
                        placeholder="Haley"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-gold/60 uppercase tracking-widest ml-1">Last Name</label>
                      <input 
                        type="text" value={regData.lastName} onChange={e => setRegData({...regData, lastName: e.target.value})}
                        className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-gold/30 font-bold text-sm"
                        placeholder="Schultz"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-gold/60 uppercase tracking-widest ml-1">Mobile Number</label>
                    <input 
                      type="tel" value={regData.phone} onChange={e => setRegData({...regData, phone: e.target.value})}
                      className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-gold/30 font-bold text-sm"
                      placeholder="(555) 123-4567"
                    />
                    <p className="text-white/30 text-[10px] font-medium leading-relaxed ml-1">You can sign in with this number and a password. Email is optional.</p>
                  </div>
                </div>
                <button 
                  onClick={() => setStage('credentials')}
                  disabled={!regData.firstName || !regData.lastName}
                  className="w-full py-5 bg-gold text-burgundy font-black text-sm uppercase tracking-[0.2em] rounded-2xl shadow-xl hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 group disabled:opacity-30"
                >
                  Continue <ArrowRight className="group-hover:translate-x-1 transition-transform" size={18}/>
                </button>
                {SMS_SIGNIN_ENABLED && isPhoneNumber(regData.phone) && (
                  <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={smsConsent}
                        onChange={(e) => {
                          setSmsConsent(e.target.checked);
                          if (e.target.checked) setError('');
                        }}
                        className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-2 border-white/60 bg-transparent accent-[#C9A35A]"
                      />
                      <span className="text-[11px] leading-relaxed text-white/75 font-medium">
                        {SMS_CONSENT_TEXT} See our{' '}
                        <a href={SMS_TERMS_URL} target="_blank" rel="noopener noreferrer" className="font-bold text-gold underline underline-offset-2">Terms</a>{' '}
                        and{' '}
                        <a href={SMS_PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="font-bold text-gold underline underline-offset-2">Privacy Policy</a>.
                      </span>
                    </label>
                    {error && stage === 'registration' && (
                      <div className="text-red-200 text-xs font-bold normal-case tracking-normal leading-relaxed bg-red-500/10 p-3 rounded-xl border border-red-500/20">{error}</div>
                    )}
                    <button
                      type="button"
                      disabled={isBusy || !smsConsent || !regData.firstName.trim() || !regData.lastName.trim()}
                      onClick={() => {
                        setError('');
                        setPhoneCodePurpose('signup');
                        setIdentifierType('phone');
                        void dispatchOtp('phone', regData.phone, 'signup');
                      }}
                      className="w-full py-4 border border-gold/50 text-gold font-black text-xs uppercase tracking-[0.2em] rounded-2xl hover:bg-gold/10 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {otpLoading ? <Loader2 className="animate-spin" size={16} /> : <>Text me a code — no password <ArrowRight size={16} /></>}
                    </button>
                  </div>
                )}
                <div className="text-center">
                  <HelpCreateAccountLink light />
                </div>
              </div>
            </div>
          )}

          {/* ── CREDENTIALS (Sign Up - Step 2: Login Info) ── */}
          {stage === 'credentials' && (
            <form onSubmit={handleSignup} className="w-full bg-gradient-to-br from-[#13241c] to-[#0b1410] p-10 rounded-[3rem] border border-white/10 shadow-2xl animate-in zoom-in-95 duration-500 relative overflow-hidden">
              <div className="space-y-6 relative z-10">
                <div className="flex items-center justify-between">
                   <div className="space-y-1">
                    <h2 className="text-xl font-black text-white tracking-tight">Security 🛡️</h2>
                    <p className="text-white/40 text-xs font-medium">Finalize your credentials</p>
                  </div>
                  <button type="button" onClick={goBack} className="p-2 text-white/20 hover:text-white"><ArrowLeft size={18}/></button>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-gold/60 uppercase tracking-widest ml-1">Email (optional if you added a phone)</label>
                    <input 
                      type="email"
                      inputMode="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      autoComplete="email"
                      value={regData.email}
                      onChange={e => setRegData({...regData, email: e.target.value})}
                      className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-gold/40 font-bold text-sm"
                      placeholder="name@email.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-gold/60 uppercase tracking-widest ml-1">Vault Password</label>
                    <input 
                      type="password" required value={regData.password} onChange={e => setRegData({...regData, password: e.target.value})}
                      className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-gold/40 font-bold text-sm"
                      placeholder="••••••••"
                    />
                  </div>

                  <label className="flex items-start gap-3 cursor-pointer group py-2">
                    <input 
                      type="checkbox" required checked={regData.agreeToTerms} onChange={e => setRegData({...regData, agreeToTerms: e.target.checked})}
                      className="w-4 h-4 mt-0.5 rounded border-white/10 bg-white/5 text-gold focus:ring-gold"
                    />
                    <span className="text-[10px] font-bold text-white/40 leading-relaxed group-hover:text-white/60 transition-colors">
                      I agree to the <span className="text-gold underline">Terms of Service</span> and <span className="text-gold underline">Privacy Policy</span>.
                    </span>
                  </label>
                </div>
                {error && <div className="text-red-200 text-xs font-bold normal-case tracking-normal leading-relaxed bg-red-500/10 p-3 rounded-xl border border-red-500/20">{error}</div>}
                <button type="submit" disabled={isBusy} className="w-full py-5 bg-gold text-burgundy font-black text-sm uppercase tracking-[0.25em] rounded-2xl shadow-xl hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                  {otpLoading ? <Loader2 className="animate-spin" size={18}/> : <>Create Account <ShieldCheck size={18}/></>}
                </button>
                <div className="pt-1 text-center">
                  <HelpCreateAccountLink light />
                </div>
              </div>
            </form>
          )}

          {/* ── PASSWORD (phone, email, or Kids Desk Kiosk) ── */}
          {stage === 'password' && (
            <form onSubmit={handlePhonePasswordSubmit} className="w-full bg-gradient-to-br from-[#13241c] to-[#0b1410] p-10 rounded-[3rem] border border-white/10 shadow-2xl animate-in zoom-in-95 duration-500 relative overflow-hidden">
              <div className="space-y-8 relative z-10">
                <div className="flex items-center justify-between">
                   <div className="space-y-1">
                    <h2 className="text-xl font-black text-white tracking-tight">Sign In</h2>
                    <p className="text-white/40 text-xs font-medium">
                      {isPhoneNumber(identifier)
                        ? 'Enter the password for this phone number'
                        : String(identifier || '').toLowerCase().endsWith('@awc-vault.local')
                          ? 'Enter the Kids Desk Kiosk password'
                          : 'Use the password from when you created your account'}
                    </p>
                  </div>
                  <button type="button" onClick={goBack} className="p-2 text-white/20 hover:text-white"><ArrowLeft size={18}/></button>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-gold/80 uppercase tracking-[0.3em] ml-1">
                    {isPhoneNumber(identifier)
                      ? 'Mobile Number'
                      : String(identifier || '').toLowerCase().endsWith('@awc-vault.local')
                        ? 'Kiosk Email'
                        : 'Email'}
                  </label>
                  <div className="relative">
                    {isPhoneNumber(identifier) ? (
                      <Phone className="absolute left-5 top-1/2 -translate-y-1/2 text-[#0d1a14]/45 pointer-events-none" size={18} />
                    ) : (
                      <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-[#0d1a14]/45 pointer-events-none" size={18} />
                    )}
                    <input
                      type={isPhoneNumber(identifier) ? 'tel' : 'email'}
                      inputMode={isPhoneNumber(identifier) ? 'tel' : 'email'}
                      autoComplete={isPhoneNumber(identifier) ? 'tel' : 'username'}
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      className="w-full pl-14 pr-5 py-5 bg-white text-[#0d1a14] caret-[#0d1a14] border border-white/20 rounded-2xl outline-none focus:ring-2 focus:ring-gold/60 font-bold placeholder:text-[#0d1a14]/35 [&:-webkit-autofill]:[-webkit-text-fill-color:#0d1a14]"
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-gold/80 uppercase tracking-[0.3em] ml-1">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-[#0d1a14]/45 pointer-events-none" size={18} />
                    <input
                      type="password"
                      autoComplete="current-password"
                      autoFocus
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Your Vault password"
                      className="w-full pl-14 pr-5 py-5 bg-white text-[#0d1a14] caret-[#0d1a14] border border-white/20 rounded-2xl outline-none focus:ring-2 focus:ring-gold/60 font-bold placeholder:text-[#0d1a14]/35 [&:-webkit-autofill]:[-webkit-text-fill-color:#0d1a14]"
                      required
                      minLength={6}
                    />
                  </div>
                  {!isPhoneNumber(identifier) &&
                    !String(identifier || '').toLowerCase().endsWith('@awc-vault.local') && (
                      <p className="text-white/30 text-[10px] font-medium leading-relaxed ml-1">
                        Use the password from when you created your account.
                      </p>
                    )}
                </div>
                {error && <div className="text-red-200 text-xs font-bold normal-case tracking-normal leading-relaxed bg-red-500/10 p-3 rounded-xl border border-red-500/20">{error}</div>}
                <button type="submit" disabled={isBusy} className="w-full py-5 bg-gold text-burgundy font-black text-sm uppercase tracking-[0.2em] rounded-2xl shadow-xl hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                  {otpLoading ? <Loader2 className="animate-spin" size={18}/> : <>Sign in <ArrowRight size={18}/></>}
                </button>
                {isPhoneNumber(identifier) ? (
                  SMS_SIGNIN_ENABLED ? (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => {
                        setError('');
                        setLoginPassword('');
                        setSmsConsent(false);
                        setPhoneCodePurpose('signin');
                        setStage('sms');
                      }}
                      className="w-full py-4 border-2 border-gold/70 text-gold font-black text-sm uppercase tracking-[0.15em] rounded-2xl hover:bg-gold/10 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <Phone size={18} /> Text me a code instead
                    </button>
                  ) : (
                    <p className="text-white/30 text-[10px] font-medium leading-relaxed text-center">
                      New here? Create an account with this phone number and a password. Text codes are not used yet.
                    </p>
                  )
                ) : !String(identifier || '').toLowerCase().endsWith('@awc-vault.local') ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      setError('');
                      setLoginPassword('');
                      void dispatchOtp('email', identifier);
                    }}
                    className="w-full text-center text-gold/80 hover:text-gold text-xs font-bold underline underline-offset-4 disabled:opacity-50"
                  >
                    Use email code instead
                  </button>
                ) : null}
              </div>
            </form>
          )}

          {/* ── SMS CONSENT (text me a code) ── */}
          {stage === 'sms' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!smsConsent) {
                  setError('Check the box to agree to receive a text message.');
                  return;
                }
                void dispatchOtp('phone', identifier);
              }}
              className="w-full bg-gradient-to-br from-[#13241c] to-[#0b1410] p-10 rounded-[3rem] border border-white/10 shadow-2xl animate-in zoom-in-95 duration-500 relative overflow-hidden"
            >
              <div className="space-y-7 relative z-10">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h2 className="text-xl font-black text-white tracking-tight">Sign in with a text code</h2>
                    <p className="text-white/40 text-xs font-medium">We'll text a 6-digit code to your phone.</p>
                  </div>
                  <button type="button" onClick={goBack} className="p-2 text-white/20 hover:text-white" aria-label="Back">
                    <ArrowLeft size={18} />
                  </button>
                </div>

                <div className="space-y-3">
                  <label htmlFor="sms-phone" className="text-[10px] font-black text-gold/80 uppercase tracking-[0.3em] ml-1">
                    Mobile Number
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-5 top-1/2 -translate-y-1/2 text-[#0d1a14]/45 pointer-events-none" size={18} />
                    <input
                      id="sms-phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="(555) 555-0123"
                      required
                      className="w-full pl-14 pr-5 py-5 bg-white text-[#0d1a14] caret-[#0d1a14] border border-white/20 rounded-2xl outline-none focus:ring-2 focus:ring-gold/60 font-bold placeholder:text-[#0d1a14]/35 [&:-webkit-autofill]:[-webkit-text-fill-color:#0d1a14]"
                    />
                  </div>
                </div>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={smsConsent}
                    onChange={(e) => {
                      setSmsConsent(e.target.checked);
                      if (e.target.checked) setError('');
                    }}
                    className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-2 border-white/60 bg-transparent accent-[#C9A35A]"
                  />
                  <span className="text-[13px] leading-relaxed text-white/85 font-medium">
                    {SMS_CONSENT_TEXT} See our{' '}
                    <a href={SMS_TERMS_URL} target="_blank" rel="noopener noreferrer" className="font-bold text-gold underline underline-offset-2">Terms</a>{' '}
                    and{' '}
                    <a href={SMS_PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="font-bold text-gold underline underline-offset-2">Privacy Policy</a>.
                  </span>
                </label>

                {error && <div className="text-red-200 text-xs font-bold normal-case tracking-normal leading-relaxed bg-red-500/10 p-3 rounded-xl border border-red-500/20">{error}</div>}

                <button
                  type="submit"
                  disabled={isBusy || !smsConsent}
                  className="w-full py-5 bg-gold text-burgundy font-black text-sm uppercase tracking-[0.2em] rounded-2xl shadow-xl hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:brightness-100 disabled:active:scale-100"
                >
                  {otpLoading ? <Loader2 className="animate-spin" size={18} /> : <>Send code <ArrowRight size={18} /></>}
                </button>

                <p className="text-white/35 text-[10px] font-medium leading-relaxed text-center">
                  No mobile information will be shared with third parties or affiliates for marketing or promotional purposes.
                </p>
              </div>
            </form>
          )}

          {/* ── OTP ENTRY ── */}
          {stage === 'otp' && (
            <div className="w-full bg-gradient-to-br from-[#13241c] to-[#0b1410] p-10 rounded-[3rem] border border-white/10 shadow-2xl animate-in zoom-in-95 duration-500 relative overflow-hidden">
              <div className="space-y-8 relative z-10 text-center">
                <div className="flex items-center justify-between mb-4">
                  <button type="button" onClick={goBack} className="p-2 text-white/20 hover:text-white"><ArrowLeft size={20}/></button>
                  <h2 className="text-xl font-black text-white uppercase tracking-widest">Verify</h2>
                  <div className="w-10 h-10"/> 
                </div>
                <p className="text-white/40 text-xs font-semibold leading-relaxed">
                  Code sent to <span className="text-gold font-black">{identifier}</span>. Enter the 6-digit code below:
                </p>
                <OtpBoxes value={otpDigits} onChange={setOtpDigits} onComplete={handleVerifyOtp} />
                {error && (
                  <div className="text-red-200 text-xs font-bold normal-case tracking-normal leading-relaxed bg-red-500/10 p-3 rounded-xl border border-red-500/20">
                    {error}
                  </div>
                )}
                <p className="text-white/30 text-[10px] font-medium leading-relaxed">
                  {method === 'phone'
                    ? 'No text in a minute? Text sign-in has to be turned on once: sign in with your email, open your profile, and tap "Turn on text sign-in" (in PLCC Connect it’s under Account). Then this works every time.'
                    : 'No email yet? Check spam/junk, wait a minute, then tap Resend. If it still does not arrive, SMTP may need a check in Supabase.'}
                </p>
                <button
                  type="button"
                  onClick={() => handleVerifyOtp()}
                  disabled={isBusy}
                  className="w-full py-5 bg-gold text-burgundy font-black text-xs uppercase tracking-widest rounded-2xl shadow-lg mt-4 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {otpLoading ? <Loader2 className="animate-spin" size={18} /> : 'Confirm Identity'}
                </button>
                <div className="flex justify-center"><ResendTimer onResend={() => dispatchOtp(method)} /></div>
                {method === 'email' && !isPhoneNumber(identifier) ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      setError('');
                      setLoginPassword('');
                      setIdentifierType('email');
                      setMethod('email');
                      setStage('password');
                    }}
                    className="w-full text-center text-gold/80 hover:text-gold text-xs font-bold underline underline-offset-4 disabled:opacity-50"
                  >
                    Use password instead
                  </button>
                ) : null}
              </div>
            </div>
          )}

          {/* ── AUTHORIZING ── */}
          {stage === 'authorizing' && (
            <div className="text-center space-y-10 animate-in zoom-in-95 duration-1000">
              <div className="w-32 h-32 bg-white/90 rounded-full border-4 border-gold/20 flex items-center justify-center mx-auto relative shadow-2xl">
                <Loader2 size={64} className="text-burgundy animate-spin opacity-30" strokeWidth={1} />
                <div className="absolute inset-0 flex items-center justify-center"><Key size={32} className="text-gold animate-bounce" /></div>
              </div>
              <div className="bg-white/60 backdrop-blur-md px-10 py-5 rounded-[2.5rem] border border-white/60 shadow-xl">
                <h3 className="text-2xl font-black text-[#0d1a14] tracking-tight">Signing you in</h3>
                <p className="text-gold font-bold text-[10px] uppercase tracking-[0.3em] mt-3 animate-pulse">Please wait…</p>
              </div>
            </div>
          )}

        </div>
      </div>

      <style>{`
        @keyframes scan-laser-smooth { 0% { top: 0%; opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } 100% { top: 100%; opacity: 0; } }
        .animate-scan-laser-smooth { animation: scan-laser-smooth 3s ease-in-out infinite; }
        @keyframes float-slow { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        .animate-float-slow { animation: float-slow 6s ease-in-out infinite; }
        @keyframes pulse-slow-reverse { 0%, 100% { opacity: 0.05; transform: scale(1); } 50% { opacity: 0.15; transform: scale(0.9); } }
        .animate-pulse-slow-reverse { animation: pulse-slow-reverse 10s ease-in-out infinite; }
      `}</style>
      </div>
      {portal === 'choose' && stage === 'idle' && <AwcOneFooter />}
    </AwcOneBackground>
  );
};

export default LoginPortal;