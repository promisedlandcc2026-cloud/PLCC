import React, { useEffect, useState } from 'react';
import MyPointsCard from '../../../components/points/MyPointsCard';
import {
  Edit3,
  Calendar,
  Clock,
  Mail,
  Phone,
  Home,
  Users,
  Award,
  Sparkles,
  Shield,
  Heart,
  Send,
  EyeOff,
  CheckCircle2,
  ChevronRight,
  TrendingUp,
  Bookmark,
  QrCode,
  Milestone,
  Plus,
  Search,
  Camera,
  Lock,
  Unlock,
  KeyRound,
  ShieldCheck,
  ShieldAlert,
  Baby,
  Music,
  Radio,
  HeartHandshake,
  Smile,
  type LucideIcon,
} from 'lucide-react';
import { useChurch } from '../context/ChurchContext';
import { MembershipMilestone, VolunteerBadge } from '../types';
import { AvatarDisplay } from './AvatarDisplay';
import { SANCTUARY_BANNER } from '../data/initialData';
import { formatBirthdayLabel, isVaultMemberId, mayHoldOwnContact } from '../lib/memberAge';
import { isUnchangedSampleProfile } from '../lib/realProfiles';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { fetchAuthorized } from '../../../lib/api';
import { useNav } from '../../../lib/NavContext';
import { courtesyName } from '../../../lib/courtesyName';
import { ProfileQrModal } from './ProfileQrModal';
import TextSignInCard from '../../../components/auth/TextSignInCard';
import { AddMilestoneModal } from './AddMilestoneModal';
import { EditMilestoneModal } from './EditMilestoneModal';
import { EditCoverBannerModal } from './EditCoverBannerModal';
import { TimelineMilestoneItem } from './TimelineMilestoneItem';
import { HouseholdRelationshipTree } from './HouseholdRelationshipTree';
import { ParentChildLockModal } from './ParentChildLockModal';

const MINISTRY_BADGES: {
  category: VolunteerBadge['category'];
  label: string;
  icon: LucideIcon;
  iconName: string;
  description: string;
}[] = [
  { category: 'Ushering', label: 'Ushers', icon: Users, iconName: 'Users', description: 'Sanctuary ushering, seating, and guest welcome.' },
  { category: 'Worship', label: 'Choir', icon: Music, iconName: 'Music', description: 'Choir, praise team, and worship ministry.' },
  { category: 'Tech & Media', label: 'Media', icon: Radio, iconName: 'Radio', description: 'Sound, broadcast, and media ministry.' },
  { category: 'Hospitality', label: 'Hospitality', icon: HeartHandshake, iconName: 'HeartHandshake', description: 'Greeters and hospitality ministry.' },
  { category: 'Outreach', label: 'Outreach', icon: Heart, iconName: 'Heart', description: 'Community care and outreach ministry.' },
  { category: 'Children', label: 'Children', icon: Smile, iconName: 'Smile', description: 'Children and youth ministry.' },
];

