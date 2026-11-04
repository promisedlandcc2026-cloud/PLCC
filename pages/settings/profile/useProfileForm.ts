import { useCallback, useEffect, useMemo, useState } from 'react';
import { Child } from '../../../types';
import { getAuthHeaders } from '../../../lib/api';
import { formatAccountContact, isPhonePlaceholderEmail } from '../../../api/_utils/authPhone';
import { listParentDependents } from '../../../lib/parentDependentsClient';
import { mapDependents } from './useChildren';
import { errorMessage, MIN_PASSWORD_LENGTH } from './ui';

export type Team = { id: string; name: string; [key: string]: unknown };
export type LoadStatus = 'loading' | 'ready' | 'error';

export type ProfileFields = {
  fullName: string;
  email: string;
  phone: string;
  jobTitle: string;
  birthday: string;
  avatarUrl: string;
};

type NavUser = {
  userId?: string | null;
  userName?: string | null;
  userTitle?: string | null;
  userEmail?: string | null;
  userAvatar?: string | null;
  userBirthday?: string | null;
  login: (user: any) => void;
};

type ChildrenBinding = {
  children: Child[];
  setChildren: (children: Child[]) => void;
  pendingLocalChange: boolean;
  markSaved: () => void;
};


/** YYYY-MM-DD for input[type="date"]. */
const toDateInput = (value?: string | null) => (value ? String(value).slice(0, 10) : '');

const sortedKey = (ids: string[]) => [...ids].sort().join('|');

const fieldsEqual = (a: ProfileFields, b: ProfileFields) =>
  (Object.keys(a) as (keyof ProfileFields)[]).every((k) => a[k] === b[k]);

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

/**
 * Loads the signed-in member's profile, teams, and memberships, tracks unsaved edits,
 * and saves everything (profile PATCH + team join/leave) in one action.
 */
