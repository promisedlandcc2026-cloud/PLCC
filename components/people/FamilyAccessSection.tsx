/**
 * People → Members → Family & Access tab (any member).
 * Search-and-confirm checklist: sign-in → household → spouse/kids → optional guardian.
 * Connect My Family counts come from structured household_members (not Profile CHILDREN JSON).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, ChevronDown, ChevronRight, Home, Link2, Loader2, Shield, Users } from 'lucide-react';
import { FamilyHuddleCard } from '../family/FamilyHuddleCard';
import { FamilyVoiceHuddle } from '../family/FamilyVoiceHuddle';
import { getAuthHeaders } from '../../lib/api';
import { formatAccountContact } from '../../api/_utils/authPhone';
import {
  createFamilyHuddleInvite,
  familyInviteAbsoluteUrl,
  fetchFamilyHuddleStatus,
  inviteExpiryLabel,
  whatsappInviteHref,
} from '../../lib/familyHuddleClient';
import { FamilyHuddleError } from '../../lib/familyHuddleTypes';
import {
  ADD_PEOPLE_NEEDS_HOUSEHOLD,
  CHECKIN_HELPER,
  CHECKOUT_HELPER,
  CONFIRM_ADD_CHILD,
  CONFIRM_ADD_DIRECTORY_SUGGEST,
  CONFIRM_ADD_SPOUSE,
  CONFIRM_GUARDIAN_REACTIVATE,
  CONFIRM_GUARDIAN_REVOKE,
  CONFIRM_HOUSEHOLD_INACTIVATE,
  CONFIRM_LINK_PROPOSE,
  CONFIRM_LINK_REVOKE,
  CONFIRM_LINK_VERIFY,
  CONNECT_FAMILY_COUNTS_NOTE,
  GUARDIAN_RELATIONSHIP_OPTIONS,
  HOUSEHOLD_RELATIONSHIP_OPTIONS,
  LEGACY_CHILDREN_CONNECT_GAP,
  LEGACY_CHILDREN_WARNING,
  SEARCH_DOES_NOT_VERIFY,
  STEP_ADD_PEOPLE_HELP,
  STEP_ADD_PEOPLE_TITLE,
  STEP_GUARDIAN_HELP,
  ENABLE_HOUSEHOLD_CHILD_CARDS_TITLE,
  ENABLE_HOUSEHOLD_CHILD_CARDS_HELP,
  CONFIRM_ENABLE_HOUSEHOLD_CHILD_CARDS,
  STEP_GUARDIAN_TITLE,
  STEP_HOUSEHOLD_HELP,
  STEP_HOUSEHOLD_TITLE,
  STEP_SIGN_IN_HELP,
  STEP_SIGN_IN_TITLE,
  SUGGEST_DIRECTORY_HELP,
  SUGGEST_DIRECTORY_TITLE,
  connectStyleFamilyCounts,
  familyAdminErrorMessage,
  guardianTypeLabel,
  householdRelationshipLabel,
  linkBadgeClasses,
  linkStatusLabel,
  normalizeFamilyAdminDto,
  suggestedHouseholdName,
  type FamilyAdminDto,
} from '../../lib/familyAdminUi';

type Props = { memberId: string };

type PanelState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; family: FamilyAdminDto };

type UserHit = {
  id: string;
  displayName: string;
  email: string | null;
  alreadyLinked: boolean;
};

type MemberHit = {
  id: string;
  displayName: string;
  status: string | null;
};

type HouseholdHit = { id: string; name: string };

type DirectorySuggest = {
  id: string;
  displayName: string;
  status: string | null;
  alreadyInStructuredHousehold: boolean;
};

const API = '/api/vault?resource=people&subResource=family-identity';

const ADD_REL_OPTIONS = HOUSEHOLD_RELATIONSHIP_OPTIONS.filter((o) =>
  ['spouse', 'partner', 'child', 'dependent', 'relative', 'other'].includes(o.value)
);

function StepBadge({ done }: { done: boolean }) {
  return done ? (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 shrink-0">
      <Check size={12} aria-hidden />
    </span>
  ) : (
    <span className="inline-flex w-5 h-5 rounded-full border-2 border-burgundy/20 shrink-0" aria-hidden />
  );
}

export default function FamilyAccessSection({ memberId }: Props) {
  const [panel, setPanel] = useState<PanelState>({ kind: 'loading' });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [guardianOpen, setGuardianOpen] = useState(false);
  const [joinExistingOpen, setJoinExistingOpen] = useState(false);

  const [userQuery, setUserQuery] = useState('');
  const [userHits, setUserHits] = useState<UserHit[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserHit | null>(null);

  const [hhQuery, setHhQuery] = useState('');
  const [hhHits, setHhHits] = useState<HouseholdHit[]>([]);
  const [selectedHh, setSelectedHh] = useState<HouseholdHit | null>(null);
  const [hhRel, setHhRel] = useState('self');
  const [newHhName, setNewHhName] = useState('');

  const [spouseQuery, setSpouseQuery] = useState('');
  const [spouseHits, setSpouseHits] = useState<MemberHit[]>([]);
  const [selectedSpouse, setSelectedSpouse] = useState<MemberHit | null>(null);

  const [childQuery, setChildQuery] = useState('');
  const [childHits, setChildHits] = useState<MemberHit[]>([]);
  const [selectedChild, setSelectedChild] = useState<MemberHit | null>(null);
  const [childRel, setChildRel] = useState<'child' | 'dependent'>('child');

  const [suggests, setSuggests] = useState<DirectorySuggest[]>([]);
  const [suggestLoaded, setSuggestLoaded] = useState(false);
  const [suggestRelById, setSuggestRelById] = useState<Record<string, string>>({});

  const [gUserQuery, setGUserQuery] = useState('');
  const [gUserHits, setGUserHits] = useState<UserHit[]>([]);
  const [selectedGuardian, setSelectedGuardian] = useState<UserHit | null>(null);
  const [gRel, setGRel] = useState('parent');
  const [canViewCard, setCanViewCard] = useState(true);
  const [canCheckIn, setCanCheckIn] = useState(false);
  const [canCheckOut, setCanCheckOut] = useState(false);

  const [viewerCanHuddle, setViewerCanHuddle] = useState(false);
  const [huddleLive, setHuddleLive] = useState(false);
  const [huddleCount, setHuddleCount] = useState(0);
  const [huddleConfigured, setHuddleConfigured] = useState(true);
  const [huddleMode, setHuddleMode] = useState<'start' | 'join' | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setPanel({ kind: 'loading' });
    setMsg(null);
    setHuddleMode(null);
    setShareMsg(null);
    setShareError(null);
    try {
      const headers = await getAuthHeaders(undefined, localStorage.getItem('awc_user_id'));
      const res = await fetch(`${API}&memberId=${encodeURIComponent(memberId)}`, { headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setViewerCanHuddle(false);
        setPanel({ kind: 'error', message: familyAdminErrorMessage(data, 'Could not load Family & Access.') });
        return;
      }
      const dto = normalizeFamilyAdminDto(data.family);
      if (!dto) {
        setViewerCanHuddle(false);
        setPanel({ kind: 'error', message: 'Could not read Family & Access data.' });
        return;
      }
      setPanel({ kind: 'ready', family: dto });
      setViewerCanHuddle(Boolean(data.viewerCanHuddle));
      setNewHhName((prev) => (prev.trim() ? prev : suggestedHouseholdName(dto.member.displayName)));
    } catch {
      setViewerCanHuddle(false);
      setPanel({ kind: 'error', message: 'Could not load Family & Access.' });
    }
  }, [memberId]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshHuddleStatus = useCallback(async () => {
    if (!viewerCanHuddle) {
      setHuddleLive(false);
      setHuddleCount(0);
      return;
    }
    try {
      const status = await fetchFamilyHuddleStatus();
      setHuddleConfigured(status.configured);
      setHuddleLive(status.live);
      setHuddleCount(status.participantCount);
    } catch {
      /* keep last known status */
    }
  }, [viewerCanHuddle]);

  useEffect(() => {
    if (!viewerCanHuddle) return;
    void refreshHuddleStatus();
    const t = window.setInterval(() => void refreshHuddleStatus(), 10_000);
    return () => window.clearInterval(t);
  }, [viewerCanHuddle, refreshHuddleStatus]);

  const shareInvite = async () => {
    setShareBusy(true);
    setShareMsg(null);
    setShareError(null);
    try {
      const invite = await createFamilyHuddleInvite();
      const url = familyInviteAbsoluteUrl(invite.path);
      const text = `Join our Family Huddle on PLCC Canaan (${inviteExpiryLabel(invite.expiresAt)})`;
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

  const mutate = async (body: Record<string, unknown>, successNote: string, key: string) => {
    setBusy(key);
    setMsg(null);
    try {
      const headers = await getAuthHeaders(
        { 'Content-Type': 'application/json' },
        localStorage.getItem('awc_user_id')
      );
      const res = await fetch(API, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(familyAdminErrorMessage(data));
        return false;
      }
      const dto = normalizeFamilyAdminDto(data.family);
      if (dto) setPanel({ kind: 'ready', family: dto });
      else await load();
      if (data.warningActiveGuardian) {
        setMsg(`${successNote} Note: active guardian edges remain for this member.`);
      } else {
        setMsg(successNote);
      }
      return true;
    } catch {
      setMsg('Family & Access update failed.');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const searchUsers = async (q: string, setter: (hits: UserHit[]) => void) => {
    if (q.trim().length < 2) {
      setter([]);
      return;
    }
    try {
      const headers = await getAuthHeaders(
        { 'Content-Type': 'application/json' },
        localStorage.getItem('awc_user_id')
      );
      const res = await fetch(API, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ action: 'search-users', query: q.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(familyAdminErrorMessage(data));
        return;
      }
      setter(Array.isArray(data.results) ? data.results : []);
    } catch {
      setMsg('User search failed.');
    }
  };

  const searchMembers = async (q: string, setter: (hits: MemberHit[]) => void) => {
    if (q.trim().length < 2) {
      setter([]);
      return;
    }
    try {
      const headers = await getAuthHeaders(
        { 'Content-Type': 'application/json' },
        localStorage.getItem('awc_user_id')
      );
      const res = await fetch(API, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ action: 'search-members', query: q.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(familyAdminErrorMessage(data));
        return;
      }
      const rows = Array.isArray(data.results) ? data.results : [];
      setter(rows.filter((m: MemberHit) => m.id !== memberId));
    } catch {
      setMsg('Member search failed.');
    }
  };

  const searchHouseholds = async (q: string) => {
    if (q.trim().length < 2) {
      setHhHits([]);
      return;
    }
    try {
      const headers = await getAuthHeaders(
        { 'Content-Type': 'application/json' },
        localStorage.getItem('awc_user_id')
      );
      const res = await fetch(API, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ action: 'search-households', query: q.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(familyAdminErrorMessage(data));
        return;
      }
      setHhHits(Array.isArray(data.results) ? data.results : []);
    } catch {
      setMsg('Household search failed.');
    }
  };

  const loadDirectorySuggests = async () => {
    setBusy('suggest-load');
    setMsg(null);
    try {
      const headers = await getAuthHeaders(
        { 'Content-Type': 'application/json' },
        localStorage.getItem('awc_user_id')
      );
      const res = await fetch(API, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ action: 'suggest-directory-household-members', memberId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(familyAdminErrorMessage(data));
        return;
      }
      const rows: DirectorySuggest[] = Array.isArray(data.results) ? data.results : [];
      setSuggests(rows);
      setSuggestLoaded(true);
      const defaults: Record<string, string> = {};
      for (const r of rows) defaults[r.id] = 'other';
      setSuggestRelById(defaults);
    } catch {
      setMsg('Could not load directory household suggestions.');
    } finally {
      setBusy(null);
    }
  };

  const createHouseholdAndAdd = async () => {
    const name = newHhName.trim();
    if (!name) {
      setMsg('Enter a household name.');
      return;
    }
    setBusy('hh-create');
    setMsg(null);
    try {
      const headers = await getAuthHeaders(
        { 'Content-Type': 'application/json' },
        localStorage.getItem('awc_user_id')
      );
      const createRes = await fetch('/api/vault?resource=people&subResource=households', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name }),
      });
      const createData = await createRes.json().catch(() => ({}));
      if (!createRes.ok || !createData.household?.id) {
        setMsg('Could not create household.');
        return;
      }
      await mutate(
        {
          action: 'household-add',
          memberId,
          householdId: createData.household.id,
          relationshipType: hhRel || 'self',
        },
        'Member added to new household.',
        'hh-add'
      );
      setSuggestLoaded(false);
    } catch {
      setMsg('Could not create household.');
    } finally {
      setBusy(null);
    }
  };

  const addOtherToHousehold = async (
    other: MemberHit,
    relationshipType: string,
    confirmText: string,
    successNote: string,
    key: string
  ): Promise<boolean> => {
    const fam = panel.kind === 'ready' ? panel.family : null;
    const householdId = fam?.household.id;
    if (!householdId) {
      setMsg(ADD_PEOPLE_NEEDS_HOUSEHOLD);
      return false;
    }
    if (!confirm(confirmText)) return false;
    const ok = await mutate(
      {
        action: 'household-add',
        memberId: other.id,
        householdId,
        relationshipType,
        contextMemberId: memberId,
      },
      successNote,
      key
    );
    if (ok) {
      setSuggestLoaded(false);
    }
    return ok;
  };

  if (panel.kind === 'loading') {
    return (
      <div className="flex justify-center py-10 text-gray-500 gap-2 text-sm">
        <Loader2 className="animate-spin" size={18} /> Loading Family & Access…
      </div>
    );
  }

  if (panel.kind === 'error') {
    return (
      <div className="space-y-2 bg-white p-4 rounded-2xl border border-rose-200">
        <p className="text-sm text-rose-800">{panel.message}</p>
        <button type="button" onClick={() => void load()} className="text-xs font-bold text-burgundy underline">
          Retry
        </button>
      </div>
    );
  }

  const family = panel.family;
  const counts = connectStyleFamilyCounts(family, memberId);
  const hasStructuredHh = Boolean(family.household.id);
  const linkDone = family.userLink.status === 'verified';
  const hhDone = hasStructuredHh && family.household.membershipStatus === 'active';
  const spouseDone = counts.adults > 0;
  const kidsDone = counts.children > 0;
  const legacyGap = family.member.legacyChildrenCount > 0 && counts.children === 0;
  const actionsLocked = Boolean(busy);

  return (
    <div className="w-full text-left space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <p className="text-xs text-gray-500">{CONNECT_FAMILY_COUNTS_NOTE}</p>

      {linkDone && hhDone && counts.children > 0 && (
        <section className="rounded-2xl border-2 border-burgundy/20 bg-burgundy/[0.03] p-4 space-y-2">
          <p className="text-sm font-black text-[#0d1a14] uppercase tracking-widest">
            {ENABLE_HOUSEHOLD_CHILD_CARDS_TITLE}
          </p>
          <p className="text-xs text-gray-600 leading-relaxed">{ENABLE_HOUSEHOLD_CHILD_CARDS_HELP}</p>
          <p className="text-xs font-bold text-[#0d1a14]">
            {counts.children} child{counts.children === 1 ? '' : 'ren'} on household · Connect login{' '}
            {family.userLink.displayName || 'linked'}
          </p>
          <button
            type="button"
            disabled={actionsLocked}
            onClick={() => {
              if (!confirm(CONFIRM_ENABLE_HOUSEHOLD_CHILD_CARDS)) return;
              void mutate(
                { action: 'enable-household-child-cards', memberId },
                'Connect child cards enabled for household kids.',
                'enable-child-cards'
              );
            }}
            className="w-full min-h-[48px] py-3 bg-burgundy text-gold text-xs font-black uppercase tracking-widest rounded-xl disabled:opacity-50"
          >
            {busy === 'enable-child-cards' ? 'Enabling…' : 'Enable cards for all household kids'}
          </button>
        </section>
      )}

      {viewerCanHuddle ? (
        <FamilyHuddleCard
          huddleLive={huddleLive}
          huddleCount={huddleCount}
          huddleConfigured={huddleConfigured}
          shareBusy={shareBusy}
          shareMsg={shareMsg}
          shareError={shareError}
          onStart={() => setHuddleMode('start')}
          onJoin={() => setHuddleMode('join')}
          onShare={() => void shareInvite()}
        />
      ) : (
        <section className="rounded-2xl border border-burgundy/10 bg-white p-4 space-y-2">
          <p className="text-sm font-black text-[#1A1A1A]">Family Huddle</p>
          <p className="text-[12px] text-gray-500 leading-relaxed">
            Start or join only from a household you belong to as a verified adult. Opening
            this member&apos;s tab would start your own Family Huddle, not theirs.
          </p>
          <Link
            to="/family"
            className="inline-flex min-h-[40px] items-center text-sm font-bold text-burgundy underline"
          >
            Open My Family
          </Link>
        </section>
      )}

      {huddleMode && viewerCanHuddle ? (
        <FamilyVoiceHuddle
          mode={huddleMode}
          householdName={family.household.name}
          onClose={() => {
            setHuddleMode(null);
            void refreshHuddleStatus();
          }}
        />
      ) : null}

      {/* Connect-style preview */}
      <section className="bg-white p-4 rounded-2xl border border-burgundy/10 space-y-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-gold">Open member</p>
          <p className="text-lg font-black text-[#0d1a14]">{family.member.displayName}</p>
          <p className="text-[11px] text-gray-500 mt-1">
            Build this family’s Connect roster here — same flow for every member in the directory.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-3 text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Adults</p>
            <p className="text-2xl font-black text-[#0d1a14] tabular-nums">{counts.adults}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">Other adults (not self)</p>
          </div>
          <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-3 text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Children</p>
            <p className="text-2xl font-black text-[#0d1a14] tabular-nums">{counts.children}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">Structured dependents</p>
          </div>
        </div>
        {hasStructuredHh && (
          <ul className="space-y-1">
            {family.household.members
              .filter((m) => String(m.status) === 'active')
              .map((m) => (
                <li
                  key={m.membershipId}
                  className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm"
                >
                  <span className="font-bold text-[#0d1a14]">
                    {m.displayName}
                    {m.memberId === memberId ? ' (this member)' : ''}
                  </span>
                  <span className="text-[10px] font-black uppercase text-gray-500">
                    {householdRelationshipLabel(m.relationshipType)}
                  </span>
                </li>
              ))}
          </ul>
        )}
        {legacyGap && (
          <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-950">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" aria-hidden />
            <div>
              <p className="font-black uppercase tracking-widest mb-1">
                {family.member.legacyChildrenCount} legacy children entr
                {family.member.legacyChildrenCount === 1 ? 'y' : 'ies'} on Profile
              </p>
              <p className="mb-1">{LEGACY_CHILDREN_WARNING}</p>
              <p>{LEGACY_CHILDREN_CONNECT_GAP}</p>
            </div>
          </div>
        )}
      </section>

      {msg && (
        <p className="text-sm font-medium text-burgundy bg-gold-cream/50 border border-gold/20 rounded-xl px-3 py-2">
          {msg}
        </p>
      )}

      {/* Step 1 — Sign-in / Identity Link */}
      <section className="bg-white p-4 rounded-2xl border border-burgundy/10" aria-labelledby="family-identity-heading">
        <div className="flex items-start gap-2 mb-3">
          <StepBadge done={linkDone} />
          <Link2 size={18} className="text-burgundy shrink-0 mt-0.5" aria-hidden />
          <div>
            <h3 id="family-identity-heading" className="text-sm font-black text-[#0d1a14] uppercase tracking-widest">
              {STEP_SIGN_IN_TITLE}
            </h3>
            <p className="text-xs text-gray-500 mt-1">Identity Link — {STEP_SIGN_IN_HELP}</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${linkBadgeClasses(family.userLink.status)}`}
            >
              {linkStatusLabel(family.userLink.status)}
            </span>
            {family.userLink.sameUuidCandidate && (
              <span className="inline-flex px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border bg-sky-50 text-sky-900 border-sky-200">
                Same-ID candidate
              </span>
            )}
          </div>

          {family.userLink.userId ? (
            <div className="bg-gray-50 rounded-xl p-3 text-sm">
              <p className="font-bold text-[#0d1a14]">{family.userLink.displayName}</p>
              {family.userLink.email && <p className="text-xs text-gray-500 mt-0.5">{family.userLink.email}</p>}
            </div>
          ) : (
            <p className="text-sm text-gray-600 italic">No sign-in account linked.</p>
          )}

          {(family.userLink.status === 'none' || family.userLink.status === 'revoked') && (
            <div className="space-y-2 border-t border-gray-100 pt-3">
              <p className="text-[11px] text-gray-500">{SEARCH_DOES_NOT_VERIFY}</p>
              <label className="block text-xs font-black text-gray-600 uppercase tracking-widest">
                Find Sign-In Account
              </label>
              <input
                value={userQuery}
                onChange={(e) => {
                  setUserQuery(e.target.value);
                  void searchUsers(e.target.value, setUserHits);
                }}
                placeholder="Search name or email…"
                className="w-full p-3 border-2 border-gray-100 rounded-xl text-sm font-medium outline-none focus:border-gold"
              />
              {userHits.length > 0 && (
                <ul className="max-h-40 overflow-y-auto space-y-1">
                  {userHits.map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        disabled={u.alreadyLinked || actionsLocked}
                        onClick={() => setSelectedUser(u)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm border ${
                          selectedUser?.id === u.id
                            ? 'border-burgundy bg-burgundy/5'
                            : 'border-gray-100 hover:border-gold/40'
                        } ${u.alreadyLinked ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <span className="font-bold text-[#0d1a14]">{u.displayName}</span>
                        {u.email && <span className="block text-xs text-gray-500">{formatAccountContact(u.email) || u.email}</span>}
                        {u.id === memberId && (
                          <span className="text-[10px] font-black uppercase text-sky-800">Same-ID</span>
                        )}
                        {u.alreadyLinked && (
                          <span className="text-[10px] font-bold text-rose-700"> Already linked</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                disabled={!selectedUser || actionsLocked}
                onClick={() => {
                  if (!selectedUser || !confirm(CONFIRM_LINK_PROPOSE)) return;
                  void mutate(
                    { action: 'link-propose', memberId, userId: selectedUser.id },
                    'Identity link proposed — not verified yet.',
                    'link-propose'
                  ).then((ok) => {
                    if (ok) {
                      setSelectedUser(null);
                      setUserQuery('');
                      setUserHits([]);
                    }
                  });
                }}
                className="w-full py-2.5 bg-burgundy text-gold text-xs font-black uppercase tracking-widest rounded-xl disabled:opacity-50"
              >
                {busy === 'link-propose' ? 'Proposing…' : 'Propose Link'}
              </button>
            </div>
          )}

          {family.userLink.status === 'proposed' && (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={actionsLocked}
                onClick={() => {
                  if (!confirm(CONFIRM_LINK_VERIFY)) return;
                  void mutate({ action: 'link-verify', memberId }, 'Identity link verified.', 'link-verify');
                }}
                className="flex-1 py-2.5 bg-emerald-700 text-white text-xs font-black uppercase tracking-widest rounded-xl disabled:opacity-50"
              >
                {busy === 'link-verify' ? 'Verifying…' : 'Verify'}
              </button>
              <button
                type="button"
                disabled={actionsLocked}
                onClick={() => {
                  if (!confirm(CONFIRM_LINK_REVOKE)) return;
                  void mutate({ action: 'link-revoke', memberId }, 'Identity link revoked.', 'link-revoke');
                }}
                className="flex-1 py-2.5 bg-rose-700 text-white text-xs font-black uppercase tracking-widest rounded-xl disabled:opacity-50"
              >
                Revoke
              </button>
            </div>
          )}

          {family.userLink.status === 'verified' && (
            <button
              type="button"
              disabled={actionsLocked}
              onClick={() => {
                if (!confirm(CONFIRM_LINK_REVOKE)) return;
                void mutate({ action: 'link-revoke', memberId }, 'Identity link revoked.', 'link-revoke');
              }}
              className="w-full py-2.5 bg-rose-700 text-white text-xs font-black uppercase tracking-widest rounded-xl disabled:opacity-50"
            >
              Revoke Link
            </button>
          )}
        </div>
      </section>

      {/* Step 2 — Household */}
      <section className="bg-white p-4 rounded-2xl border border-burgundy/10" aria-labelledby="family-household-heading">
        <div className="flex items-start gap-2 mb-3">
          <StepBadge done={hhDone} />
          <Home size={18} className="text-burgundy shrink-0 mt-0.5" aria-hidden />
          <div>
            <h3 id="family-household-heading" className="text-sm font-black text-[#0d1a14] uppercase tracking-widest">
              {STEP_HOUSEHOLD_TITLE}
            </h3>
            <p className="text-xs text-gray-500 mt-1">{STEP_HOUSEHOLD_HELP}</p>
          </div>
        </div>

        <div className="space-y-3">
          {family.member.legacyHouseholdName && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-950">
              <p className="font-black uppercase tracking-widest mb-1">Legacy directory household</p>
              <p className="font-bold">{family.member.legacyHouseholdName}</p>
              <p className="mt-1 text-amber-800">Read-only. Writes go to structured household membership only.</p>
            </div>
          )}

          {family.household.id ? (
            <div className="space-y-2">
              <p className="text-sm font-bold text-[#0d1a14]">{family.household.name || 'Household'}</p>
              <p className="text-xs text-gray-500">
                Your relationship: {householdRelationshipLabel(family.household.relationshipType)} ·{' '}
                {family.household.membershipStatus || 'active'}
              </p>
              {family.household.membershipId && family.household.membershipStatus === 'active' && (
                <button
                  type="button"
                  disabled={actionsLocked}
                  onClick={() => {
                    const hasActiveGuardian = family.guardianRelationships.some((g) => g.status === 'active');
                    const warn = hasActiveGuardian
                      ? `\n\nWarning: this member still has active guardian access.`
                      : '';
                    if (!confirm(CONFIRM_HOUSEHOLD_INACTIVATE + warn)) return;
                    void mutate(
                      { action: 'household-inactivate', membershipId: family.household.membershipId },
                      'Household membership inactivated.',
                      'hh-inactivate'
                    ).then(() => setSuggestLoaded(false));
                  }}
                  className="w-full py-2.5 border-2 border-rose-200 text-rose-800 text-xs font-black uppercase tracking-widest rounded-xl disabled:opacity-50"
                >
                  Inactivate Membership
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3 border-t border-gray-100 pt-3">
              <p className="text-sm text-gray-600 italic">No structured household membership.</p>
              <label className="block text-xs font-black text-gray-600 uppercase tracking-widest">
                Create household
              </label>
              <input
                value={newHhName}
                onChange={(e) => setNewHhName(e.target.value)}
                placeholder="Household name…"
                className="w-full p-3 border-2 border-gray-100 rounded-xl text-sm outline-none focus:border-gold"
              />
              <button
                type="button"
                disabled={!newHhName.trim() || actionsLocked}
                onClick={() => void createHouseholdAndAdd()}
                className="w-full py-2.5 bg-burgundy text-gold text-xs font-black uppercase tracking-widest rounded-xl disabled:opacity-50"
              >
                {busy === 'hh-create' || busy === 'hh-add' ? 'Creating…' : 'Create & Add This Person'}
              </button>

              <button
                type="button"
                onClick={() => setJoinExistingOpen((o) => !o)}
                className="flex items-center gap-1 text-xs font-bold text-burgundy"
              >
                {joinExistingOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                Or join an existing household
              </button>
              {joinExistingOpen && (
                <div className="space-y-2 pl-1">
                  <select
                    value={hhRel}
                    onChange={(e) => setHhRel(e.target.value)}
                    className="w-full p-3 border-2 border-gray-100 rounded-xl text-sm font-bold outline-none focus:border-gold"
                  >
                    {HOUSEHOLD_RELATIONSHIP_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <input
                    value={hhQuery}
                    onChange={(e) => {
                      setHhQuery(e.target.value);
                      void searchHouseholds(e.target.value);
                    }}
                    placeholder="Search households…"
                    className="w-full p-3 border-2 border-gray-100 rounded-xl text-sm outline-none focus:border-gold"
                  />
                  {hhHits.length > 0 && (
                    <ul className="max-h-32 overflow-y-auto space-y-1">
                      {hhHits.map((h) => (
                        <li key={h.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedHh(h)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm border ${
                              selectedHh?.id === h.id ? 'border-burgundy bg-burgundy/5' : 'border-gray-100'
                            }`}
                          >
                            {h.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    disabled={!selectedHh || actionsLocked}
                    onClick={() => {
                      if (!selectedHh) return;
                      void mutate(
                        {
                          action: 'household-add',
                          memberId,
                          householdId: selectedHh.id,
                          relationshipType: hhRel,
                        },
                        'Added to household.',
                        'hh-add'
                      ).then((ok) => {
                        if (ok) {
                          setSelectedHh(null);
                          setHhQuery('');
                          setHhHits([]);
                          setSuggestLoaded(false);
                        }
                      });
                    }}
                    className="w-full py-2.5 border-2 border-burgundy text-burgundy text-xs font-black uppercase tracking-widest rounded-xl disabled:opacity-50"
                  >
                    Add to Selected Household
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Step 3 — Add people */}
      <section className="bg-white p-4 rounded-2xl border border-burgundy/10" aria-labelledby="family-add-people-heading">
        <div className="flex items-start gap-2 mb-3">
          <StepBadge done={spouseDone && kidsDone} />
          <Users size={18} className="text-burgundy shrink-0 mt-0.5" aria-hidden />
          <div>
            <h3 id="family-add-people-heading" className="text-sm font-black text-[#0d1a14] uppercase tracking-widest">
              {STEP_ADD_PEOPLE_TITLE}
            </h3>
            <p className="text-xs text-gray-500 mt-1">{STEP_ADD_PEOPLE_HELP}</p>
          </div>
        </div>

        {!hasStructuredHh ? (
          <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            {ADD_PEOPLE_NEEDS_HOUSEHOLD}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-black text-gray-600 uppercase tracking-widest flex items-center gap-2">
                Add spouse
                {spouseDone && <span className="text-emerald-700 normal-case tracking-normal font-bold">— on roster</span>}
              </p>
              {!spouseDone && (
                <>
                  <input
                    value={spouseQuery}
                    onChange={(e) => {
                      setSpouseQuery(e.target.value);
                      void searchMembers(e.target.value, setSpouseHits);
                    }}
                    placeholder="Search members…"
                    className="w-full p-3 border-2 border-gray-100 rounded-xl text-sm outline-none focus:border-gold"
                  />
                  {spouseHits.length > 0 && (
                    <ul className="max-h-32 overflow-y-auto space-y-1">
                      {spouseHits.map((m) => (
                        <li key={m.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedSpouse(m)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm border ${
                              selectedSpouse?.id === m.id ? 'border-burgundy bg-burgundy/5' : 'border-gray-100'
                            }`}
                          >
                            <span className="font-bold text-[#0d1a14]">{m.displayName}</span>
                            {m.status && (
                              <span className="block text-[10px] uppercase text-gray-500">{m.status}</span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    disabled={!selectedSpouse || actionsLocked}
                    onClick={() => {
                      if (!selectedSpouse) return;
                      void addOtherToHousehold(
                        selectedSpouse,
                        'spouse',
                        CONFIRM_ADD_SPOUSE,
                        'Spouse added to structured household.',
                        'add-spouse'
                      ).then((ok) => {
                        if (!ok) return;
                        setSelectedSpouse(null);
                        setSpouseQuery('');
                        setSpouseHits([]);
                      });
                    }}
                    className="w-full py-2.5 bg-burgundy text-gold text-xs font-black uppercase tracking-widest rounded-xl disabled:opacity-50"
                  >
                    {busy === 'add-spouse' ? 'Adding…' : 'Add spouse'}
                  </button>
                </>
              )}
            </div>

            <div className="space-y-2 border-t border-gray-100 pt-3">
              <p className="text-xs font-black text-gray-600 uppercase tracking-widest">Add child / dependent</p>
              <select
                value={childRel}
                onChange={(e) => setChildRel(e.target.value as 'child' | 'dependent')}
                className="w-full p-3 border-2 border-gray-100 rounded-xl text-sm font-bold outline-none focus:border-gold"
              >
                <option value="child">Child</option>
                <option value="dependent">Dependent</option>
              </select>
              <input
                value={childQuery}
                onChange={(e) => {
                  setChildQuery(e.target.value);
                  void searchMembers(e.target.value, setChildHits);
                }}
                placeholder="Search members…"
                className="w-full p-3 border-2 border-gray-100 rounded-xl text-sm outline-none focus:border-gold"
              />
              {childHits.length > 0 && (
                <ul className="max-h-32 overflow-y-auto space-y-1">
                  {childHits.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedChild(m)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm border ${
                          selectedChild?.id === m.id ? 'border-burgundy bg-burgundy/5' : 'border-gray-100'
                        }`}
                      >
                        <span className="font-bold text-[#0d1a14]">{m.displayName}</span>
                        {m.status && (
                          <span className="block text-[10px] uppercase text-gray-500">{m.status}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                disabled={!selectedChild || actionsLocked}
                onClick={() => {
                  if (!selectedChild) return;
                  void addOtherToHousehold(
                    selectedChild,
                    childRel,
                    CONFIRM_ADD_CHILD,
                    'Child/dependent added to structured household.',
                    'add-child'
                  ).then((ok) => {
                    if (!ok) return;
                    setSelectedChild(null);
                    setChildQuery('');
                    setChildHits([]);
                  });
                }}
                className="w-full py-2.5 bg-burgundy text-gold text-xs font-black uppercase tracking-widest rounded-xl disabled:opacity-50"
              >
                {busy === 'add-child' ? 'Adding…' : 'Add child / dependent'}
              </button>
            </div>

            <div className="space-y-2 border-t border-dashed border-gray-200 pt-3">
              <p className="text-xs font-black text-gray-600 uppercase tracking-widest">{SUGGEST_DIRECTORY_TITLE}</p>
              <p className="text-[11px] text-gray-500">{SUGGEST_DIRECTORY_HELP}</p>
              <button
                type="button"
                disabled={actionsLocked}
                onClick={() => void loadDirectorySuggests()}
                className="w-full py-2.5 border-2 border-burgundy text-burgundy text-xs font-black uppercase tracking-widest rounded-xl disabled:opacity-50"
              >
                {busy === 'suggest-load'
                  ? 'Loading…'
                  : suggestLoaded
                    ? 'Refresh directory suggestions'
                    : 'Show directory suggestions'}
              </button>
              {suggestLoaded && suggests.length === 0 && (
                <p className="text-sm text-gray-600 italic">No other directory household members found.</p>
              )}
              {suggests.length > 0 && (
                <ul className="space-y-2">
                  {suggests.map((s) => (
                    <li key={s.id} className="bg-gray-50 rounded-xl p-3 space-y-2">
                      <div>
                        <p className="text-sm font-bold text-[#0d1a14]">{s.displayName}</p>
                        <p className="text-[10px] font-black uppercase text-gray-500">
                          {s.status || '—'}
                          {s.alreadyInStructuredHousehold ? ' · already in household' : ''}
                        </p>
                      </div>
                      {!s.alreadyInStructuredHousehold && (
                        <div className="flex flex-col sm:flex-row gap-2">
                          <select
                            value={suggestRelById[s.id] || 'other'}
                            onChange={(e) =>
                              setSuggestRelById((prev) => ({ ...prev, [s.id]: e.target.value }))
                            }
                            className="flex-1 p-2 border-2 border-gray-100 rounded-lg text-sm font-bold outline-none focus:border-gold"
                          >
                            {ADD_REL_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={actionsLocked}
                            onClick={() => {
                              const rel = suggestRelById[s.id] || 'other';
                              void addOtherToHousehold(
                                { id: s.id, displayName: s.displayName, status: s.status },
                                rel,
                                CONFIRM_ADD_DIRECTORY_SUGGEST,
                                `${s.displayName} added from directory household.`,
                                `suggest-add-${s.id}`
                              );
                            }}
                            className="px-4 py-2 bg-burgundy text-gold text-[10px] font-black uppercase tracking-widest rounded-lg disabled:opacity-50"
                          >
                            Confirm add
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Step 4 — Guardian Access (collapsed by default) */}
      <section className="bg-white p-4 rounded-2xl border border-burgundy/10" aria-labelledby="family-guardian-heading">
        <button
          type="button"
          onClick={() => setGuardianOpen((o) => !o)}
          className="w-full flex items-start gap-2 text-left"
          aria-expanded={guardianOpen}
        >
          <StepBadge done={family.guardianRelationships.some((g) => g.status === 'active') || family.childRelationships.some((c) => c.status === 'active')} />
          <Shield size={18} className="text-burgundy shrink-0 mt-0.5" aria-hidden />
          <div className="flex-1">
            <h3 id="family-guardian-heading" className="text-sm font-black text-[#0d1a14] uppercase tracking-widest">
              {STEP_GUARDIAN_TITLE}
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Guardian Access — {STEP_GUARDIAN_HELP} No spouse-card controls.
            </p>
          </div>
          {guardianOpen ? <ChevronDown size={18} className="text-gray-400" /> : <ChevronRight size={18} className="text-gray-400" />}
        </button>

        {guardianOpen && (
          <div className="space-y-3 mt-4 border-t border-gray-100 pt-3">
            {family.member.legacyChildrenCount > 0 && !legacyGap && (
              <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-950">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <div>
                  <p className="font-black uppercase tracking-widest mb-1">
                    {family.member.legacyChildrenCount} legacy children entr
                    {family.member.legacyChildrenCount === 1 ? 'y' : 'ies'}
                  </p>
                  <p>{LEGACY_CHILDREN_WARNING}</p>
                </div>
              </div>
            )}

            <div>
              <p className="text-xs font-black text-gray-600 uppercase tracking-widest mb-2 flex items-center gap-1">
                <Users size={12} /> Guardians of this member
              </p>
              {family.guardianRelationships.length === 0 ? (
                <p className="text-sm text-gray-600 italic">No guardian relationships.</p>
              ) : (
                <ul className="space-y-2">
                  {family.guardianRelationships.map((g) => (
                    <li key={g.id} className="bg-gray-50 rounded-xl p-3 space-y-2">
                      <div>
                        <p className="text-sm font-bold text-[#0d1a14]">{g.guardianDisplayName}</p>
                        <p className="text-[10px] font-black uppercase text-gray-500">
                          {guardianTypeLabel(g.relationshipType)} · {g.status}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wider">
                        <span className={g.canViewCard ? 'text-emerald-800' : 'text-gray-400'}>
                          View Card {g.canViewCard ? '✓' : '✗'}
                        </span>
                        <span className={g.canCheckIn ? 'text-emerald-800' : 'text-gray-400'}>
                          Check In {g.canCheckIn ? '✓' : '✗'}
                        </span>
                        <span className={g.canCheckOut ? 'text-emerald-800' : 'text-gray-400'}>
                          Check Out {g.canCheckOut ? '✓' : '✗'}
                        </span>
                      </div>
                      {g.status === 'active' ? (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={actionsLocked}
                            onClick={() => {
                              void mutate(
                                { action: 'guardian-update', guardianId: g.id, canViewCard: !g.canViewCard },
                                'Guardian permissions updated.',
                                `g-view-${g.id}`
                              );
                            }}
                            className="px-2 py-1 text-[10px] font-black uppercase border rounded-lg border-gray-200"
                          >
                            Toggle View Card
                          </button>
                          <button
                            type="button"
                            disabled={actionsLocked}
                            onClick={() => {
                              void mutate(
                                { action: 'guardian-update', guardianId: g.id, canCheckIn: !g.canCheckIn },
                                'Guardian permissions updated.',
                                `g-in-${g.id}`
                              );
                            }}
                            className="px-2 py-1 text-[10px] font-black uppercase border rounded-lg border-gray-200"
                          >
                            Toggle Check In
                          </button>
                          <button
                            type="button"
                            disabled={actionsLocked}
                            onClick={() => {
                              void mutate(
                                { action: 'guardian-update', guardianId: g.id, canCheckOut: !g.canCheckOut },
                                'Guardian permissions updated.',
                                `g-out-${g.id}`
                              );
                            }}
                            className="px-2 py-1 text-[10px] font-black uppercase border rounded-lg border-gray-200"
                          >
                            Toggle Check Out
                          </button>
                          <button
                            type="button"
                            disabled={actionsLocked}
                            onClick={() => {
                              if (!confirm(CONFIRM_GUARDIAN_REVOKE)) return;
                              void mutate(
                                { action: 'guardian-revoke', guardianId: g.id },
                                'Guardian relationship revoked.',
                                `g-revoke-${g.id}`
                              );
                            }}
                            className="px-2 py-1 text-[10px] font-black uppercase border rounded-lg border-rose-200 text-rose-800"
                          >
                            Revoke
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={actionsLocked}
                          onClick={() => {
                            if (!confirm(CONFIRM_GUARDIAN_REACTIVATE)) return;
                            void mutate(
                              { action: 'guardian-reactivate', guardianId: g.id },
                              'Guardian relationship reactivated.',
                              `g-react-${g.id}`
                            );
                          }}
                          className="px-2 py-1 text-[10px] font-black uppercase border rounded-lg border-emerald-200 text-emerald-900"
                        >
                          Reactivate
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {family.childRelationships.length > 0 && (
              <div>
                <p className="text-xs font-black text-gray-600 uppercase tracking-widest mb-2">
                  Children this linked user can access
                </p>
                <ul className="space-y-1">
                  {family.childRelationships.map((c) => (
                    <li key={c.id} className="bg-gray-50 rounded-lg px-3 py-2 text-sm flex justify-between">
                      <span className="font-bold text-[#0d1a14]">{c.childDisplayName}</span>
                      <span className="text-[10px] font-black uppercase text-gray-500">
                        {guardianTypeLabel(c.relationshipType)} · {c.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="border-t border-gray-100 pt-3 space-y-2">
              <p className="text-xs font-black text-gray-600 uppercase tracking-widest">Add guardian</p>
              <p className="text-[11px] text-gray-500">
                Guardian must already have a verified identity link. Child must be this member record.
              </p>
              <input
                value={gUserQuery}
                onChange={(e) => {
                  setGUserQuery(e.target.value);
                  void searchUsers(e.target.value, setGUserHits);
                }}
                placeholder="Search guardian sign-in account…"
                className="w-full p-3 border-2 border-gray-100 rounded-xl text-sm outline-none focus:border-gold"
              />
              {gUserHits.length > 0 && (
                <ul className="max-h-32 overflow-y-auto space-y-1">
                  {gUserHits.map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedGuardian(u)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm border ${
                          selectedGuardian?.id === u.id ? 'border-burgundy bg-burgundy/5' : 'border-gray-100'
                        }`}
                      >
                        <span className="font-bold">{u.displayName}</span>
                        {u.email && <span className="block text-xs text-gray-500">{formatAccountContact(u.email) || u.email}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <select
                value={gRel}
                onChange={(e) => setGRel(e.target.value)}
                className="w-full p-3 border-2 border-gray-100 rounded-xl text-sm font-bold outline-none focus:border-gold"
              >
                {GUARDIAN_RELATIONSHIP_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <div className="space-y-2 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={canViewCard} onChange={(e) => setCanViewCard(e.target.checked)} />
                  View Child Card
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={canCheckIn}
                    onChange={(e) => setCanCheckIn(e.target.checked)}
                  />
                  <span>
                    Check In
                    <span className="block text-[11px] text-gray-500 font-normal">{CHECKIN_HELPER}</span>
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={canCheckOut}
                    onChange={(e) => setCanCheckOut(e.target.checked)}
                  />
                  <span>
                    Check Out
                    <span className="block text-[11px] text-gray-500 font-normal">{CHECKOUT_HELPER}</span>
                  </span>
                </label>
              </div>
              <button
                type="button"
                disabled={!selectedGuardian || actionsLocked}
                onClick={() => {
                  if (!selectedGuardian) return;
                  void mutate(
                    {
                      action: 'guardian-create',
                      guardianUserId: selectedGuardian.id,
                      childMemberId: memberId,
                      relationshipType: gRel,
                      canViewCard,
                      canCheckIn,
                      canCheckOut,
                    },
                    'Guardian relationship created.',
                    'g-create'
                  ).then((ok) => {
                    if (ok) {
                      setSelectedGuardian(null);
                      setGUserQuery('');
                      setGUserHits([]);
                      setCanViewCard(false);
                      setCanCheckIn(false);
                      setCanCheckOut(false);
                    }
                  });
                }}
                className="w-full py-2.5 bg-burgundy text-gold text-xs font-black uppercase tracking-widest rounded-xl disabled:opacity-50"
              >
                {busy === 'g-create' ? 'Creating…' : 'Create Guardian Access'}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