const VolunteerBadgesSection: React.FC<{
  badges: VolunteerBadge[];
  canToggle: boolean;
  onToggle: (category: VolunteerBadge['category']) => void;
}> = ({ badges, canToggle, onToggle }) => {
  const activeBadges = badges.filter((badge) => badge.active !== false);
  const visibleMinistries = canToggle
    ? MINISTRY_BADGES
    : MINISTRY_BADGES.filter((item) => activeBadges.some((badge) => badge.category === item.category));

  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 border border-stone-200/90 shadow-xs space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-stone-900 flex items-center gap-2">
            <Award className="w-4 h-4 text-[#C9A35A]" />
            Volunteer Badges
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            {canToggle
              ? 'Choose the ministries you serve in.'
              : 'Faithful service and active ministries at Promised Land Christian Center.'}
          </p>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-stone-100 text-stone-700 tabular-nums shrink-0">
          {activeBadges.length} Active
        </span>
      </div>

      {visibleMinistries.length > 0 ? (
        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 gap-3">
          {visibleMinistries.map((ministry) => {
            const isOn = activeBadges.some((badge) => badge.category === ministry.category);
            const Icon = ministry.icon;
            const tile = (
              <>
                <div
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
                    isOn ? 'bg-burgundy text-gold' : 'bg-stone-100 text-stone-400'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0 text-left">
                  <p className={`text-sm font-semibold ${isOn ? 'text-stone-900' : 'text-stone-500'}`}>
                    {ministry.label}
                  </p>
                  <p className="text-[11px] text-stone-500">{isOn ? 'Awarded' : 'Not awarded'}</p>
                </div>
              </>
            );

            if (!canToggle) {
              return (
                <div
                  key={ministry.category}
                  className="flex items-center gap-3 p-3 rounded-xl border border-[#C9A35A]/40 bg-gradient-to-br from-white to-[#f6f1e6]"
                >
                  {tile}
                </div>
              );
            }

            return (
              <button
                key={ministry.category}
                type="button"
                aria-pressed={isOn}
                onClick={() => onToggle(ministry.category)}
                className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                  isOn
                    ? 'border-[#C9A35A]/50 bg-gradient-to-br from-white to-[#f6f1e6]'
                    : 'border-dashed border-stone-300 bg-stone-50 hover:border-burgundy/40'
                }`}
              >
                {tile}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-6 bg-stone-50 rounded-xl text-stone-500 text-xs">
          No active volunteer badges recorded yet.
        </div>
      )}

      {activeBadges.some((badge) => badge.hours > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
          {activeBadges.map((badge) => {
            const ministry = MINISTRY_BADGES.find((item) => item.category === badge.category);
            const Icon = ministry?.icon ?? Award;
            return (
              <div
                key={badge.id}
                className="p-3.5 rounded-xl border border-stone-200/90 bg-gradient-to-br from-white to-stone-50/70 space-y-2"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-[#EEF3EF] text-[#1d372c] flex items-center justify-center">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-stone-900">{badge.name}</h4>
                      <span className="text-[11px] text-stone-500">{ministry?.label || badge.category}</span>
                    </div>
                  </div>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-[#C9A35A]/20 text-amber-900 border border-[#C9A35A]/30">
                    {badge.tier}
                  </span>
                </div>
                <p className="text-xs text-stone-600 line-clamp-2">{badge.description}</p>
                <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-[11px]">
                  <span className="text-stone-500">Service Hours:</span>
                  <span className="font-semibold text-stone-900 tabular-nums">
                    {badge.hours} hrs logged
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

function joinedMonthKey(value: string): string {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}/.test(raw)) return raw.slice(0, 7);
  const parsed = new Date(/\d{4}$/.test(raw) ? raw.replace(/(\d{4})$/, '1, $1') : raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabelFromKey(value: string): string {
  const match = String(value || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return '';
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export const MemberProfileView: React.FC = () => {
  const { userRole } = useNav();
  const {
    selectedMember,
    currentUser,
    households,
    members,
    setIsEditProfileOpen,
    setIsCropAvatarOpen,
    navigateToMemberProfile,
    toggleMemberOnlineStatus,
    openDirectoryModal,
    toggleChildLock,
    isParentOrGuardianOf,
    isChildProfileLockedForViewer,
    updateMemberProfile,
    persistLinkedIdentity,
    rosterProfileNote,
    rosterProfileLoading,
    selfProfileState,
  } = useChurch();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedMemberId = String(searchParams.get('member') || '').trim();

  const [statusText, setStatusText] = useState('');
  const [bioDraft, setBioDraft] = useState('');
  const [bioSaving, setBioSaving] = useState(false);
  const [bioNote, setBioNote] = useState('');
  const [huddleChoices, setHuddleChoices] = useState<{ id: string; name: string }[]>([]);
  const [huddleDraft, setHuddleDraft] = useState('');
  const [huddleSaving, setHuddleSaving] = useState(false);
  const [huddleNote, setHuddleNote] = useState('');
  const [liveHuddleIds, setLiveHuddleIds] = useState<Record<string, boolean>>({});
  const [joinMonth, setJoinMonth] = useState('');
  const [joinEditing, setJoinEditing] = useState(false);
  const [joinSaving, setJoinSaving] = useState(false);
  const [joinNote, setJoinNote] = useState('');
  const [statusPosting, setStatusPosting] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [amenBusyId, setAmenBusyId] = useState('');
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityNote, setActivityNote] = useState('');
  const [profileUpdates, setProfileUpdates] = useState<
    { id: string; content: string; createdAt: string; amenCount: number; hasAmened: boolean }[]
  >([]);
  const [checkIns, setCheckIns] = useState<{
    totalServicesThisYear: number;
    streakWeeks: number;
    lastCheckedIn: string | null;
    serviceTitle: string | null;
    serviceType: string | null;
    recent: { checkedInAt: string; title: string; type: string }[];
  }>({
    totalServicesThisYear: 0,
    streakWeeks: 0,
    lastCheckedIn: null,
    serviceTitle: null,
    serviceType: null,
    recent: [],
  });
  const [checkInsVisible, setCheckInsVisible] = useState(true);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [presencePeople, setPresencePeople] = useState<
    { id: string; displayName: string; avatarUrl: string | null; online: boolean; inTouch: boolean }[]
  >([]);
  const [touchState, setTouchState] = useState<'none' | 'outgoing' | 'incoming' | 'accepted'>('none');
  const [touchMessageUserId, setTouchMessageUserId] = useState<string | null>(null);
  const [touchReady, setTouchReady] = useState(true);
  const [touchBusy, setTouchBusy] = useState(false);
  const [touchNote, setTouchNote] = useState('');
  const [touchIncoming, setTouchIncoming] = useState<{ memberId: string; displayName: string; avatarUrl: string | null }[]>([]);
  const [touchAccepted, setTouchAccepted] = useState<{ memberId: string; displayName: string; avatarUrl: string | null }[]>([]);
  const [touchOutgoing, setTouchOutgoing] = useState<{ memberId: string; displayName: string; avatarUrl: string | null }[]>([]);
  const [presenceScope, setPresenceScope] = useState<'online' | 'everyone'>('online');
  const [presenceReady, setPresenceReady] = useState(true);
  const [isAddMilestoneOpen, setIsAddMilestoneOpen] = useState(false);
  const [isEditCoverOpen, setIsEditCoverOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<MembershipMilestone | null>(null);

  // Child Profile & Parental Lock state
  const [isChildLockModalOpen, setIsChildLockModalOpen] = useState(false);
  const [childLockModalMode, setChildLockModalMode] = useState<'settings' | 'pin_unlock'>('settings');

  const isChild = selectedMember.householdRole === 'Child' || Boolean(selectedMember.childLock);
  const spokenName = courtesyName({
    fullName: selectedMember.fullName,
    preferredName: selectedMember.preferredName,
    addressAs: selectedMember.addressAs,
    age: selectedMember.age,
    birthday: selectedMember.dateOfBirth,
    householdRole: selectedMember.householdRole,
  });
  const isLockedForViewer = isChildProfileLockedForViewer(selectedMember);
  const isGuardianOfThisMember = isParentOrGuardianOf(currentUser.id, selectedMember.id);

  const isSelf = currentUser.id === selectedMember.id;
  const ownProfile = isSelf && (!requestedMemberId || requestedMemberId === currentUser.id);

  useEffect(() => {
    setBioDraft(String(selectedMember.bio || ''));
    setBioNote('');
  }, [selectedMember.id, selectedMember.bio]);

  useEffect(() => {
    setJoinMonth(joinedMonthKey(selectedMember.joinDate));
    setJoinNote('');
  }, [selectedMember.id, selectedMember.joinDate]);

  useEffect(() => {
    setHuddleDraft('');
    setHuddleNote('');
  }, [selectedMember.id]);

  const savedHuddles = (selectedMember.favoriteHuddles?.length
    ? selectedMember.favoriteHuddles
    : selectedMember.favoriteHuddle?.id
      ? [selectedMember.favoriteHuddle]
      : []
  ).filter((huddle) => huddle.id && huddle.name);
  const savedHuddleKey = savedHuddles.map((huddle) => huddle.id).join(',');

  useEffect(() => {
    if (!savedHuddleKey) {
      setLiveHuddleIds({});
      return;
    }
    let cancelled = false;
    const loadLive = async () => {
      try {
        const res = await fetchAuthorized(
          `/api/vault?resource=community&subResource=chat&subResource=voice-huddle-statuses&channelIds=${encodeURIComponent(savedHuddleKey)}`
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled || !res.ok || !data?.byChannel) return;
        const next: Record<string, boolean> = {};
        for (const [id, status] of Object.entries(data.byChannel as Record<string, { active?: boolean; participantCount?: number }>)) {
          next[id] = Boolean(status?.active) && Number(status?.participantCount || 0) > 0;
        }
        setLiveHuddleIds(next);
      } catch {
        if (!cancelled) setLiveHuddleIds({});
      }
    };
    void loadLive();
    const timer = window.setInterval(loadLive, 20000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [savedHuddleKey]);

  useEffect(() => {
    if (!ownProfile) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchAuthorized('/api/vault?resource=community&subResource=chat&subResource=channels');
        const data = await res.json().catch(() => []);
        if (cancelled || !res.ok || !Array.isArray(data)) return;
        const choices = data
          .map((channel: { id?: string; name?: string }) => ({
            id: String(channel?.id || '').trim(),
            name: String(channel?.name || '').trim(),
          }))
          .filter((channel) => channel.id && channel.name);
        setHuddleChoices(choices);
      } catch {
        if (!cancelled) setHuddleChoices([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ownProfile]);

  useEffect(() => {
    if (!ownProfile) setIsQrModalOpen(false);
  }, [ownProfile]);

  useEffect(() => {
    let cancelled = false;
    const loadPresence = async () => {
      try {
        const res = await fetchAuthorized('/api/vault?resource=people&subResource=member-presence');
        const data = await res.json().catch(() => ({}));
        if (cancelled || !res.ok || !data?.ok) return;
        const people = Array.isArray(data.members)
          ? data.members
              .map((person: { id?: string; displayName?: string; avatarUrl?: string | null; online?: boolean; inTouch?: boolean }) => ({
                id: String(person?.id || '').trim(),
                displayName: String(person?.displayName || '').trim() || 'Member',
                avatarUrl: String(person?.avatarUrl || '').trim() || null,
                online: person?.online === true,
                inTouch: person?.inTouch === true,
              }))
              .filter((person: { id: string }) => person.id)
          : [];
        setPresencePeople(people);
        setPresenceScope(data.scope === 'everyone' ? 'everyone' : 'online');
        setPresenceReady(data.ready !== false);
      } catch {
        if (!cancelled) setPresencePeople([]);
      }
    };
    void loadPresence();
    const timer = window.setInterval(loadPresence, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const isSuperAdmin = String(userRole || '').toUpperCase() === 'SUPER_ADMIN';
  const canChooseBadges = ownProfile || isSuperAdmin;
  const canEdit = ownProfile || isSuperAdmin;
  const otherAdult =
    !ownProfile &&
    isVaultMemberId(selectedMember.id) &&
    selectedMember.householdRole !== 'Child' &&
    selectedMember.householdRole !== 'Youth' &&
    !(typeof selectedMember.age === 'number' && selectedMember.age < 18);

  const refreshTouchList = async () => {
    const res = await fetchAuthorized('/api/vault?resource=people&subResource=keep-in-touch');
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok || data.ready === false) {
      setTouchIncoming([]);
      setTouchAccepted([]);
      setTouchOutgoing([]);
      return;
    }
    const people = (rows: unknown) =>
      Array.isArray(rows)
        ? rows
            .map((person: { memberId?: string; displayName?: string; avatarUrl?: string | null }) => ({
              memberId: String(person?.memberId || '').trim(),
              displayName: String(person?.displayName || '').trim() || 'Member',
              avatarUrl: String(person?.avatarUrl || '').trim() || null,
            }))
            .filter((person) => person.memberId)
        : [];
    setTouchIncoming(people(data.incoming));
    setTouchAccepted(people(data.accepted));
    setTouchOutgoing(people(data.outgoing));
  };

  useEffect(() => {
    if (!otherAdult) {
      setTouchState('none');
      setTouchMessageUserId(null);
      setTouchNote('');
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchAuthorized(
          `/api/vault?resource=people&subResource=keep-in-touch&memberId=${encodeURIComponent(selectedMember.id)}`
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled || !res.ok || !data?.ok) return;
        setTouchReady(data.ready !== false);
        const state = String(data.state || 'none');
        setTouchState(state === 'outgoing' || state === 'incoming' || state === 'accepted' ? state : 'none');
        setTouchMessageUserId(String(data.messageUserId || '').trim() || null);
      } catch {
        if (!cancelled) setTouchState('none');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [otherAdult, selectedMember.id]);

  useEffect(() => {
    if (!ownProfile) return;
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await refreshTouchList();
    })();
    return () => {
      cancelled = true;
    };
  }, [ownProfile, selectedMember.id]);

  const sendTouch = async (action: 'request' | 'accept' | 'decline' | 'remove', memberId: string) => {
    setTouchBusy(true);
    setTouchNote('');
    try {
      const res = await fetchAuthorized('/api/vault?resource=people&subResource=keep-in-touch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, memberId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setTouchNote(String(data?.error || 'Could not update keep in touch.'));
        return;
      }
      if (memberId === selectedMember.id) {
        const state = String(data.state || 'none');
        setTouchState(state === 'outgoing' || state === 'incoming' || state === 'accepted' ? state : 'none');
        setTouchMessageUserId(String(data.messageUserId || '').trim() || null);
      }
      if (ownProfile) await refreshTouchList();
    } catch {
      setTouchNote('Could not update keep in touch.');
    } finally {
      setTouchBusy(false);
    }
  };

  const household = households.find((h) => h.id === selectedMember.householdId);
  const householdMemberIds = Array.isArray(household?.memberIds) ? household.memberIds : [];
  const familyMembers = household
    ? members.filter((m) => householdMemberIds.includes(m.id) && m.id !== selectedMember.id)
    : [];

  const loadProfileActivity = async (memberId: string) => {
    const res = await fetchAuthorized(
      `/api/vault?resource=people&subResource=member-activity&memberId=${encodeURIComponent(memberId)}`
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || 'Could not load this profile activity.');
    }
    return data;
  };

  const activityMemberId = ownProfile ? 'me' : selectedMember.id;

  useEffect(() => {
    if (isLockedForViewer || (!ownProfile && !isVaultMemberId(selectedMember.id))) {
      setProfileUpdates([]);
      setCheckIns({
        totalServicesThisYear: 0,
        streakWeeks: 0,
        lastCheckedIn: null,
        serviceTitle: null,
        serviceType: null,
        recent: [],
      });
      setCheckInsVisible(true);
      setActivityNote('');
      setActivityLoading(false);
      return;
    }
    let cancelled = false;
    setActivityLoading(true);
    setActivityNote('');
    void loadProfileActivity(activityMemberId)
      .then((data) => {
        if (cancelled) return;
        setProfileUpdates(Array.isArray(data.updates) ? data.updates : []);
        setCheckIns(data.attendance || {
          totalServicesThisYear: 0,
          streakWeeks: 0,
          lastCheckedIn: null,
          serviceTitle: null,
          serviceType: null,
          recent: [],
        });
        setCheckInsVisible(data.checkInsVisible !== false);
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setProfileUpdates([]);
        setActivityNote(error.message || 'Could not load this profile activity.');
      })
      .finally(() => {
        if (!cancelled) setActivityLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activityMemberId, isLockedForViewer, ownProfile, selectedMember.id]);

  const handlePostStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = statusText.trim();
    if (!content || !ownProfile) return;
    setStatusPosting(true);
    setStatusError('');
    try {
      const res = await fetchAuthorized('/api/vault?resource=community&subResource=feed&subResource=posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'praise', content }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Could not post that update.');
      setStatusText('');
      const activity = await loadProfileActivity(ownProfile ? 'me' : selectedMember.id);
      setProfileUpdates(Array.isArray(activity.updates) ? activity.updates : []);
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : 'Could not post that update.');
    } finally {
      setStatusPosting(false);
    }
  };

  const handleAmen = async (updateId: string) => {
    if (!updateId || amenBusyId) return;
    setAmenBusyId(updateId);
    setStatusError('');
    try {
      const res = await fetchAuthorized('/api/vault?resource=community&subResource=feed&subResource=reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType: 'post', targetId: updateId, reaction: 'praise' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Could not save Amen.');
      const praise = (data.reactions || []).find((item: { key?: string }) => item.key === 'praise');
      setProfileUpdates((prev) =>
        prev.map((update) =>
          update.id === updateId
            ? {
                ...update,
                amenCount: Number(praise?.count || 0),
                hasAmened: Boolean(praise?.reactedByMe),
              }
            : update
        )
      );
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : 'Could not save Amen.');
    } finally {
      setAmenBusyId('');
    }
  };

  const formatWhen = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const roleStyles = {
    SUPER_ADMIN: {
      label: 'Super Admin / Overseer',
      bg: 'bg-burgundy',
      text: 'text-gold-light',
      border: 'border-gold/40',
    },
    PASTOR: {
      label: 'Pastoral Staff',
      bg: 'bg-burgundy-dark',
      text: 'text-gold-light',
      border: 'border-gold/40',
    },
    LEADER: {
      label: 'Ministry Leader',
      bg: 'bg-amber-100',
      text: 'text-amber-900',
      border: 'border-amber-300',
    },
    VOLUNTEER: {
      label: 'Active Volunteer',
      bg: 'bg-emerald-50',
      text: 'text-emerald-800',
      border: 'border-emerald-200',
    },
    MEMBER: {
      label: 'Church Member',
      bg: 'bg-stone-100',
      text: 'text-stone-700',
      border: 'border-stone-200',
    },
  };

  const currentRoleStyle = roleStyles[selectedMember.role] || roleStyles.MEMBER;
  const savedFamily = members.filter((member) => !isUnchangedSampleProfile(member));
  const waitingForRosterMember =
    rosterProfileLoading &&
    isVaultMemberId(requestedMemberId) &&
    selectedMember.id !== requestedMemberId;

  if (selfProfileState === 'loading') {
    return (
      <div className="bg-white rounded-2xl border border-stone-200 p-8 text-sm text-stone-600">
        Loading your profile.
      </div>
    );
  }

  if (selfProfileState === 'unlinked') {
    return (
      <div className="bg-white rounded-2xl border border-stone-200 p-8 space-y-2">
        <h2 className="text-base font-bold text-stone-900">Your login is not linked to a church record yet.</h2>
        <p className="text-sm text-stone-600">
          Ask the church office to connect your account. Then open My Profile again.
        </p>
      </div>
    );
  }

  if (waitingForRosterMember) {
    return (
      <div className="bg-white rounded-2xl border border-stone-200 p-8 text-sm text-stone-600">
        Loading this member…
      </div>
    );
  }

  if (rosterProfileNote && isVaultMemberId(requestedMemberId) && selectedMember.id !== requestedMemberId) {
    return (
      <div className="bg-white rounded-2xl border border-stone-200 p-8 text-sm text-[#1d372c]">
        {rosterProfileNote}
      </div>
    );
  }

  if (isLockedForViewer) {
    return (
      <div className="bg-white rounded-2xl border border-amber-300 p-8 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-600 text-white flex items-center justify-center shrink-0">
            <Lock className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black text-stone-900">{selectedMember.fullName}</h2>
            <p className="text-sm text-amber-950 mt-1">
              This child profile is locked. Birthday, home address, and the rest of the record stay hidden.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setChildLockModalMode('pin_unlock');
            setIsChildLockModalOpen(true);
          }}
          className="px-4 py-2.5 bg-[#1d372c] hover:bg-[#12231c] text-white text-xs font-semibold rounded-xl inline-flex items-center gap-2"
        >
          <KeyRound className="w-4 h-4" />
          Guardian Unlock (PIN)
        </button>
        {selectedMember.id !== currentUser.id && (
          <button
            type="button"
            onClick={() => navigateToMemberProfile(currentUser.id)}
            className="px-4 py-2.5 text-xs font-semibold text-[#1d372c] bg-[#EEF3EF] hover:bg-[#f8e6eb] rounded-xl"
          >
            Back to my profile
          </button>
        )}
        <ParentChildLockModal
          isOpen={isChildLockModalOpen}
          onClose={() => setIsChildLockModalOpen(false)}
          childMember={selectedMember}
          mode={childLockModalMode}
        />
      </div>
    );
  }

  return (
    <div className="cp-profile space-y-6 animate-in fade-in duration-200">
      <p className="text-xs text-stone-500">
        Your phone, email, and birthday stay hidden until you allow them. Use Directory to find someone else.
      </p>
      {/* Profile Header Card */}
      <div className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm overflow-hidden">
        {/* Cover Banner */}
        <div className="relative h-48 md:h-60 w-full overflow-hidden bg-stone-900 group">
          <img
            src={selectedMember.coverUrl || SANCTUARY_BANNER}
            alt="Promised Land Christian Center Sanctuary"
            className="w-full h-full object-cover opacity-85 transition-transform duration-700 group-hover:scale-102"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
          
          {/* Top Left: Change Cover Action Button */}
          {canEdit && (
            <button
              onClick={() => setIsEditCoverOpen(true)}
              className="absolute top-4 left-4 bg-black/50 hover:bg-black/75 backdrop-blur-md px-3 py-1.5 rounded-lg text-xs font-semibold text-white border border-white/20 transition-all flex items-center gap-1.5 shadow-md hover:scale-105"
              title="Change cover banner image"
            >
              <Camera className="w-3.5 h-3.5 text-[#C9A35A]" />
              <span>Change Cover</span>
            </button>
          )}

          <div className="absolute top-14 left-4 sm:left-auto sm:top-4 sm:right-4 bg-black/40 backdrop-blur-md px-3 py-1 rounded-full text-xs text-[#E8D8B2] border border-[#C9A35A]/30">
            PLCC Vault &middot; Promised Land Christian Center
          </div>
          <div className="absolute bottom-4 right-6 hidden md:block text-right text-white/90 text-xs">
            <span className="italic font-sans tracking-wide">&ldquo;Changing Hearts. Transforming Lives.&rdquo;</span>
          </div>
        </div>

        {/* Profile Identity Bar */}
        <div className="px-4 sm:px-6 md:px-8 pb-6 pt-0 relative flex flex-col sm:block">
          {/* Top Row: Floating Avatar over Cover Banner & Header Action Buttons.
              On phones this row dissolves (display: contents) so the name can sit
              between the avatar and the buttons. */}
          <div className="contents sm:flex sm:flex-row sm:items-end sm:justify-between sm:gap-4 sm:-mt-20 md:-mt-22">
            {/* Avatar */}
            <div className="relative group self-center sm:self-auto order-1 -mt-16 sm:mt-0">
              {isChild && isLockedForViewer && selectedMember.childLock?.hidePhotos ? (
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-amber-100 border-4 border-white shadow-xl flex items-center justify-center text-amber-800">
                  <Shield className="w-12 h-12 text-amber-700" />
                </div>
              ) : (
                <AvatarDisplay
                  name={selectedMember.fullName}
                  avatarUrl={selectedMember.avatarUrl}
                  size="3xl"
                  showOnlineStatus
                  isOnline={selectedMember.isOnline}
                  className="ring-4 ring-white shadow-xl rounded-full bg-white"
                />
              )}
              {canEdit && (
                <button
                  onClick={() => setIsCropAvatarOpen(true)}
                  className="absolute bottom-2 right-2 p-2 rounded-full bg-[#1d372c] text-white hover:bg-[#12231c] shadow-md border-2 border-white transition-transform hover:scale-105"
                  title="Change or crop profile photo"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Action Buttons: Seated on the clean white surface */}
            <div className="order-3 mt-4 sm:mt-0 flex flex-wrap items-center justify-center sm:justify-end gap-2.5 pb-1">
              {/* Child Profile Lock Controls (if viewer is Guardian or Admin) */}
              {isChild && (isGuardianOfThisMember || isSuperAdmin) && (
                <button
                  onClick={() => {
                    setChildLockModalMode('settings');
                    setIsChildLockModalOpen(true);
                  }}
                  className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1.5 shadow-2xs ${
                    selectedMember.childLock?.isLocked
                      ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                      : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                  }`}
                  title="Manage Parental Lock and Child Privacy Rules based on age"
                >
                  {selectedMember.childLock?.isLocked ? (
                    <Lock className="w-3.5 h-3.5 text-amber-700" />
                  ) : (
                    <Unlock className="w-3.5 h-3.5 text-stone-400" />
                  )}
                  <span>{selectedMember.childLock?.isLocked ? 'Parent Locked' : 'Parent Lock'}</span>
                </button>
              )}

              {/* Kids View — a guardian jumps from the child's profile to their dashboard */}
              {isChild && isGuardianOfThisMember && isVaultMemberId(selectedMember.id) && (
                <button
                  type="button"
                  onClick={() => navigate(`/family/kids/${selectedMember.id}`)}
                  className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-[#1d372c]/20 bg-[#EEF3EF] text-[#1d372c] hover:bg-[#f7e6ea] transition-colors flex items-center gap-1.5 shadow-2xs"
                  title="Open this child's Kids View dashboard"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Kids View</span>
                </button>
              )}

              {/* Online/Offline Status Presence Toggle */}
              {canEdit && (
              <button
                onClick={() => toggleMemberOnlineStatus(selectedMember.id)}
                className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-2 shadow-2xs ${
                  selectedMember.isOnline
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                    : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                }`}
                title={`Click to set ${selectedMember.preferredName || selectedMember.fullName} ${selectedMember.isOnline ? 'Offline' : 'Online'}`}
              >
                <span className="relative flex h-2.5 w-2.5">
                  {selectedMember.isOnline && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  )}
                  <span
                    className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                      selectedMember.isOnline ? 'bg-emerald-500' : 'bg-stone-400'
                    }`}
                  />
                </span>
                <span>{selectedMember.isOnline ? 'Online' : 'Offline'}</span>
              </button>
              )}

              {ownProfile && (
                <button
                  onClick={() => setIsQrModalOpen(true)}
                  className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 transition-colors flex items-center gap-1.5 shadow-2xs"
                  title="View unique member QR code for quick scanning"
                >
                  <QrCode className="w-3.5 h-3.5 text-[#1d372c]" />
                  <span>Member QR</span>
                </button>
              )}

              <button
                onClick={openDirectoryModal}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 transition-colors flex items-center gap-1.5 shadow-2xs"
                title="Open Church Member Directory with search & filters"
              >
                <Users className="w-3.5 h-3.5 text-[#1d372c]" />
                <span>Directory</span>
              </button>

              {otherAdult && touchReady && touchState === 'incoming' && (
                <>
                  <button
                    type="button"
                    disabled={touchBusy}
                    onClick={() => void sendTouch('accept', selectedMember.id)}
                    className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 disabled:opacity-40"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    disabled={touchBusy}
                    onClick={() => void sendTouch('decline', selectedMember.id)}
                    className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 disabled:opacity-40"
                  >
                    Not now
                  </button>
                </>
              )}
              {otherAdult && touchReady && touchState === 'none' && (
                <button
                  type="button"
                  disabled={touchBusy}
                  onClick={() => void sendTouch('request', selectedMember.id)}
                  className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-[#1d372c]/20 bg-[#EEF3EF] text-[#1d372c] hover:bg-[#EEF3EF]/80 disabled:opacity-40"
                >
                  Keep in touch
                </button>
              )}
              {otherAdult && touchReady && touchState === 'outgoing' && (
                <span className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-stone-200 bg-stone-50 text-stone-500">
                  Request sent
                </span>
              )}
              {otherAdult && touchReady && touchState === 'accepted' && (
                <button
                  type="button"
                  disabled={touchBusy}
                  onClick={() => void sendTouch('remove', selectedMember.id)}
                  className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50 disabled:opacity-40"
                  title="This stays private. Click to end it."
                >
                  In touch
                </button>
              )}

              {!isSelf && !isChild && (
                <button
                  type="button"
                  onClick={() => {
                    if (touchState === 'accepted' && touchMessageUserId) {
                      navigate(
                        `/community/chat/dm?partnerId=${encodeURIComponent(touchMessageUserId)}&name=${encodeURIComponent(spokenName)}`
                      );
                      return;
                    }
                    navigate('/community/chat');
                  }}
                  className="px-4 py-2 text-xs font-black uppercase tracking-widest text-white bg-burgundy hover:bg-burgundy-dark rounded-2xl shadow-lg shadow-burgundy/20 transition-colors"
                  title={touchState === 'accepted' ? 'Open your private conversation' : 'Open Community messages'}
                >
                  Message
                </button>
              )}
              {touchNote && otherAdult && (
                <p className="w-full text-[11px] text-[#1d372c] text-right">{touchNote}</p>
              )}

              {isSelf ? (
                <button
                  onClick={() => setIsEditProfileOpen(true)}
                  className="px-4 py-2 text-xs font-black uppercase tracking-widest text-white bg-burgundy hover:bg-burgundy-dark rounded-2xl shadow-lg shadow-burgundy/20 transition-colors flex items-center gap-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Edit My Profile
                </button>
              ) : (
                <>
                  {isSuperAdmin && (
                    <button
                      onClick={() => setIsEditProfileOpen(true)}
                      className="px-3 py-2 text-xs font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors flex items-center gap-1"
                      title="Super Admin Edit"
                    >
                      <Edit3 className="w-3 h-3 text-stone-500" />
                      Admin Edit
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Member Name, Role Badge, Title & Summary Block */}
          <div className="order-2 space-y-1.5 pt-3 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-black text-ink tracking-tight leading-tight">
                {spokenName}
              </h1>
              {/* Role Badge */}
              <span
                className={`inline-flex items-center gap-1 px-3 py-0.5 rounded-full text-xs font-semibold border ${currentRoleStyle.bg} ${currentRoleStyle.text} ${currentRoleStyle.border} shadow-2xs`}
              >
                <Shield className="w-3.5 h-3.5" />
                {currentRoleStyle.label}
              </span>

              {/* Child Age & Relationship Badge */}
              {selectedMember.age !== undefined && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-900 border border-amber-300 shadow-2xs">
                  {selectedMember.householdRole === 'Child' ? '🧒' : '🎒'} Age {selectedMember.age}
                </span>
              )}

              {/* Child Lock Status Badge */}
              {isChild && (
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border shadow-2xs ${
                    selectedMember.childLock?.isLocked
                      ? 'bg-amber-100/80 text-amber-900 border-amber-300'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  }`}
                >
                  {selectedMember.childLock?.isLocked ? (
                    <>
                      <Lock className="w-3 h-3 text-amber-700" />
                      Age Protected
                    </>
                  ) : (
                    <>
                      <Unlock className="w-3 h-3 text-emerald-600" />
                      Public Child
                    </>
                  )}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 text-sm text-stone-500">
              <span className="font-semibold text-stone-800">@{selectedMember.username}</span>
              {selectedMember.relationshipTitle && (
                <>
                  <span aria-hidden="true" className="text-stone-300">&middot;</span>
                  <span className="text-[#1d372c] font-semibold">{selectedMember.relationshipTitle}</span>
                </>
              )}
              {selectedMember.title && (
                <>
                  <span aria-hidden="true" className="text-stone-300">&middot;</span>
                  <span className="text-stone-600">{selectedMember.title}</span>
                </>
              )}
            </div>

            {/* Short Summary One-Liner */}
            {selectedMember.summary && (
              <p className="text-sm text-stone-600 max-w-2xl italic pt-0.5 leading-relaxed">
                &ldquo;{String(selectedMember.summary || '').replace(/^["“']+|["”']+$/g, '')}&rdquo;
              </p>
            )}
          </div>

          {/* Quick Info Bar */}
          <div className="order-4 mt-6 pt-5 border-t border-stone-100 grid grid-cols-2 grid-flow-dense md:grid-cols-3 xl:grid-cols-5 gap-4 text-xs text-stone-600">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 shrink-0 text-[#C9A35A]" />
              <div>
                <p className="text-[11px] text-stone-400">Birthday</p>
                <p className="font-medium text-stone-800">
                  {formatBirthdayLabel(selectedMember.dateOfBirth) ||
                    (selectedMember.age !== undefined
                      ? `Age ${selectedMember.age}`
                      : selectedMember.id === currentUser.id
                        ? 'Not set'
                        : 'Private')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 shrink-0 text-[#C9A35A]" />
              <div>
                <p className="text-[11px] text-stone-400">Member Since</p>
                <p className="font-medium text-stone-800 flex items-center gap-1.5">
                  {selectedMember.joinDate || 'Not set'}
                  {ownProfile && !joinEditing ? (
                    <button
                      type="button"
                      onClick={() => {
                        setJoinNote('');
                        setJoinEditing(true);
                      }}
                      className="inline-flex items-center justify-center w-7 h-7 -my-1 rounded-md text-[#1d372c] hover:bg-[#EEF3EF]"
                      aria-label="Change member since date"
                      title="Change member since date"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  ) : null}
                </p>
                {ownProfile && joinNote && !joinEditing ? (
                  <span className="text-[10px] text-stone-400">{joinNote}</span>
                ) : null}
                {ownProfile && joinEditing ? (
                  <form
                    className="mt-1 flex flex-wrap items-center gap-1.5"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const label = monthLabelFromKey(joinMonth);
                      if (!label) return;
                      setJoinSaving(true);
                      setJoinNote('');
                      updateMemberProfile(selectedMember.id, { joinDate: label });
                      void persistLinkedIdentity({ joinDate: joinMonth })
                        .then(() => {
                          setJoinNote('Saved.');
                          setJoinEditing(false);
                        })
                        .catch(() => setJoinNote('Could not save that date.'))
                        .finally(() => setJoinSaving(false));
                    }}
                  >
                    <input
                      type="month"
                      aria-label="Member since"
                      value={joinMonth}
                      onChange={(event) => setJoinMonth(event.target.value)}
                      className="h-7 px-1.5 text-[11px] rounded-md border border-stone-200 bg-stone-50"
                    />
                    <button
                      type="submit"
                      disabled={joinSaving || !joinMonth}
                      className="h-7 px-2 text-[11px] font-semibold text-white bg-[#1d372c] rounded-md disabled:opacity-40"
                    >
                      {joinSaving ? '...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setJoinEditing(false)}
                      className="h-7 px-2 text-[11px] font-semibold text-stone-600 bg-stone-100 rounded-md"
                    >
                      Cancel
                    </button>
                    {joinNote ? <span className="text-[10px] text-stone-400">{joinNote}</span> : null}
                  </form>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Clock className={`w-4 h-4 shrink-0 ${selectedMember.isOnline ? 'text-emerald-600' : 'text-[#C9A35A]'}`} />
              <div>
                <p className="text-[11px] text-stone-400">
                  {selectedMember.isOnline ? 'Fellowship Status' : 'Last Active'}
                </p>
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    {selectedMember.isOnline && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    )}
                    <span
                      className={`relative inline-flex rounded-full h-2 w-2 ${
                        selectedMember.isOnline ? 'bg-emerald-500' : 'bg-stone-400'
                      }`}
                    />
                  </span>
                  <p className={`font-semibold text-xs ${selectedMember.isOnline ? 'text-emerald-700' : 'text-stone-800'}`}>
                    {selectedMember.isOnline ? 'Active Now' : selectedMember.lastActive}
                  </p>
                </div>
              </div>
            </div>

            {mayHoldOwnContact(selectedMember) ? (
              <>
                <div className="col-span-2 md:col-span-1 flex items-center gap-2">
                  <Mail className="w-4 h-4 shrink-0 text-[#C9A35A]" />
                  <div className="min-w-0">
                    <p className="text-[11px] text-stone-400">Email</p>
                    {selectedMember.privacy.showEmail || canEdit ? (
                      <p className="font-medium text-stone-800 break-all">{selectedMember.email || 'Not set'}</p>
                    ) : (
                      <p className="text-stone-400 italic flex items-center gap-1">
                        <EyeOff className="w-3 h-3" /> Private
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 shrink-0 text-[#C9A35A]" />
                  <div>
                    <p className="text-[11px] text-stone-400">Phone</p>
                    {selectedMember.privacy.showPhone || canEdit ? (
                      <p className="font-medium text-stone-800">{selectedMember.phone || 'Not set'}</p>
                    ) : (
                      <p className="text-stone-400 italic flex items-center gap-1">
                        <EyeOff className="w-3 h-3" /> Private
                      </p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="col-span-2 flex items-center gap-2">
                <Phone className="w-4 h-4 shrink-0 text-[#C9A35A]" />
                <div>
                  <p className="text-[11px] text-stone-400">Contact</p>
                  <p className="font-medium text-stone-800">A parent or guardian is the contact.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Child Profile Safety & Guardian Notices */}
      {isChild && isLockedForViewer && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base text-amber-950">
                  Protected Child Profile {selectedMember.age !== undefined && `(Age ${selectedMember.age})`}
                </h3>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-amber-200 text-amber-900 border border-amber-300">
                  Guarded by Parent
                </span>
              </div>
              <p className="text-xs text-amber-900/85 mt-1 leading-relaxed max-w-2xl">
                {selectedMember.childLock?.note ||
                  `This profile is locked by ${selectedMember.childLock?.lockedByParentName || 'parent/guardian'} based on age safeguarding rules. Direct contact details and full activity logs are shielded from non-family viewers.`}
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              setChildLockModalMode('pin_unlock');
              setIsChildLockModalOpen(true);
            }}
            className="px-4 py-2.5 bg-[#1d372c] hover:bg-[#12231c] text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 shrink-0 self-start sm:self-auto"
          >
            <KeyRound className="w-4 h-4 text-[#C9A35A]" />
            Guardian Unlock (PIN)
          </button>
        </div>
      )}

      {/* Guardian Management Banner when viewer is verified guardian */}
      {isChild && isGuardianOfThisMember && !isLockedForViewer && (
        <div className="bg-[#EEF3EF] border border-[#C9A35A]/40 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1d372c] text-[#E8D8B2] flex items-center justify-center shrink-0 shadow-2xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-stone-900">
                  Guardian Managed Child Profile
                </h4>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                    selectedMember.childLock?.isLocked
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  }`}
                >
                  {selectedMember.childLock?.isLocked ? 'Age Locked for Public' : 'Public in Directory'}
                </span>
              </div>
              <p className="text-[11px] text-stone-600 mt-0.5">
                You are viewing as parent/guardian. You can adjust age-based privacy, directory visibility, and passcodes.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => toggleChildLock(selectedMember.id, !selectedMember.childLock?.isLocked)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 border ${
                selectedMember.childLock?.isLocked
                  ? 'bg-white hover:bg-stone-50 text-stone-700 border-stone-200'
                  : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300'
              }`}
            >
              {selectedMember.childLock?.isLocked ? (
                <Unlock className="w-3.5 h-3.5 text-stone-500" />
              ) : (
                <Lock className="w-3.5 h-3.5 text-amber-700" />
              )}
              {selectedMember.childLock?.isLocked ? 'Make Public' : 'Lock Profile'}
            </button>

            <button
              onClick={() => {
                setChildLockModalMode('settings');
                setIsChildLockModalOpen(true);
              }}
              className="px-3.5 py-2 bg-[#1d372c] hover:bg-[#12231c] text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <Shield className="w-3.5 h-3.5" />
              Parent Controls
            </button>
          </div>
        </div>
      )}

      {/* Jump-to-section bar (sticky) — long page, quick reach on phones */}
      <nav
        aria-label="Profile sections"
        className="sticky top-0 z-20 -mx-4 sm:mx-0 px-4 sm:px-2 py-2 bg-[#fcfcfc]/90 backdrop-blur-md sm:rounded-2xl sm:border sm:border-stone-200/80"
      >
        <ul className="flex gap-2 overflow-x-auto no-scrollbar">
          {[
            ['cp-about', 'About'],
            ['cp-huddles', 'Huddles'],
            ['cp-journey', 'Journey'],
            ['cp-badges', 'Badges'],
            ['cp-updates', 'Updates'],
            ['cp-household', 'Household'],
            ...(ownProfile ? [['cp-points', 'Points']] : []),
            ['cp-checkins', 'Check-ins'],
            ['cp-family', 'Family'],
          ].map(([id, label]) => (
            <li key={id} className="shrink-0">
              <a
                href={`#${id}`}
                onClick={(event) => {
                  event.preventDefault();
                  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="inline-flex items-center min-h-[36px] px-3.5 rounded-full text-xs font-semibold text-stone-700 bg-white border border-stone-200 hover:border-[#1d372c]/40 hover:text-[#1d372c] transition-colors"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* Main Content Grid: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(340px,400px)] xl:grid-cols-[minmax(0,1fr)_420px] gap-6">
        {/* Left Column (2 spans): Bio, Status Updates & Volunteer Badges */}
        <div className="min-w-0 space-y-6">
          {/* Full Bio Section */}
          <div id="cp-about" className="scroll-mt-20 bg-white rounded-2xl p-5 sm:p-6 border border-stone-200/90 shadow-xs space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-stone-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#C9A35A]" />
                Spiritual Journey & Bio
              </h2>
              {canEdit && (
                <button
                  onClick={() => setIsEditProfileOpen(true)}
                  className="shrink-0 whitespace-nowrap min-h-[36px] px-2 -mr-2 rounded-lg text-xs text-[#1d372c] hover:bg-[#EEF3EF] flex items-center gap-1"
                >
                  <Edit3 className="w-3 h-3" />
                  Edit Bio
                </button>
              )}
            </div>

            {ownProfile ? (
              <form
                className="space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const bio = bioDraft.trim();
                  setBioSaving(true);
                  setBioNote('');
                  updateMemberProfile(selectedMember.id, { bio });
                  void persistLinkedIdentity({ bio })
                    .then(() => setBioNote('Saved.'))
                    .catch(() => setBioNote('Could not save that bio.'))
                    .finally(() => setBioSaving(false));
                }}
              >
                <label className="block text-xs font-medium text-stone-600" htmlFor="spiritual-journey-bio">
                  Write your spiritual journey
                </label>
                <textarea
                  id="spiritual-journey-bio"
                  rows={6}
                  value={bioDraft}
                  onChange={(event) => setBioDraft(event.target.value)}
                  placeholder="How you came to faith, what you do at Promised Land Christian Center, and a scripture that stays with you."
                  className="w-full p-3 text-sm rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-[#1d372c] bg-stone-50/50"
                />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] text-stone-400">{bioNote}</p>
                  <button
                    type="submit"
                    disabled={bioSaving}
                    className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#1d372c] hover:bg-[#12231c] rounded-lg disabled:opacity-40"
                  >
                    {bioSaving ? 'Saving...' : 'Save bio'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="text-sm text-stone-700 leading-relaxed whitespace-pre-line bg-stone-50/60 p-4 rounded-xl border border-stone-100">
                {selectedMember.bio || 'No full bio provided yet.'}
              </div>
            )}
          </div>

          <div id="cp-huddles" className="scroll-mt-20 bg-white rounded-2xl p-5 sm:p-6 border border-stone-200/90 shadow-xs space-y-4">
            <h2 className="text-base font-semibold text-stone-900 flex items-center gap-2">
              <Radio className="w-4 h-4 text-[#1d372c]" />
              Huddles
            </h2>
            {savedHuddles.length ? (
              <ul className="space-y-2">
                {savedHuddles.map((huddle) => {
                  const live = Boolean(liveHuddleIds[huddle.id]);
                  return (
                    <li
                      key={huddle.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-stone-100 bg-stone-50/60 p-3"
                    >
                      <span className="text-sm text-stone-800 min-w-0 truncate">{huddle.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        {ownProfile ? (
                          <button
                            type="button"
                            onClick={() =>
                              navigate(`/community/chat?channel=${encodeURIComponent(huddle.id)}&huddle=1`)
                            }
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                              live
                                ? 'text-white bg-[#1d372c] ring-2 ring-[#C9A35A] shadow-[0_0_16px_rgba(201, 163, 90,0.85)]'
                                : 'text-stone-500 bg-white border border-stone-200'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${live ? 'bg-[#C9A35A] shadow-[0_0_8px_#C9A35A]' : 'bg-stone-300'}`}
                            />
                            Join Live Huddle
                          </button>
                        ) : live ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-[#1d372c] bg-[#EEF3EF] border border-[#1d372c]/15">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#C9A35A]" />
                            Live
                          </span>
                        ) : null}
                        {ownProfile ? (
                          <button
                            type="button"
                            disabled={huddleSaving}
                            onClick={() => {
                              const next = savedHuddles.filter((item) => item.id !== huddle.id);
                              setHuddleSaving(true);
                              setHuddleNote('');
                              updateMemberProfile(selectedMember.id, {
                                favoriteHuddles: next,
                                favoriteHuddle: next[0] || null,
                              });
                              void persistLinkedIdentity({ favoriteHuddles: next })
                                .then(() => setHuddleNote('Saved.'))
                                .catch(() => setHuddleNote('Could not save those huddles.'))
                                .finally(() => setHuddleSaving(false));
                            }}
                            className="text-[11px] text-stone-400 hover:text-[#1d372c] disabled:opacity-40"
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="text-sm text-stone-500 bg-stone-50/60 p-4 rounded-xl border border-stone-100">
                No huddles yet.
              </div>
            )}
            {ownProfile ? (
              <form
                className="space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const choice = huddleChoices.find((channel) => channel.id === huddleDraft);
                  if (!choice) return;
                  if (savedHuddles.some((huddle) => huddle.id === choice.id)) {
                    setHuddleNote('That huddle is already on your profile.');
                    return;
                  }
                  if (savedHuddles.length >= 8) {
                    setHuddleNote('You can keep up to 8 huddles.');
                    return;
                  }
                  const next = [...savedHuddles, choice];
                  setHuddleSaving(true);
                  setHuddleNote('');
                  updateMemberProfile(selectedMember.id, {
                    favoriteHuddles: next,
                    favoriteHuddle: next[0] || null,
                  });
                  void persistLinkedIdentity({ favoriteHuddles: next })
                    .then(() => {
                      setHuddleDraft('');
                      setHuddleNote('Saved.');
                    })
                    .catch(() => setHuddleNote('Could not save those huddles.'))
                    .finally(() => setHuddleSaving(false));
                }}
              >
                <label className="block text-xs font-medium text-stone-600" htmlFor="favorite-huddle">
                  Add a Community huddle
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    id="favorite-huddle"
                    value={huddleDraft}
                    onChange={(event) => setHuddleDraft(event.target.value)}
                    className="flex-1 p-3 text-sm rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-[#1d372c] bg-stone-50/50"
                  >
                    <option value="">Choose a huddle</option>
                    {huddleChoices
                      .filter((channel) => !savedHuddles.some((huddle) => huddle.id === channel.id))
                      .map((channel) => (
                        <option key={channel.id} value={channel.id}>
                          {channel.name}
                        </option>
                      ))}
                  </select>
                  <button
                    type="submit"
                    disabled={huddleSaving || !huddleDraft}
                    className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#1d372c] hover:bg-[#12231c] rounded-lg disabled:opacity-40"
                  >
                    {huddleSaving ? 'Saving...' : 'Add huddle'}
                  </button>
                </div>
                <p className="text-[11px] text-stone-400">{huddleNote}</p>
              </form>
            ) : null}
          </div>

          {/* Membership Journey Timeline Section */}
          <div id="cp-journey" className="scroll-mt-20 bg-white rounded-2xl p-5 sm:p-6 border border-stone-200/90 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-stone-900 flex items-center gap-2">
                  <Milestone className="w-4 h-4 text-[#1d372c]" />
                  Membership Journey & Spiritual Milestones
                </h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Chronological faith milestones, baptism, and ministry appointments at Promised Land Christian Center.
                </p>
              </div>
              {canEdit && (
                <button
                  onClick={() => setIsAddMilestoneOpen(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#1d372c] bg-[#EEF3EF] hover:bg-[#EEF3EF]/80 border border-[#1d372c]/20 transition-colors flex items-center gap-1.5 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Milestone
                </button>
              )}
            </div>

            {selectedMember.journeyMilestones && selectedMember.journeyMilestones.length > 0 ? (
              <div className="relative pl-6 sm:pl-8 space-y-5 before:absolute before:left-2.5 sm:before:left-3 before:top-3 before:bottom-3 before:w-0.5 before:bg-gradient-to-b before:from-[#1d372c] before:via-[#C9A35A] before:to-stone-200">
                {selectedMember.journeyMilestones.map((ms, index) => (
                  <TimelineMilestoneItem
                    key={`${selectedMember.id}-${ms.id || index}`}
                    milestone={ms}
                    index={index}
                    canEdit={canEdit}
                    onEdit={(milestone) => setEditingMilestone(milestone)}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-stone-400 text-xs bg-stone-50 rounded-xl">
                No membership journey milestones recorded yet.
              </div>
            )}
          </div>

          {/* Prayer Requests Section */}

          {/* Volunteer Badges */}
          <div id="cp-badges" className="scroll-mt-20">
          <VolunteerBadgesSection
            badges={selectedMember.volunteerBadges}
            canToggle={canChooseBadges}
            onToggle={(category) => {
              const catalog = MINISTRY_BADGES.find((item) => item.category === category);
              if (!catalog) return;
              const inCategory = selectedMember.volunteerBadges.filter((badge) => badge.category === category);
              const isOn = inCategory.some((badge) => badge.active !== false);
              let next: VolunteerBadge[];
              if (isOn) {
                next = selectedMember.volunteerBadges.map((badge) =>
                  badge.category === category ? { ...badge, active: false } : badge
                );
              } else if (inCategory.length > 0) {
                next = selectedMember.volunteerBadges.map((badge) =>
                  badge.category === category ? { ...badge, active: true } : badge
                );
              } else {
                next = [
                  ...selectedMember.volunteerBadges,
                  {
                    id: `vb_${category.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}`,
                    name: catalog.label,
                    category,
                    tier: 'Bronze',
                    hours: 0,
                    iconName: catalog.iconName,
                    description: catalog.description,
                    earnedDate: new Date().toISOString().slice(0, 10),
                    active: true,
                  },
                ];
              }
              updateMemberProfile(selectedMember.id, { volunteerBadges: next });
              if (ownProfile) void persistLinkedIdentity({ volunteerBadges: next });
            }}
          />

          </div>

          {/* Status Updates & Testimonies */}
          <div id="cp-updates" className="scroll-mt-20 bg-white rounded-2xl p-5 sm:p-6 border border-stone-200/90 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-stone-900 flex items-center gap-2">
                <Heart className="w-4 h-4 text-[#1d372c]" />
                Member Status Updates & Testimonies
              </h2>
            </div>

            {ownProfile && (
              <form onSubmit={handlePostStatus} className="space-y-2">
                <label className="block text-xs font-medium text-stone-600" htmlFor="profile-status-update">
                  Share an update or testimony
                </label>
                <div className="relative">
                  <textarea
                    id="profile-status-update"
                    rows={3}
                    value={statusText}
                    onChange={(e) => setStatusText(e.target.value)}
                    placeholder="What is God doing? Write it here, then post."
                    className="w-full p-3 text-sm rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-[#1d372c] bg-stone-50/50"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={!statusText.trim() || statusPosting}
                    className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#1d372c] hover:bg-[#12231c] rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-40"
                  >
                    <Send className="w-3 h-3" />
                    {statusPosting ? 'Posting...' : 'Post Update'}
                  </button>
                </div>
              </form>
            )}

            {statusError && <p className="text-xs text-[#1d372c]">{statusError}</p>}

            <div className="space-y-3 pt-1">
              {activityLoading ? (
                <div className="text-center py-6 text-stone-400 text-xs">Loading updates...</div>
              ) : profileUpdates.length > 0 ? (
                profileUpdates.map((update) => (
                  <div
                    key={update.id}
                    className="p-4 rounded-xl bg-stone-50/80 border border-stone-100 space-y-2.5"
                  >
                    <div className="flex items-center justify-between text-[11px] text-stone-500">
                      <span className="font-medium text-stone-800">
                        {spokenName}
                      </span>
                      <span>{formatWhen(update.createdAt)}</span>
                    </div>

                    <p className="text-xs text-stone-700 leading-relaxed">{update.content}</p>

                    <div className="flex items-center justify-between pt-1">
                      <button
                        type="button"
                        onClick={() => void handleAmen(update.id)}
                        disabled={amenBusyId === update.id}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-60 ${
                          update.hasAmened
                            ? 'bg-[#EEF3EF] text-[#1d372c]'
                            : 'text-stone-500 hover:bg-stone-200/60'
                        }`}
                      >
                        <Heart
                          className={`w-3.5 h-3.5 ${
                            update.hasAmened ? 'fill-[#1d372c] text-[#1d372c]' : ''
                          }`}
                        />
                        <span>Amen! ({update.amenCount})</span>
                      </button>

                      <span className="text-[11px] text-stone-400">Community Feed</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-stone-400 text-xs">
                  {activityNote || 'No status updates shared yet.'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Household / Family & Church Records */}
        <div className="min-w-0 space-y-6">
          {/* Visual Household Relationship Tree */}
          <div id="cp-household" className="scroll-mt-20">
            <HouseholdRelationshipTree
              household={household}
              currentProfileMember={selectedMember}
            />
          </div>

          {/* Sign in by text: members who joined by email turn it on here once (own profile only) */}
          {ownProfile && <TextSignInCard defaultPhone={(selectedMember as any).phone || null} />}

          {/* Check-in points (own profile only) */}
          {ownProfile && (
            <div id="cp-points" className="scroll-mt-20">
              <MyPointsCard />
            </div>
          )}

          {/* Attendance & Check-in Record */}
          <div id="cp-checkins" className="scroll-mt-20 bg-white rounded-2xl p-5 sm:p-6 border border-stone-200/90 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-stone-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                Sanctuary Check-Ins
              </h2>
              {checkIns.streakWeeks > 0 && (
                <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  {checkIns.streakWeeks} week streak
                </span>
              )}
            </div>

            {!checkInsVisible ? (
              <p className="text-xs text-stone-500">Check-ins for this child stay with the parent and church staff.</p>
            ) : activityLoading ? (
              <p className="text-xs text-stone-400">Loading check-ins...</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-stone-50 rounded-xl border border-stone-200/70 text-center">
                    <span className="text-2xl font-bold text-stone-900 tabular-nums">
                      {checkIns.totalServicesThisYear}
                    </span>
                    <p className="text-[11px] text-stone-500 mt-1">Services This Year</p>
                  </div>

                  <div className="p-3 bg-stone-50 rounded-xl border border-stone-200/70 text-center">
                    <span className="text-2xl font-bold text-[#1d372c] tabular-nums">
                      {checkIns.streakWeeks}
                    </span>
                    <p className="text-[11px] text-stone-500 mt-1">Week Streak</p>
                  </div>
                </div>

                {checkIns.lastCheckedIn ? (
                  <div className="text-xs text-stone-600 bg-stone-50/70 p-3 rounded-xl border border-stone-100 space-y-2">
                    <div className="flex justify-between gap-3">
                      <span className="text-stone-400">Last Checked In:</span>
                      <span className="font-medium text-stone-800 text-right">
                        {formatWhen(checkIns.lastCheckedIn)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-stone-400">Gathering:</span>
                      <span className="text-stone-800 text-right">
                        {checkIns.serviceTitle || checkIns.serviceType || 'Sanctuary gathering'}
                      </span>
                    </div>
                    {checkIns.recent.length > 1 && (
                      <div className="pt-2 border-t border-stone-200 space-y-1.5">
                        {checkIns.recent.slice(1).map((visit) => (
                          <div key={`${visit.checkedInAt}-${visit.title}`} className="flex justify-between gap-3">
                            <span className="text-stone-700 truncate">{visit.title}</span>
                            <span className="text-stone-400 shrink-0">{formatWhen(visit.checkedInAt)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-stone-400">No sanctuary check-ins yet.</p>
                )}
              </>
            )}
          </div>

          {ownProfile && (
            <div className="bg-white rounded-2xl p-6 border border-stone-200/90 shadow-xs space-y-3">
              <div>
                <h2 className="text-base font-semibold text-stone-900">Keep in touch</h2>
                <p className="text-[11px] text-stone-500 mt-0.5">Only you see this. It stays off other profiles.</p>
              </div>
              {touchIncoming.length === 0 && touchAccepted.length === 0 && touchOutgoing.length === 0 ? (
                <p className="text-xs text-stone-400">When another adult asks to keep in touch, the request shows here.</p>
              ) : (
                <ul className="space-y-2">
                  {touchIncoming.map((person) => (
                    <li key={person.memberId} className="flex items-center justify-between gap-2">
                      <button type="button" onClick={() => navigateToMemberProfile(person.memberId)} className="text-sm text-stone-800 truncate text-left">
                        {person.displayName}
                      </button>
                      <span className="flex items-center gap-1.5 shrink-0">
                        <button type="button" disabled={touchBusy} onClick={() => void sendTouch('accept', person.memberId)} className="text-[11px] font-semibold text-emerald-800">
                          Accept
                        </button>
                        <button type="button" disabled={touchBusy} onClick={() => void sendTouch('decline', person.memberId)} className="text-[11px] text-stone-400">
                          Not now
                        </button>
                      </span>
                    </li>
                  ))}
                  {touchOutgoing.map((person) => (
                    <li key={person.memberId} className="flex items-center justify-between gap-2 text-sm text-stone-500">
                      <span className="truncate">{person.displayName}</span>
                      <span className="text-[11px] shrink-0">Request sent</span>
                    </li>
                  ))}
                  {touchAccepted.map((person) => (
                    <li key={person.memberId} className="flex items-center justify-between gap-2">
                      <button type="button" onClick={() => navigateToMemberProfile(person.memberId)} className="text-sm text-stone-800 truncate text-left">
                        {person.displayName}
                      </button>
                      <button type="button" disabled={touchBusy} onClick={() => void sendTouch('remove', person.memberId)} className="text-[11px] text-stone-400 shrink-0">
                        End
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="bg-white rounded-2xl p-6 border border-stone-200/90 shadow-xs space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-stone-900 flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-600" />
                  Who&apos;s online
                </h2>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  {presenceScope === 'everyone'
                    ? 'Full church list. Online and offline.'
                    : 'Members who set themselves Online.'}
                </p>
              </div>
              <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full shrink-0">
                {presencePeople.filter((person) => person.online).length} online
              </span>
            </div>
            {!presenceReady ? (
              <p className="text-xs text-stone-400">Online status is not on the church record yet.</p>
            ) : presencePeople.length === 0 ? (
              <p className="text-xs text-stone-400">No one is marked Online right now.</p>
            ) : (
              <ul className="max-h-80 overflow-y-auto space-y-1.5 pr-1">
                {presencePeople.map((person) => (
                  <li key={person.id}>
                    <button
                      type="button"
                      onClick={() => navigateToMemberProfile(person.id)}
                      className="w-full flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-stone-50"
                    >
                      <AvatarDisplay
                        name={person.displayName}
                        avatarUrl={person.avatarUrl || undefined}
                        size="sm"
                        showOnlineStatus
                        isOnline={person.online}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-stone-900 truncate">{person.displayName}</span>
                        <span className={`block text-[11px] ${person.online ? 'text-emerald-700' : 'text-stone-400'}`}>
                          {person.inTouch ? 'In touch · ' : ''}
                          {person.online ? 'Online' : 'Offline'}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Stewardship & Giving Summary (Admin or Own Profile view) */}
          {(isSelf || isSuperAdmin) && selectedMember.givingSummary && (
            <div className="bg-white rounded-2xl p-6 border border-stone-200/90 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-stone-900 flex items-center gap-2">
                  <Bookmark className="w-4 h-4 text-[#C9A35A]" />
                  Stewardship & Tithing
                </h2>
                <span className="text-xs font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-amber-600" />
                  {selectedMember.givingSummary.status}
                </span>
              </div>

              <div className="p-3 bg-stone-50 rounded-xl border border-stone-100 text-xs space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-stone-500">YTD Tithing & Gifts:</span>
                  <span className="font-semibold text-stone-900 tabular-nums text-sm">
                    ${selectedMember.givingSummary.ytdTithe.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-stone-400">Campaign:</span>
                  <span className="text-stone-700">{selectedMember.givingSummary.pledgeCampaign}</span>
                </div>
              </div>
              <p className="text-[10px] text-stone-400 italic">
                * Private record visible only to you and Church Finance/Overseers.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Church Family Profiles Browser (Profile Switcher Strip) */}
      <div id="cp-family" className="scroll-mt-20 bg-white rounded-2xl p-5 sm:p-6 border border-stone-200/90 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-[#1d372c]" />
              Family on this profile
            </h3>
            <p className="text-xs text-stone-500">
              People saved with your household.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-stone-400 hidden sm:inline">
              {savedFamily.length} {savedFamily.length === 1 ? 'profile' : 'profiles'}
            </span>
            <button
              onClick={openDirectoryModal}
              className="px-3 py-1.5 text-xs font-semibold text-[#1d372c] bg-[#EEF3EF] hover:bg-[#EEF3EF]/80 rounded-xl transition-colors flex items-center gap-1.5 shadow-2xs self-start sm:self-auto"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Search Full Directory</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">
          {savedFamily.map((m) => {
            const isCurrent = m.id === selectedMember.id;
            return (
              <div
                key={m.id}
                onClick={() => navigateToMemberProfile(m.id)}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                  isCurrent
                    ? 'border-[#1d372c] bg-[#EEF3EF]/40 ring-1 ring-[#1d372c]/30 shadow-xs'
                    : 'border-stone-200/80 bg-stone-50/50 hover:bg-stone-50 hover:border-stone-300'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <AvatarDisplay
                    name={m.fullName}
                    avatarUrl={m.avatarUrl}
                    size="sm"
                    showOnlineStatus
                    isOnline={m.isOnline}
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-stone-900 truncate">
                      {m.fullName}
                    </p>
                    <p className="text-[10px] text-stone-500 truncate">
                      @{m.username} &middot; {m.role}
                    </p>
                  </div>
                </div>

                {isCurrent ? (
                  <span className="text-[10px] font-bold text-[#1d372c] uppercase tracking-wider px-2 py-0.5 rounded bg-white">
                    Viewing
                  </span>
                ) : (
                  <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Modals for QR Code, Milestones, and Cover Banner */}
      <ProfileQrModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        member={selectedMember}
      />
      <AddMilestoneModal
        isOpen={isAddMilestoneOpen}
        onClose={() => setIsAddMilestoneOpen(false)}
        memberId={selectedMember.id}
      />
      <EditMilestoneModal
        isOpen={editingMilestone !== null}
        onClose={() => setEditingMilestone(null)}
        memberId={selectedMember.id}
        milestone={editingMilestone}
      />
      <EditCoverBannerModal
        isOpen={isEditCoverOpen}
        onClose={() => setIsEditCoverOpen(false)}
        memberId={selectedMember.id}
        currentCoverUrl={selectedMember.coverUrl}
      />
      {isChild && (
        <ParentChildLockModal
          isOpen={isChildLockModalOpen}
          onClose={() => setIsChildLockModalOpen(false)}
          childMember={selectedMember}
          mode={childLockModalMode}
        />
      )}
    </div>
  );
};
