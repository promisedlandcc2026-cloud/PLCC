import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Baby, Loader2, Plus, Radio, RefreshCw, Share2, Sparkles, UserPlus, Users, X } from 'lucide-react';
import { FamilyVoiceHuddle } from '../../components/family/FamilyVoiceHuddle';
import {
  createFamilyHuddleInvite,
  familyInviteAbsoluteUrl,
  fetchFamilyHuddleStatus,
  addFamilyMember,
  fetchFamilyHuddleSummary,
  inviteExpiryLabel,
  removeFamilyMember,
  whatsappInviteHref,
} from '../../lib/familyHuddleClient';
import { FamilyHuddleError, type FamilyHuddleSummary } from '../../lib/familyHuddleTypes';
import {
  createParentDependent,
  KIDS_THEME_OPTIONS,
  listParentDependents,
  ParentDependentError,
  updateParentDependent,
  type KidsTheme,
  type ParentDependent,
} from '../../lib/parentDependentsClient';
import AskAdminTitleLink from '../../components/common/AskAdminTitleLink';

type HuddleMode = 'start' | 'join' | null;
type AddMode = 'child' | 'adult';

/* Same reading-first language as Sermon Notes: serif for names and headings,
   16px body, 44px+ tap targets, no tiny all-caps labels. */
const SERIF: React.CSSProperties = { fontFamily: "'Fraunces', Georgia, serif" };

const INPUT =
  'h-12 px-4 bg-white rounded-xl border border-gray-200 text-base text-[#16251f] placeholder:text-gray-400 outline-none focus:border-burgundy/50 focus-visible:ring-2 focus-visible:ring-burgundy/20';
const PRIMARY_BTN =
  'h-12 px-5 rounded-xl bg-burgundy text-white font-semibold text-[15px] inline-flex items-center justify-center gap-2 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-burgundy';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function Avatar({ name, tone }: { name: string; tone: 'adult' | 'child' | 'self' }) {
  const cls =
    tone === 'self'
      ? 'bg-burgundy text-white'
      : tone === 'adult'
        ? 'bg-[#f3e9e4] text-burgundy'
        : 'bg-[#f6efd9] text-[#7a5a0e]';
  return (
    <span
      aria-hidden
      className={`w-11 h-11 rounded-full shrink-0 inline-flex items-center justify-center text-[15px] font-semibold ${cls}`}
    >
      {initials(name)}
    </span>
  );
}

function RemoveButton({ busy, name, onClick }: { busy: boolean; name: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={`Remove ${name} from your household`}
      title="Remove from household"
      className="w-11 h-11 shrink-0 rounded-full text-gray-400 hover:text-rose-700 hover:bg-rose-50 inline-flex items-center justify-center disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
    >
      {busy ? <Loader2 size={18} className="animate-spin" /> : <X size={18} />}
    </button>
  );
}

function Notice({ tone, children }: { tone: 'ok' | 'error'; children: React.ReactNode }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={`text-[15px] rounded-xl px-4 py-3 ${
        tone === 'error' ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'
      }`}
    >
      {children}
    </p>
  );
}

function RosterSkeleton() {
  return (
    <div className="rounded-3xl border border-gray-100 bg-white p-6 space-y-5 animate-pulse" aria-hidden>
      <div className="h-7 w-48 rounded bg-gray-100" />
      {[0, 1, 2].map((n) => (
        <div key={n} className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-gray-100" />
          <div className="h-4 w-40 rounded bg-gray-100" />
        </div>
      ))}
    </div>
  );
}

function nameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function relationshipLabel(rel: string | null): string {
  if (!rel) return '';
  const s = rel.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function MyFamilyPage() {
  const [summary, setSummary] = useState<FamilyHuddleSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [huddleLive, setHuddleLive] = useState(false);
  const [huddleCount, setHuddleCount] = useState(0);
  const [huddleConfigured, setHuddleConfigured] = useState(true);
  const [huddleMode, setHuddleMode] = useState<HuddleMode>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [childName, setChildName] = useState('');
  const [childAge, setChildAge] = useState('');
  const [childTheme, setChildTheme] = useState<KidsTheme>('soft_garden');
  const [kids, setKids] = useState<ParentDependent[]>([]);
  const [themeSavingId, setThemeSavingId] = useState<string | null>(null);
  const [childBusy, setChildBusy] = useState(false);
  const [childError, setChildError] = useState<string | null>(null);
  const [childOk, setChildOk] = useState<string | null>(null);
  const [adultName, setAdultName] = useState('');
  const [adultRelationship, setAdultRelationship] = useState<'spouse' | 'other'>('spouse');
  const [adultBusy, setAdultBusy] = useState(false);
  const [adultError, setAdultError] = useState<string | null>(null);
  const [adultOk, setAdultOk] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [addMode, setAddMode] = useState<AddMode>('child');
  const [removeError, setRemoveError] = useState<string | null>(null);

  const eligible = !error && Boolean(summary);

  const loadKids = useCallback(async () => {
    try {
      const listed = await listParentDependents();
      setKids(listed.structured);
    } catch {
      setKids([]);
    }
  }, []);

  const kidByName = new Map<string, ParentDependent>();
  for (const k of kids) {
    kidByName.set(nameKey(k.name), k);
    if (k.displayName) kidByName.set(nameKey(k.displayName), k);
  }

  const changeKidTheme = async (kid: ParentDependent, theme: KidsTheme) => {
    if (themeSavingId) return;
    setThemeSavingId(kid.id);
    setChildError(null);
    setKids((prev) => prev.map((k) => (k.id === kid.id ? { ...k, kidsTheme: theme } : k)));
    try {
      await updateParentDependent({ childId: kid.id, kidsTheme: theme });
    } catch (err) {
      setKids((prev) => prev.map((k) => (k.id === kid.id ? { ...k, kidsTheme: kid.kidsTheme } : k)));
      setChildError(err instanceof ParentDependentError ? err.message : 'Could not change the theme.');
    } finally {
      setThemeSavingId(null);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setErrorCode(null);
    try {
      const data = await fetchFamilyHuddleSummary();
      setSummary(data);
      void loadKids();
    } catch (err) {
      setSummary(null);
      if (err instanceof FamilyHuddleError) {
        setError(err.message);
        setErrorCode(err.code);
      } else {
        setError('Could not load your family.');
      }
    } finally {
      setLoading(false);
    }
  }, [loadKids]);

  const refreshHuddleStatus = useCallback(async () => {
    if (!eligible) {
      setHuddleLive(false);
      setHuddleCount(0);
      return;
    }
    try {
      const status = await fetchFamilyHuddleStatus();
      setHuddleConfigured(status.configured);
      setHuddleLive(status.live);
      setHuddleCount(status.participantCount);
      if (status.householdName) {
        setSummary((prev) =>
          prev && prev.householdName !== status.householdName
            ? { ...prev, householdName: status.householdName }
            : prev
        );
      }
    } catch {
      /* keep last known status */
    }
  }, [eligible]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!eligible) return;
    void refreshHuddleStatus();
    const t = window.setInterval(() => void refreshHuddleStatus(), 10_000);
    return () => window.clearInterval(t);
  }, [eligible, refreshHuddleStatus]);

  const addChild = async () => {
    const name = childName.trim();
    if (!name || childBusy) return;
    setChildBusy(true);
    setChildError(null);
    setChildOk(null);
    const typedAge = Number(childAge.trim());
    const adultByAge = childAge.trim() !== '' && Number.isFinite(typedAge) && typedAge >= 18;
    try {
      if (adultByAge) {
        const next = await addFamilyMember({ fullName: name, relationship: 'other' });
        setSummary(next);
        setChildName('');
        setChildAge('');
        setChildOk(`${name} was added as an adult on the household.`);
        setError(null);
        setErrorCode(null);
        return;
      }
      const parts = name.split(/\s+/).filter(Boolean);
      const result = await createParentDependent({
        firstName: parts[0],
        lastName: parts.slice(1).join(' ') || undefined,
        age: childAge.trim() || undefined,
      });
      if (childTheme !== 'soft_garden' && result.child?.id) {
        try {
          await updateParentDependent({ childId: result.child.id, kidsTheme: childTheme });
        } catch {
          /* theme is optional; child was still added */
        }
      }
      setChildName('');
      setChildAge('');
      setChildTheme('soft_garden');
      setChildOk(`${result.child.name} was added. No login needed for them.`);
      if (result.summary?.self?.displayName) {
        setSummary(result.summary);
        setError(null);
        setErrorCode(null);
      } else {
        await load();
      }
    } catch (err) {
      const message =
        err instanceof ParentDependentError || err instanceof FamilyHuddleError
          ? err.message
          : 'Could not add child. Try again or use Settings → Profile.';
      setChildError(message);
    } finally {
      setChildBusy(false);
    }
  };

  const addAdult = async () => {
    const name = adultName.trim();
    if (!name || adultBusy) return;
    setAdultBusy(true);
    setAdultError(null);
    setAdultOk(null);
    try {
      const next = await addFamilyMember({ fullName: name, relationship: adultRelationship });
      setSummary(next);
      setAdultName('');
      setAdultOk(`${name} was added to your household.`);
      setError(null);
      setErrorCode(null);
    } catch (err) {
      setAdultError(err instanceof FamilyHuddleError ? err.message : 'Could not add that family member.');
    } finally {
      setAdultBusy(false);
    }
  };

  const removePerson = async (membershipId: string, displayName: string) => {
    if (!membershipId || removingId) return;
    const ok = window.confirm(`Remove ${displayName} from your household?`);
    if (!ok) return;
    setRemovingId(membershipId);
    setRemoveError(null);
    try {
      const next = await removeFamilyMember(membershipId);
      setSummary(next);
    } catch (err) {
      const message = err instanceof FamilyHuddleError ? err.message : 'Could not remove that family member.';
      setRemoveError(message);
    } finally {
      setRemovingId(null);
    }
  };

  const shareInvite = async () => {
    setShareBusy(true);
    setShareMsg(null);
    setShareError(null);
    try {
      const invite = await createFamilyHuddleInvite();
      const url = familyInviteAbsoluteUrl(invite.path);
      const text = `Join our Family Huddle on The Vault (${inviteExpiryLabel(invite.expiresAt)})`;
      try {
        if (navigator.share) {
          await navigator.share({ title: 'Family Huddle', text, url });
          setShareMsg('Invite shared.');
          return;
        }
      } catch {
        /* fall through */
      }
      try {
        await navigator.clipboard.writeText(url);
        setShareMsg('Invite link copied.');
      } catch {
        window.open(whatsappInviteHref(url, invite.expiresAt), '_blank', 'noopener,noreferrer');
        setShareMsg('Opened WhatsApp to share the invite.');
      }
    } catch (err) {
      setShareError(
        err instanceof FamilyHuddleError ? err.message : 'Could not create an invite link.'
      );
    } finally {
      setShareBusy(false);
    }
  };

  const householdTitle = summary?.householdName || 'Your household';
  const memberCount = summary ? 1 + summary.adults.length + summary.dependents.length : 0;

  return (
    <div className="px-4 pt-6 pb-24 sm:px-6 max-w-2xl mx-auto space-y-8">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-4xl sm:text-[2.75rem] leading-tight font-semibold text-[#0d1a14]" style={SERIF}>
            My Family
          </h1>
          <AskAdminTitleLink />
        </div>
        <p className="text-base text-gray-600 leading-relaxed max-w-prose">
          The people in your household, your private Family Huddle, and your children's Kids View.
        </p>
      </header>

      {loading ? (
        <div role="status" aria-label="Loading your family">
          <RosterSkeleton />
        </div>
      ) : null}

      {!loading && error ? (
        <section className="rounded-3xl border border-rose-200 bg-rose-50/60 p-6 space-y-3">
          <h2 className="text-xl font-semibold text-rose-900" style={SERIF}>
            We couldn't load your household
          </h2>
          <p className="text-[15px] text-rose-900/90 leading-relaxed">{error}</p>
          {errorCode === 'unlinked' || errorCode === 'empty' || errorCode === 'conflict' ? (
            <p className="text-[15px] text-rose-900/80 leading-relaxed">
              You can still add a child below or under{' '}
              <Link to="/settings?tab=personal" className="font-semibold underline underline-offset-2">
                Settings → Profile
              </Link>
              . Staff can fix household links on Members → Family &amp; Access.
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void load()}
            className="h-11 px-4 rounded-xl border border-rose-300 bg-white text-rose-900 font-semibold text-[15px] inline-flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
          >
            <RefreshCw size={16} aria-hidden />
            Try again
          </button>
        </section>
      ) : null}

      {!loading && summary ? (
        <section aria-labelledby="household-heading" className="rounded-3xl border border-burgundy/10 bg-white shadow-sm">
          <div className="px-6 pt-6 pb-4 flex items-end justify-between gap-3 border-b border-gray-100">
            <div className="min-w-0">
              <h2
                id="household-heading"
                className="text-[1.75rem] leading-tight font-semibold text-[#0d1a14] truncate"
                style={SERIF}
              >
                {householdTitle}
              </h2>
              <p className="text-[15px] text-gray-500 mt-0.5">
                {memberCount === 1 ? 'Just you so far' : `${memberCount} people`}
              </p>
            </div>
          </div>

          <div className="px-6 py-5 space-y-6">
            {removeError ? <Notice tone="error">{removeError}</Notice> : null}
            <div>
              <h3 className="text-[15px] font-semibold text-gray-500 mb-2">Adults</h3>
              <ul className="divide-y divide-gray-100">
                <li className="flex items-center gap-3 py-2.5">
                  <Avatar name={summary.self.displayName} tone="self" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[17px] font-semibold text-[#16251f] truncate">
                      {summary.self.displayName}
                    </span>
                    <span className="block text-[14px] text-gray-500">You</span>
                  </span>
                </li>
                {summary.adults.map((adult) => (
                  <li key={adult.membershipId} className="flex items-center gap-3 py-2.5">
                    <Avatar name={adult.displayName} tone="adult" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[17px] font-semibold text-[#16251f] truncate">
                        {adult.displayName}
                      </span>
                      <span className="block text-[14px] text-gray-500">
                        {relationshipLabel(adult.relationship) || 'Adult'}
                        {adult.duplicate ? (
                          <span className="text-rose-700 font-medium"> — looks like a duplicate of you</span>
                        ) : null}
                      </span>
                    </span>
                    <RemoveButton
                      busy={removingId === adult.membershipId}
                      name={adult.displayName}
                      onClick={() => void removePerson(adult.membershipId, adult.displayName)}
                    />
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-[15px] font-semibold text-gray-500 mb-2">Children &amp; dependents</h3>
              {summary.dependents.length > 0 ? (
                <ul className="divide-y divide-gray-100">
                  {summary.dependents.map((dep) => {
                    const kid = kidByName.get(nameKey(dep.displayName));
                    return (
                      <li key={dep.membershipId} className="py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={dep.displayName} tone="child" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[17px] font-semibold text-[#16251f] truncate">
                              {dep.displayName}
                            </span>
                            <span className="block text-[14px] text-gray-500">
                              {relationshipLabel(dep.relationship) || 'Child'}
                              {kid && typeof kid.bucksBalance === 'number' ? (
                                <span className="inline-flex items-center gap-1 ml-2 align-middle text-[#7a5a0e] font-semibold tabular-nums">
                                  <img src="/images/awc-bucks/coin-64.png" width={16} height={16} alt="" />
                                  {kid.bucksBalance}
                                  <span className="sr-only"> PLCC Bucks</span>
                                </span>
                              ) : null}
                            </span>
                          </span>
                          <RemoveButton
                            busy={removingId === dep.membershipId}
                            name={dep.displayName}
                            onClick={() => void removePerson(dep.membershipId, dep.displayName)}
                          />
                        </div>
                        {kid ? (
                          <div className="mt-3 pl-14 flex flex-wrap items-center gap-2">
                            <Link
                              to={`/family/kids/${kid.id}`}
                              className="h-11 px-4 rounded-xl bg-[#0d1a14] text-[#f3dc95] inline-flex items-center gap-2 text-[15px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-burgundy"
                            >
                              <Sparkles size={16} aria-hidden />
                              Open Kids View
                            </Link>
                            <label className="inline-flex items-center gap-2 text-[14px] text-gray-500">
                              <span>Theme</span>
                              <select
                                aria-label={`Kids View theme for ${dep.displayName}`}
                                value={kid.kidsTheme || 'soft_garden'}
                                disabled={themeSavingId === kid.id}
                                onChange={(e) => void changeKidTheme(kid, e.target.value as KidsTheme)}
                                className="h-11 px-3 bg-white rounded-xl border border-gray-200 text-[15px] text-[#16251f] disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-burgundy/30"
                              >
                                {KIDS_THEME_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-[15px] text-gray-500 leading-relaxed py-2">
                  No children on your family record yet. Add one below to give them their own Kids View.
                </p>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {!loading && summary ? (
        <section
          aria-labelledby="huddle-heading"
          className="relative overflow-hidden rounded-3xl text-white p-6 sm:p-7 shadow-lg"
          style={{
            background:
              'radial-gradient(110% 90% at 90% 0%, rgba(201,162,39,0.22) 0%, rgba(201,162,39,0) 55%), linear-gradient(160deg, #112019 0%, #101814 100%)',
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <h2 id="huddle-heading" className="text-[1.75rem] leading-tight font-semibold" style={SERIF}>
              Family Huddle
            </h2>
            {huddleLive ? (
              <span className="shrink-0 inline-flex items-center gap-2 rounded-full bg-white/10 ring-1 ring-white/25 px-3 py-1.5 text-[14px] font-semibold">
                <span className="relative flex w-2.5 h-2.5">
                  <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-75 motion-reduce:hidden" />
                  <span className="relative w-2.5 h-2.5 rounded-full bg-red-500" />
                </span>
                Live{huddleCount > 0 ? ` with ${huddleCount}` : ''}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-[15px] text-white/75 leading-relaxed max-w-prose">
            Private live video for the adults in your household. Guests join with a link. Children aren't on
            camera, and nothing is recorded.
          </p>

          {!huddleConfigured ? (
            <p className="mt-5 text-[15px] text-white/70">Family Huddle isn't switched on yet. Check back soon.</p>
          ) : (
            <div className="mt-5 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => setHuddleMode(huddleLive ? 'join' : 'start')}
                className="h-12 px-6 rounded-xl bg-[#C9A35A] text-[#101814] font-bold text-[15px] inline-flex items-center justify-center gap-2 hover:bg-[#d8b33a] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#e6c766]/50"
              >
                {huddleLive ? <Users size={18} aria-hidden /> : <Radio size={18} aria-hidden />}
                {huddleLive ? 'Join the huddle' : 'Start a huddle'}
              </button>
              <button
                type="button"
                onClick={() => void shareInvite()}
                disabled={shareBusy}
                className="h-12 px-5 rounded-xl border border-white/30 text-white font-semibold text-[15px] inline-flex items-center justify-center gap-2 hover:bg-white/10 disabled:opacity-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/30"
              >
                {shareBusy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Share2 size={18} aria-hidden />}
                Share guest link
              </button>
            </div>
          )}
          {shareMsg ? (
            <p role="status" className="mt-3 text-[14px] text-emerald-200">
              {shareMsg}
            </p>
          ) : null}
          {shareError ? (
            <p role="alert" className="mt-3 text-[14px] text-rose-200">
              {shareError}
            </p>
          ) : null}
        </section>
      ) : null}

      {!loading ? (
        <section aria-labelledby="add-heading" className="rounded-3xl border border-gray-100 bg-[#fcfaf7] p-6 space-y-4">
          <h2 id="add-heading" className="text-[1.75rem] leading-tight font-semibold text-[#0d1a14]" style={SERIF}>
            Add to your family
          </h2>

          <div role="tablist" aria-label="Who are you adding?" className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-gray-100">
            {([
              { key: 'child', label: 'A child', icon: Baby },
              { key: 'adult', label: 'An adult', icon: UserPlus },
            ] as const).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={addMode === key}
                onClick={() => setAddMode(key)}
                className={`h-11 rounded-xl inline-flex items-center justify-center gap-2 text-[15px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-burgundy/40 ${
                  addMode === key ? 'bg-white text-[#0d1a14] shadow-sm' : 'text-gray-500 hover:text-[#0d1a14]'
                }`}
              >
                <Icon size={17} aria-hidden />
                {label}
              </button>
            ))}
          </div>

          {addMode === 'child' ? (
            <form
              role="tabpanel"
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void addChild();
              }}
            >
              <p className="text-[15px] text-gray-600 leading-relaxed">
                No email, phone or sign-up needed. Children stay on your family record only.
              </p>
              {childError ? <Notice tone="error">{childError}</Notice> : null}
              {childOk ? <Notice tone="ok">{childOk}</Notice> : null}
              <div className="grid grid-cols-[1fr_6rem] gap-3">
                <label className="block">
                  <span className="block text-[14px] font-medium text-gray-600 mb-1.5">Full name</span>
                  <input
                    placeholder="First and last name"
                    value={childName}
                    onChange={(e) => setChildName(e.target.value)}
                    autoComplete="off"
                    className={`${INPUT} w-full`}
                  />
                </label>
                <label className="block">
                  <span className="block text-[14px] font-medium text-gray-600 mb-1.5">Age</span>
                  <input
                    inputMode="numeric"
                    placeholder="8"
                    value={childAge}
                    onChange={(e) => setChildAge(e.target.value)}
                    className={`${INPUT} w-full`}
                  />
                </label>
              </div>
              <fieldset>
                <legend className="block text-[14px] font-medium text-gray-600 mb-1.5">Kids View theme</legend>
                <div className="grid grid-cols-2 gap-2">
                  {KIDS_THEME_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className={`h-12 px-4 rounded-xl border inline-flex items-center gap-2.5 cursor-pointer text-[15px] font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-burgundy/30 ${
                        childTheme === opt.value
                          ? 'border-burgundy/50 bg-white text-[#0d1a14]'
                          : 'border-gray-200 bg-white/60 text-gray-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name="new-child-theme"
                        value={opt.value}
                        checked={childTheme === opt.value}
                        onChange={() => setChildTheme(opt.value)}
                        className="accent-[#0d1a14] w-4 h-4"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <button type="submit" disabled={!childName.trim() || childBusy} className={`${PRIMARY_BTN} w-full sm:w-auto`}>
                {childBusy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Plus size={18} aria-hidden />}
                Add child
              </button>
              <p className="text-[14px] text-gray-500">Typed an age of 18 or over? They'll be added as an adult instead.</p>
            </form>
          ) : (
            <form
              role="tabpanel"
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void addAdult();
              }}
            >
              <p className="text-[15px] text-gray-600 leading-relaxed">
                Add a spouse or another adult who lives with you. They can join the Family Huddle.
              </p>
              {adultError ? <Notice tone="error">{adultError}</Notice> : null}
              {adultOk ? <Notice tone="ok">{adultOk}</Notice> : null}
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_10rem] gap-3">
                <label className="block">
                  <span className="block text-[14px] font-medium text-gray-600 mb-1.5">Full name</span>
                  <input
                    placeholder="First and last name"
                    value={adultName}
                    onChange={(e) => setAdultName(e.target.value)}
                    autoComplete="off"
                    className={`${INPUT} w-full`}
                  />
                </label>
                <label className="block">
                  <span className="block text-[14px] font-medium text-gray-600 mb-1.5">Relationship</span>
                  <select
                    value={adultRelationship}
                    onChange={(e) => setAdultRelationship(e.target.value === 'other' ? 'other' : 'spouse')}
                    className={`${INPUT} w-full`}
                  >
                    <option value="spouse">Spouse</option>
                    <option value="other">Other adult</option>
                  </select>
                </label>
              </div>
              <button type="submit" disabled={!adultName.trim() || adultBusy} className={`${PRIMARY_BTN} w-full sm:w-auto`}>
                {adultBusy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Plus size={18} aria-hidden />}
                Add to household
              </button>
            </form>
          )}
        </section>
      ) : null}

      {huddleMode ? (
        <FamilyVoiceHuddle
          mode={huddleMode}
          householdName={summary?.householdName || null}
          onClose={() => {
            setHuddleMode(null);
            void refreshHuddleStatus();
          }}
        />
      ) : null}
    </div>
  );
}