export function useProfileForm(nav: NavUser, kids: ChildrenBinding) {
  const { userId, login } = nav;
  const phoneOnlyAccount = isPhonePlaceholderEmail(nav.userEmail);

  const initialFields = useMemo<ProfileFields>(
    () => ({
      fullName: nav.userName || '',
      email: phoneOnlyAccount ? '' : nav.userEmail || '',
      phone: phoneOnlyAccount ? formatAccountContact(nav.userEmail) : '',
      jobTitle: nav.userTitle || '',
      birthday: toDateInput(nav.userBirthday),
      avatarUrl: nav.userAvatar || '',
    }),
    // Seed once per signed-in user; later context updates come from our own save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId]
  );

  const [fields, setFields] = useState<ProfileFields>(initialFields);
  const [savedFields, setSavedFields] = useState<ProfileFields>(initialFields);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsStatus, setTeamsStatus] = useState<LoadStatus>('loading');
  const [memberships, setMemberships] = useState<string[]>([]);
  const [savedMemberships, setSavedMemberships] = useState<string[]>([]);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const setField = useCallback(<K extends keyof ProfileFields>(key: K, value: ProfileFields[K]) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  }, []);

  // ---- Load ---------------------------------------------------------------
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      const headers = await getAuthHeaders(undefined, userId);

      // 1. Own profile row (self=true avoids picking up the wrong admin row)
      try {
        const userData = await readJson(await fetch('/api/vault?resource=users&self=true', { headers }));
        const dbUser = userData?.users?.[0];
        if (!cancelled && dbUser) {
          const patch: Partial<ProfileFields> = {};
          if (dbUser.phone) patch.phone = String(dbUser.phone);
          if (dbUser.birthday) patch.birthday = toDateInput(dbUser.birthday);
          setFields((prev) => ({ ...prev, ...patch }));
          setSavedFields((prev) => ({ ...prev, ...patch }));
          if (Array.isArray(dbUser.children)) kids.setChildren(dbUser.children);
        }
      } catch (err) {
        console.error('[Profile] Profile fetch failed:', err);
      }

      // 2. Structured family records (preferred over the legacy children JSON)
      try {
        const mapped = mapDependents(await listParentDependents());
        if (!cancelled && mapped.length) kids.setChildren(mapped);
      } catch (err) {
        console.warn('[Profile] Dependents list:', err);
      }

      // 3. Teams + my memberships
      try {
        const [teamsData, memData] = await Promise.all([
          fetch('/api/vault?resource=people&subResource=teams', { headers }).then(readJson),
          fetch('/api/vault?resource=people&subResource=teams&action=memberships', { headers }).then(readJson),
        ]);
        if (cancelled) return;
        if (!teamsData?.ok) throw new Error(teamsData?.error || 'Teams unavailable');
        const loaded: Team[] = teamsData.teams || [];
        setTeams(loaded);
        if (memData?.ok) {
          const known = new Set(loaded.map((t) => t.id));
          const ids = Array.from(new Set<string>((memData.teamIds || []).filter((id: string) => known.has(id))));
          setMemberships(ids);
          setSavedMemberships(ids);
        }
        setTeamsStatus('ready');
      } catch (err) {
        console.error('[Profile] Teams fetch failed:', err);
        if (!cancelled) setTeamsStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  /** Same team can exist twice (e.g. imported + created); show each name once, A→Z. */
  const uniqueTeams = useMemo(() => {
    const byName = new Map<string, Team>();
    for (const team of teams) {
      const key = String(team?.name || '').trim().toLowerCase();
      if (key && !byName.has(key)) byName.set(key, team);
    }
    return Array.from(byName.values()).sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })
    );
  }, [teams]);

  const toggleMembership = useCallback((teamId: string) => {
    setMemberships((prev) => (prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]));
  }, []);

  // ---- Dirty tracking -----------------------------------------------------
  const isDirty =
    !fieldsEqual(fields, savedFields) ||
    sortedKey(memberships) !== sortedKey(savedMemberships) ||
    password.length > 0 ||
    kids.pendingLocalChange;

  useEffect(() => {
    if (!isDirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  const passwordError =
    password && password.trim().length < MIN_PASSWORD_LENGTH
      ? `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
      : password && confirmPassword && password !== confirmPassword
        ? 'Passwords do not match.'
        : null;

  const resetChanges = () => {
    setFields(savedFields);
    setMemberships(savedMemberships);
    setPassword('');
    setConfirmPassword('');
    setSaveError(null);
  };

  // ---- Save ---------------------------------------------------------------
  const save = async (): Promise<boolean> => {
    setSaveError(null);
    if (!userId) {
      setSaveError('Your session has expired. Please sign in again.');
      return false;
    }
    if (password) {
      if (password.trim().length < MIN_PASSWORD_LENGTH) {
        setSaveError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
        return false;
      }
      if (password !== confirmPassword) {
        setSaveError('New passwords do not match.');
        return false;
      }
    }

    setIsSaving(true);
    try {
      const headers = await getAuthHeaders(undefined, userId);
      const payload: Record<string, unknown> = {
        id: userId,
        name: fields.fullName.trim(),
        title: fields.jobTitle.trim(),
        birthday: fields.birthday || null,
        email: phoneOnlyAccount ? nav.userEmail : fields.email.trim(),
        phone: fields.phone.trim() || null,
        avatar_url: fields.avatarUrl,
        ministries: memberships,
        children: kids.children,
      };
      if (password) payload.password = password;

      const res = await fetch('/api/vault?resource=users', {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data?.error || 'Could not save your profile.');

      // Sync team joins/leaves in parallel; keep whichever actually succeeded.
      const toJoin = memberships.filter((id) => !savedMemberships.includes(id));
      const toLeave = savedMemberships.filter((id) => !memberships.includes(id));
      const call = (action: 'join' | 'leave', teamId: string) =>
        fetch(`/api/vault?resource=people&subResource=teams&action=${action}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ teamId, memberId: userId }),
        }).then((r) => {
          if (!r.ok) throw new Error(`${action} failed`);
          return { action, teamId };
        });
      const results = await Promise.allSettled([
        ...toJoin.map((id) => call('join', id)),
        ...toLeave.map((id) => call('leave', id)),
      ]);
      const failedJoins = new Set<string>();
      const failedLeaves = new Set<string>();
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') return;
        if (i < toJoin.length) failedJoins.add(toJoin[i]);
        else failedLeaves.add(toLeave[i - toJoin.length]);
      });
      const actualMemberships = [
        ...memberships.filter((id) => !failedJoins.has(id)),
        ...Array.from(failedLeaves),
      ];
      setMemberships(actualMemberships);
      setSavedMemberships(actualMemberships);

      if (data?.user) login(data.user);
      setSavedFields(fields);
      setPassword('');
      setConfirmPassword('');
      kids.markSaved();
      setSavedAt(Date.now());

      const failedCount = failedJoins.size + failedLeaves.size;
      if (failedCount > 0) {
        setSaveError(
          `Profile saved, but ${failedCount} team change${failedCount === 1 ? '' : 's'} didn't go through. Please try again.`
        );
      }
      return true;
    } catch (err) {
      console.error('[Profile] Save failed:', err);
      setSaveError(errorMessage(err, 'Could not save your profile.'));
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  return {
    phoneOnlyAccount,
    fields,
    setField,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    passwordError,
    uniqueTeams,
    teamsStatus,
    memberships,
    toggleMembership,
    isDirty,
    isSaving,
    saveError,
    clearSaveError: () => setSaveError(null),
    savedAt,
    save,
    resetChanges,
  };
}

export type ProfileForm = ReturnType<typeof useProfileForm>;
