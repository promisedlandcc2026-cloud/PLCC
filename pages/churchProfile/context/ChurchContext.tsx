import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useNav } from '../../../lib/NavContext';
import {
  Member,
  Household,
  ChatMessage,
  ConnectionStatus,
  ChurchNotification,
  PrayerRequest,
  MembershipMilestone,
  ChildLockSettings,
  VolunteerBadge,
} from '../types';
import {
  INITIAL_MEMBERS,
  INITIAL_HOUSEHOLDS,
  INITIAL_MESSAGES,
  INITIAL_NOTIFICATIONS,
  INITIAL_PRAYER_REQUESTS,
  SANCTUARY_BANNER,
} from '../data/initialData';
import { fetchAuthorized } from '../../../lib/api';
import { ageFromBirthday, isVaultMemberId, mayHoldOwnContact, normalizeBirthday, splitDisplayName } from '../lib/memberAge';
import { isUnchangedSampleProfile } from '../lib/realProfiles';

const CANNED_REPLY_MARKERS = [
  'Thank you for reaching out, standing in agreement with you.',
  "Amen! I received your message. Let's touch base right after Sunday worship service!",
  'Blessings! Praying favor over your household today.',
];

function isDeliveredProfileMessage(message: ChatMessage): boolean {
  if (!message?.id) return false;
  if (INITIAL_MESSAGES.some((sample) => sample.id === message.id)) return false;
  if (String(message.id).startsWith('msg_reply_')) return false;
  const content = String(message.content || '').trim();
  return !CANNED_REPLY_MARKERS.some((marker) => content === marker || content.endsWith(marker));
}

function withoutMinorContact(member: Member): Member {
  if (mayHoldOwnContact(member)) return member;
  if (!member.email && !member.phone && !member.privacy.showEmail && !member.privacy.showPhone) {
    return member;
  }
  return {
    ...member,
    email: '',
    phone: '',
    privacy: { ...member.privacy, showEmail: false, showPhone: false },
  };
}

function sameStory(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function churchMemberFromRoster(row: {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  birthday?: string | null;
  avatar_url?: string | null;
  role?: string | null;
  household_id?: string | null;
  created_at?: string | null;
}): Member {
  const first = String(row.first_name || '').trim();
  const last = String(row.last_name || '').trim();
  const fullName = [first, last].filter(Boolean).join(' ') || 'Member';
  const age = ageFromBirthday(row.birthday);
  const rosterRole = String(row.role || '').toUpperCase();
  const householdRole: Member['householdRole'] =
    rosterRole === 'CHILD' || (age !== undefined && age < 13)
      ? 'Child'
      : rosterRole === 'YOUTH' || (age !== undefined && age < 18)
        ? 'Youth'
        : 'Independent Member';
  const badgeRole: Member['role'] = (
    ['SUPER_ADMIN', 'PASTOR', 'LEADER', 'VOLUNTEER', 'MEMBER'] as const
  ).includes(rosterRole as Member['role'])
    ? (rosterRole as Member['role'])
    : 'MEMBER';
  const created = row.created_at ? new Date(row.created_at) : null;
  const joinDate =
    created && !Number.isNaN(created.getTime())
      ? created.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : '';
  return withoutMinorContact({
    id: String(row.id),
    username: fullName.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '') || 'member',
    fullName,
    preferredName: first || fullName,
    title: '',
    role: badgeRole,
    avatarUrl: String(row.avatar_url || '').trim() || undefined,
    summary: '',
    bio: '',
    age,
    dateOfBirth: normalizeBirthday(row.birthday) || undefined,
    email: String(row.email || '').trim(),
    phone: String(row.phone || '').trim(),
    privacy: { showEmail: true, showPhone: true, showGiving: false },
    joinDate,
    lastActive: '',
    householdId: String(row.household_id || ''),
    householdRole,
    relationshipTitle: householdRole,
    connectionStatus: 'none',
    isFollowing: false,
    isOnline: false,
    volunteerBadges: [],
    journeyMilestones: [],
    attendanceStats: {
      totalServicesThisYear: 0,
      streakWeeks: 0,
      lastCheckedIn: '',
      serviceType: '',
    },
    recentUpdates: [],
  });
}

function withoutSampleStory(member: Member): Member {
  const sample = INITIAL_MEMBERS.find((item) => item.id === member.id);
  if (!sample) return member;
  const next = { ...member };
  if (member.summary === sample.summary) next.summary = '';
  if (member.bio === sample.bio) next.bio = '';
  if (member.title === sample.title) next.title = '';
  if (member.avatarUrl === sample.avatarUrl) next.avatarUrl = undefined;
  if (sameStory(member.volunteerBadges, sample.volunteerBadges)) next.volunteerBadges = [];
  if (member.joinDate === sample.joinDate) next.joinDate = '';
  if (sameStory(member.journeyMilestones, sample.journeyMilestones)) next.journeyMilestones = [];
  if (sameStory(member.attendanceStats, sample.attendanceStats)) {
    next.attendanceStats = {
      totalServicesThisYear: 0,
      streakWeeks: 0,
      lastCheckedIn: '',
      serviceType: '',
    };
  }
  if (sameStory(member.givingSummary, sample.givingSummary)) next.givingSummary = undefined;
  if (sameStory(member.recentUpdates, sample.recentUpdates)) next.recentUpdates = [];
  return next;
}

interface ChurchContextType {
  currentUser: Member;
  switchCurrentUser: (memberId: string) => void;
  members: Member[];
  households: Household[];
  messages: ChatMessage[];
  selectedMemberId: string;
  setSelectedMemberId: (id: string) => void;
  selectedMember: Member;
  rosterProfileNote: string;
  rosterProfileLoading: boolean;
  activeChatPartnerId: string | null;
  openChatWith: (memberId: string) => void;
  closeChat: () => void;
  isEditProfileOpen: boolean;
  setIsEditProfileOpen: (open: boolean) => void;
  isCropAvatarOpen: boolean;
  setIsCropAvatarOpen: (open: boolean) => void;
  isDirectoryModalOpen: boolean;
  setIsDirectoryModalOpen: (open: boolean) => void;
  openDirectoryModal: () => void;
  closeDirectoryModal: () => void;
  notifications: ChurchNotification[];
  pushToast: ChurchNotification | null;
  dismissPushToast: () => void;
  prayerRequests: PrayerRequest[];

  // Actions
  updateMemberProfile: (id: string, updates: Partial<Member>) => void;
  linkedChurchRecord: boolean;
  selfProfileState: 'loading' | 'linked' | 'unlinked';
  persistLinkedIdentity: (updates: Partial<Member>) => Promise<void>;
  updateHousehold: (householdId: string, updates: Partial<Household>) => void;
  removeHouseholdMember: (householdId: string, memberId: string) => void;
  addHouseholdMember: (
    householdId: string,
    input: {
      fullName: string;
      preferredName?: string;
      relationshipTitle?: string;
      householdRole: Member['householdRole'];
      age?: number;
    }
  ) => string;
  addExistingToMyHousehold: (
    memberId: string,
    householdRole: Member['householdRole']
  ) => Promise<{ ok: boolean; error?: string }>;
  updateMemberAvatar: (id: string, avatarDataUrl: string) => void;
  updateMemberCover: (id: string, coverUrl: string) => void;
  toggleConnect: (targetMemberId: string) => void;
  toggleFollow: (targetMemberId: string) => void;
  sendDirectMessage: (receiverId: string, content: string) => void;
  addStatusUpdate: (memberId: string, content: string) => void;
  toggleAmen: (memberId: string, statusId: string) => void;
  addMembershipMilestone: (memberId: string, milestone: Omit<MembershipMilestone, 'id'>) => void;
  updateMembershipMilestone: (memberId: string, milestoneId: string, updates: Partial<MembershipMilestone>) => void;
  deleteMembershipMilestone: (memberId: string, milestoneId: string) => void;
  addPrayerRequest: (request: Omit<PrayerRequest, 'id' | 'timestamp' | 'prayedCount' | 'hasPrayed'>) => void;
  togglePrayed: (requestId: string) => void;
  deletePrayerRequest: (requestId: string) => void;
  updatePrayerRequest: (requestId: string, updates: Partial<PrayerRequest>) => void;
  toggleMemberOnlineStatus: (memberId?: string) => void;
  setMemberOnlineStatus: (memberId: string, isOnline: boolean) => void;
  navigateToMemberProfile: (memberId: string) => void;

  // Child Profile & Parental Lock Features
  unlockedChildSessionIds: string[];
  toggleChildLock: (childMemberId: string, isLocked: boolean, customSettings?: Partial<ChildLockSettings>) => void;
  updateChildLockSettings: (childMemberId: string, settings: Partial<ChildLockSettings>) => void;
  isParentOrGuardianOf: (guardianId: string, childId: string) => boolean;
  verifyParentPin: (childMemberId: string, pin: string) => boolean;
  unlockChildForSession: (childMemberId: string) => void;
  lockChildForSession: (childMemberId: string) => void;
  isChildProfileLockedForViewer: (child: Member, viewerId?: string) => boolean;
}

const ChurchContext = createContext<ChurchContextType | undefined>(undefined);

const STORAGE_KEY_MEMBERS = 'awc_vault_members_profile_only_v3';
const STORAGE_KEY_HOUSEHOLDS = 'awc_vault_households_profile_v3';
const STORAGE_KEY_MESSAGES = 'awc_vault_messages_profile_v2';
const STORAGE_KEY_USER_ID = 'awc_vault_user_id_profile_v2';
const STORAGE_KEY_SELECTED_ID = 'awc_vault_selected_id_profile_v2';
const STORAGE_KEY_PRAYERS = 'awc_vault_prayers_profile_v2';
const STORAGE_KEY_BIOS = 'awc_vault_member_bios_v1';
const STORAGE_KEY_JOINED = 'awc_vault_member_joined_on_v1';
const STORAGE_KEY_BADGES = 'awc_vault_member_badges_v1';
const STORAGE_KEY_MILESTONES = 'awc_vault_member_milestones_v1';
const STORAGE_KEY_AVATARS = 'awc_vault_member_avatars_v1';
const STORAGE_KEY_PRESENCE = 'awc_vault_member_presence_v1';
const STORAGE_KEY_ADDRESS = 'awc_vault_member_address_as_v1';

const MILESTONE_CATEGORIES = ['Baptism', 'Membership', 'Leadership', 'Discipleship', 'Ordination', 'Service'];

function milestonesFromList(raw: unknown): MembershipMilestone[] {
  if (!Array.isArray(raw)) return [];
  const milestones: MembershipMilestone[] = [];
  for (const item of raw) {
    const title = String(item?.title || '').trim();
    const date = String(item?.date || '').trim();
    if (!title || !date) continue;
    const category = MILESTONE_CATEGORIES.includes(String(item?.category || ''))
      ? (item.category as MembershipMilestone['category'])
      : 'Service';
    const officiatedBy = String(item?.officiatedBy || '').trim();
    milestones.push({
      id: String(item?.id || `jm_${milestones.length}`),
      title,
      date,
      category,
      description: String(item?.description || '').trim(),
      ...(officiatedBy ? { officiatedBy } : {}),
    });
  }
  return milestones;
}

function readMemberMilestones(memberId: string): MembershipMilestone[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_MILESTONES) || '{}');
    return milestonesFromList(saved?.[memberId]);
  } catch {
    return [];
  }
}

function resolveMilestones(raw: unknown, memberId: string, fallback: MembershipMilestone[] = []): MembershipMilestone[] {
  const server = milestonesFromList(raw);
  if (server.length) return server;
  const local = readMemberMilestones(memberId);
  if (local.length) return local;
  return fallback;
}

const BADGE_LABELS: Record<string, string> = {
  Ushering: 'Ushers',
  Worship: 'Choir',
  'Tech & Media': 'Media',
  Hospitality: 'Hospitality',
  Outreach: 'Outreach',
  Children: 'Children',
};

function joinedMonthKey(value: string): string {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}/.test(raw)) return raw.slice(0, 7);
  const parsed = new Date(/\d{4}$/.test(raw) ? raw.replace(/(\d{4})$/, '1, $1') : raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
}

const PROFILE_ROLES = ['SUPER_ADMIN', 'PASTOR', 'LEADER', 'VOLUNTEER', 'MEMBER'] as const;

function asProfileRole(value: unknown): Member['role'] | '' {
  const role = String(value || '').trim().toUpperCase().replace(/\s+/g, '_');
  return (PROFILE_ROLES as readonly string[]).includes(role) ? (role as Member['role']) : '';
}

function monthLabel(value: string): string {
  const iso = String(value || '').slice(0, 7);
  const match = iso.match(/^(\d{4})-(\d{2})$/);
  if (!match) return '';
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function badgesFromList(raw: unknown): VolunteerBadge[] {
  if (!Array.isArray(raw)) return [];
  const badges: VolunteerBadge[] = [];
  for (const item of raw) {
    const category = String(item?.category || '') as VolunteerBadge['category'];
    if (!BADGE_LABELS[category] || item?.active === false) continue;
    badges.push({
      id: `vb_${category}`,
      name: BADGE_LABELS[category],
      category,
      tier: 'Bronze',
      hours: 0,
      iconName: '',
      description: '',
      earnedDate: '',
      active: true,
    });
  }
  return badges;
}
const STORAGE_KEY_HUDDLES = 'awc_vault_member_favorite_huddle_v1';

type ProfileHuddle = { id: string; name: string };

function huddleFromApi(data: { favoriteHuddleId?: string | null; favoriteHuddleName?: string | null }): ProfileHuddle | null {
  const id = String(data.favoriteHuddleId || '').trim();
  const name = String(data.favoriteHuddleName || '').trim();
  return id && name ? { id, name } : null;
}

function huddlesFromList(raw: unknown): ProfileHuddle[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const huddles: ProfileHuddle[] = [];
  for (const item of raw) {
    const id = String(item?.id || '').trim();
    const name = String(item?.name || '').trim();
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    huddles.push({ id, name });
    if (huddles.length >= 8) break;
  }
  return huddles;
}

function resolveFavoriteHuddles(
  data: { favoriteHuddles?: unknown; favoriteHuddleId?: string | null; favoriteHuddleName?: string | null },
  memberId: string,
  fallback: ProfileHuddle[] = []
): ProfileHuddle[] {
  const fromServer = huddlesFromList(data.favoriteHuddles);
  const local = readMemberFavoriteHuddles(memberId);
  if (local.length > fromServer.length) return local;
  if (fromServer.length) return fromServer;
  const one = huddleFromApi(data);
  if (one) return [one];
  return fallback;
}

function readMemberBio(memberId: string): string {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_BIOS) || '{}');
    return String(saved?.[memberId] || '');
  } catch {
    return '';
  }
}

function readMemberJoined(memberId: string): string {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_JOINED) || '{}');
    return monthLabel(String(saved?.[memberId] || ''));
  } catch {
    return '';
  }
}

function writeMemberJoined(memberId: string, month: string) {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_JOINED) || '{}');
    if (month) saved[memberId] = month;
    else delete saved[memberId];
    localStorage.setItem(STORAGE_KEY_JOINED, JSON.stringify(saved));
  } catch {
    /* This browser can still show the month for the rest of the visit. */
  }
}

function readMemberBadges(memberId: string): VolunteerBadge[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_BADGES) || '{}');
    return badgesFromList(saved?.[memberId]);
  } catch {
    return [];
  }
}

function readMemberAddress(memberId: string): 'brother' | 'sister' | null {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_ADDRESS) || '{}');
    const value = String(saved?.[memberId] || '').trim().toLowerCase();
    return value === 'brother' || value === 'sister' ? value : null;
  } catch {
    return null;
  }
}

function writeMemberAddress(memberId: string, value: 'brother' | 'sister' | null) {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_ADDRESS) || '{}');
    if (value === 'brother' || value === 'sister') saved[memberId] = value;
    else delete saved[memberId];
    localStorage.setItem(STORAGE_KEY_ADDRESS, JSON.stringify(saved));
  } catch {
    /* This browser can still show the choice for the rest of the visit. */
  }
}

function resolveAddress(server: unknown, memberId: string): 'brother' | 'sister' | null {
  if (server === 'brother' || server === 'sister') {
    writeMemberAddress(memberId, server);
    return server;
  }
  return readMemberAddress(memberId);
}

function readMemberPresence(memberId: string): { online: boolean | null; coverUrl: string } {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_PRESENCE) || '{}');
    const row = saved?.[memberId] || {};
    const coverUrl = String(row.coverUrl || '').trim();
    return {
      online: typeof row.online === 'boolean' ? row.online : null,
      coverUrl: /^https:\/\//i.test(coverUrl) ? coverUrl : '',
    };
  } catch {
    return { online: null, coverUrl: '' };
  }
}

function writeMemberPresence(memberId: string, updates: { online?: boolean; coverUrl?: string | null }) {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_PRESENCE) || '{}');
    const current = saved[memberId] || {};
    if (updates.online !== undefined) current.online = updates.online;
    if (updates.coverUrl !== undefined) {
      const cover = String(updates.coverUrl || '').trim();
      current.coverUrl = /^https:\/\//i.test(cover) ? cover : '';
    }
    saved[memberId] = current;
    localStorage.setItem(STORAGE_KEY_PRESENCE, JSON.stringify(saved));
  } catch {
    /* This browser can still show the choice for the rest of the visit. */
  }
}

function coverForSave(url: string): string | null {
  const next = String(url || '').trim();
  if (!next || next === SANCTUARY_BANNER) return null;
  if (!/^https:\/\//i.test(next) || next.length > 2048) return null;
  return next;
}

function readMemberAvatar(memberId: string): string {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_AVATARS) || '{}');
    const url = String(saved?.[memberId] || '').trim();
    if (/^https:\/\//i.test(url) || /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(url)) return url;
    return '';
  } catch {
    return '';
  }
}

function writeMemberAvatar(memberId: string, url: string) {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_AVATARS) || '{}');
    const next = String(url || '').trim();
    if (!next) delete saved[memberId];
    else if (next.startsWith('data:') && next.length > 600_000) return;
    else saved[memberId] = next;
    localStorage.setItem(STORAGE_KEY_AVATARS, JSON.stringify(saved));
  } catch {
    /* This browser can still show the photo for the rest of the visit. */
  }
}

function writeMemberMilestones(memberId: string, milestones: MembershipMilestone[]) {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_MILESTONES) || '{}');
    saved[memberId] = milestones;
    localStorage.setItem(STORAGE_KEY_MILESTONES, JSON.stringify(saved));
  } catch {
    /* This browser can still show the milestones for the rest of the visit. */
  }
}

function writeMemberBadges(memberId: string, badges: VolunteerBadge[]) {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_BADGES) || '{}');
    saved[memberId] = badges
      .filter((badge) => badge.active !== false)
      .map((badge) => ({ category: badge.category, active: true }));
    localStorage.setItem(STORAGE_KEY_BADGES, JSON.stringify(saved));
  } catch {
    /* This browser can still show the badges for the rest of the visit. */
  }
}

function writeMemberBio(memberId: string, bio: string) {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_BIOS) || '{}');
    saved[memberId] = bio;
    localStorage.setItem(STORAGE_KEY_BIOS, JSON.stringify(saved));
  } catch {
    /* This browser can still show the bio for the rest of the visit. */
  }
}

function readMemberFavoriteHuddles(memberId: string): ProfileHuddle[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_HUDDLES) || '{}');
    const value = saved?.[memberId];
    if (Array.isArray(value)) return huddlesFromList(value);
    const one = huddleFromApi({ favoriteHuddleId: value?.id, favoriteHuddleName: value?.name });
    return one ? [one] : [];
  } catch {
    return [];
  }
}

function writeMemberFavoriteHuddles(memberId: string, huddles: ProfileHuddle[]) {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_HUDDLES) || '{}');
    if (huddles.length) saved[memberId] = huddles;
    else delete saved[memberId];
    localStorage.setItem(STORAGE_KEY_HUDDLES, JSON.stringify(saved));
  } catch {
    /* This browser can still show the huddles for the rest of the visit. */
  }
}

export const ChurchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userRole } = useNav();
  const [searchParams, setSearchParams] = useSearchParams();
  const viewedMemberId = String(searchParams.get('member') || '').trim();
  const [rosterProfileNote, setRosterProfileNote] = useState('');
  const [rosterProfileLoading, setRosterProfileLoading] = useState(false);
  // Members state - ensure all default initial members (including new child profiles) are present
  const [members, setMembers] = useState<Member[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_MEMBERS);
      if (saved) {
        const parsed: Member[] = JSON.parse(saved);
        const existingIds = new Set(parsed.map((m) => m.id));
        const missing = INITIAL_MEMBERS.filter((m) => !existingIds.has(m.id));
        const merged = missing.length > 0 ? [...parsed, ...missing] : parsed;
        return merged.map((member) => withoutSampleStory(withoutMinorContact(member)));
      }
      return INITIAL_MEMBERS.map((member) => withoutSampleStory(withoutMinorContact(member)));
    } catch {
      return INITIAL_MEMBERS.map((member) => withoutSampleStory(withoutMinorContact(member)));
    }
  });

  // Prayer requests state
  const [prayerRequests, setPrayerRequests] = useState<PrayerRequest[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PRAYERS);
      const parsed = saved ? JSON.parse(saved) : [];
      const sampleIds = new Set(INITIAL_PRAYER_REQUESTS.map((request) => request.id));
      return Array.isArray(parsed) ? parsed.filter((request) => request?.id && !sampleIds.has(request.id)) : [];
    } catch {
      return [];
    }
  });

  const [households, setHouseholds] = useState<Household[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_HOUSEHOLDS);
      if (saved) {
        const parsed: Household[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      return INITIAL_HOUSEHOLDS;
    } catch {
      return INITIAL_HOUSEHOLDS;
    }
  });

  // Current logged in user ID
  const [currentUserId, setCurrentUserId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_USER_ID);
      return saved && INITIAL_MEMBERS.some((m) => m.id === saved) ? saved : 'mem_1';
    } catch {
      return 'mem_1';
    }
  });

  // Selected Profile ID being viewed
  const [selectedMemberId, setSelectedMemberId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SELECTED_ID);
      return saved && INITIAL_MEMBERS.some((m) => m.id === saved) ? saved : 'mem_1';
    } catch {
      return 'mem_1';
    }
  });

  // Messages state
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_MESSAGES);
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed.filter(isDeliveredProfileMessage) : [];
    } catch {
      return [];
    }
  });

  const [notifications, setNotifications] = useState<ChurchNotification[]>(INITIAL_NOTIFICATIONS);

  // Modals & UI triggers
  const [activeChatPartnerId, setActiveChatPartnerId] = useState<string | null>(null);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState<boolean>(false);
  const [isCropAvatarOpen, setIsCropAvatarOpen] = useState<boolean>(false);
  const [isDirectoryModalOpen, setIsDirectoryModalOpen] = useState<boolean>(false);
  const [pushToast, setPushToast] = useState<ChurchNotification | null>(null);
  const [linkedChurchRecord, setLinkedChurchRecord] = useState(false);
  const [selfProfileState, setSelfProfileState] = useState<'loading' | 'linked' | 'unlinked'>('loading');

  const openDirectoryModal = () => setIsDirectoryModalOpen(true);
  const closeDirectoryModal = () => setIsDirectoryModalOpen(false);

  useEffect(() => {
    if (pushToast) {
      const timer = setTimeout(() => {
        setPushToast(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [pushToast]);

  // Save changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY_MEMBERS,
        JSON.stringify(members.filter((member) => !isVaultMemberId(member.id)))
      );
    } catch (e) {
      console.warn('Failed to save members', e);
    }
  }, [members]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY_HOUSEHOLDS,
        JSON.stringify(
          households.filter(
            (household) =>
              household &&
              !isVaultMemberId(String(household.id || '')) &&
              !String(household.id || '').startsWith('view-')
          )
        )
      );
    } catch (e) {
      console.warn('Failed to save households', e);
    }
  }, [households]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messages));
    } catch (e) {
      console.warn('Failed to save messages', e);
    }
  }, [messages]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_USER_ID, currentUserId);
    } catch (e) {
      console.warn('Failed to save user id', e);
    }
  }, [currentUserId]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_PRAYERS, JSON.stringify(prayerRequests));
    } catch (e) {
      console.warn('Failed to save prayer requests', e);
    }
  }, [prayerRequests]);

  useEffect(() => {
    try {
      if (!isVaultMemberId(selectedMemberId)) {
        localStorage.setItem(STORAGE_KEY_SELECTED_ID, selectedMemberId);
      }
    } catch (e) {
      console.warn('Failed to save selected id', e);
    }
  }, [selectedMemberId]);

  const currentUser = members.find((m) => m.id === currentUserId) || members[0];
  const selectedMember = members.find((m) => m.id === selectedMemberId) || currentUser;
  const loginIsSuperAdmin = String(userRole || '').toUpperCase() === 'SUPER_ADMIN';
  const mayReviseMember = (memberId: string) =>
    loginIsSuperAdmin || memberId === currentUser.id || memberId === currentUserId;

  const switchCurrentUser = (memberId: string) => {
    setCurrentUserId(memberId);
  };

  const navigateToMemberProfile = (memberId: string) => {
    setSelectedMemberId(memberId);
    if (memberId === currentUserId) {
      if (searchParams.get('member')) setSearchParams({});
    } else if (isVaultMemberId(memberId)) {
      setSearchParams({ member: memberId });
    } else if (searchParams.get('member')) {
      setSearchParams({});
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const updateMemberProfile = (id: string, updates: Partial<Member>) => {
    if (!mayReviseMember(id)) return;
    setMembers((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const next = { ...m, ...updates };
        const typedAge = Object.prototype.hasOwnProperty.call(updates, 'age') ? updates.age : undefined;
        const birthday = normalizeBirthday(next.dateOfBirth);
        if (birthday) {
          const fromBirthday = ageFromBirthday(birthday);
          if (typedAge !== undefined && fromBirthday !== undefined && typedAge !== fromBirthday) {
            next.dateOfBirth = undefined;
            next.age = typedAge;
          } else {
            next.dateOfBirth = birthday;
            if (typedAge === undefined && fromBirthday !== undefined) next.age = fromBirthday;
          }
        }
        return withoutMinorContact(next);
      })
    );
    if (isVaultMemberId(id)) {
      const body: Record<string, unknown> = {};
      if (updates.fullName) body.fullName = updates.fullName;
      if (updates.preferredName !== undefined) body.preferredName = updates.preferredName;
      if (updates.householdRole) body.householdRole = updates.householdRole;
      if (updates.dateOfBirth) body.birthday = updates.dateOfBirth;
      else if (updates.age !== undefined) body.age = updates.age;
      if (Object.keys(body).length > 0) {
        void fetchAuthorized(
          `/api/vault?resource=people&subResource=member-household&memberId=${encodeURIComponent(id)}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        );
      }
    }
    if (updates.addressAs !== undefined) {
      const next = updates.addressAs === 'brother' || updates.addressAs === 'sister' ? updates.addressAs : null;
      writeMemberAddress(id, next);
      if (isVaultMemberId(id) && id !== currentUserId && loginIsSuperAdmin) {
        void fetchAuthorized('/api/vault?resource=people&subResource=member-self', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memberId: id, addressAs: next }),
        });
      }
    }
  };

  useEffect(() => {
    let cancelled = false;
    const targetId = currentUserId;
    const hydrate = async () => {
      let revealed = false;
      try {
        const res = await fetchAuthorized('/api/vault?resource=people&subResource=member-self');
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !data?.ok || !data.linked) {
          setLinkedChurchRecord(false);
          setSelfProfileState('unlinked');
          return;
        }
        setLinkedChurchRecord(true);
        const birthday = normalizeBirthday(data.birthday);
        const age = ageFromBirthday(birthday);
        const legal = [data.firstName, data.lastName].filter(Boolean).join(' ').trim();
        const displayName = String(data.displayName || legal || '').trim();
        setMembers((prev) =>
          prev.map((m) => {
            if (m.id !== targetId) return withoutMinorContact(m);
            const cleared = withoutSampleStory(m);
            return withoutMinorContact({
              ...cleared,
              fullName: legal || displayName || cleared.fullName,
              preferredName: displayName || legal || cleared.fullName,
              title: data.title || cleared.title,
              role: asProfileRole(data.role) || asProfileRole(userRole) || cleared.role,
              dateOfBirth: birthday || cleared.dateOfBirth,
              age: age !== undefined ? age : cleared.age,
              phone: data.phone || cleared.phone,
              email: data.email || cleared.email,
              bio: String(data.bio || readMemberBio(targetId) || cleared.bio || ''),
              joinDate:
                monthLabel(String(data.joinedOn || '')) ||
                readMemberJoined(targetId) ||
                monthLabel(String(data.createdAt || '').slice(0, 7)) ||
                cleared.joinDate,
              volunteerBadges: badgesFromList(data.volunteerBadges).length
                ? badgesFromList(data.volunteerBadges)
                : readMemberBadges(targetId).length
                  ? readMemberBadges(targetId)
                  : cleared.volunteerBadges,
              journeyMilestones: resolveMilestones(data.journeyMilestones, targetId, cleared.journeyMilestones || []),
              ...(() => {
                const huddles = resolveFavoriteHuddles(data, targetId, cleared.favoriteHuddles || []);
                return { favoriteHuddles: huddles, favoriteHuddle: huddles[0] || cleared.favoriteHuddle || null };
              })(),
              avatarUrl: String(data.avatarUrl || '').trim() || readMemberAvatar(targetId) || cleared.avatarUrl,
              isOnline:
                typeof data.fellowshipOnline === 'boolean'
                  ? data.fellowshipOnline
                  : readMemberPresence(targetId).online ?? false,
              lastActive: (typeof data.fellowshipOnline === 'boolean'
                ? data.fellowshipOnline
                : readMemberPresence(targetId).online)
                ? 'Just now'
                : 'Offline',
              coverUrl: String(data.coverUrl || '').trim() || readMemberPresence(targetId).coverUrl || cleared.coverUrl,
              addressAs: resolveAddress(data.addressAs, targetId),
            });
          })
        );
        setSelfProfileState('linked');
        revealed = true;
        const houseRes = await fetchAuthorized('/api/vault?resource=people&subResource=member-household');
        const house = await houseRes.json().catch(() => ({}));
        if (cancelled || !houseRes.ok || !house?.ok) return;
        const localHousehold = households.find((item) => Array.isArray(item?.memberIds) && item.memberIds.includes(targetId));
        if (!house.household?.id) {
          if (localHousehold && (localHousehold.name || localHousehold.address)) {
            const createdRes = await fetchAuthorized('/api/vault?resource=people&subResource=member-household', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: localHousehold.name, address: localHousehold.address }),
            });
            const created = await createdRes.json().catch(() => ({}));
            const savedId = String(created?.household?.id || '');
            if (!cancelled && createdRes.ok && savedId && localHousehold.id !== savedId) {
              setHouseholds((prev) => prev.map((item) => (item.id === localHousehold.id ? { ...item, id: savedId } : item)));
              setMembers((prev) =>
                prev.map((person) => (person.householdId === localHousehold.id ? { ...person, householdId: savedId } : person))
              );
            }
          }
          return;
        }
        const householdId = String(house.household.id);
        const family = Array.isArray(house.family) ? house.family : [];
        const knownNames = new Set(
          family.map((person: { displayName?: string }) => String(person.displayName || '').trim().toLowerCase())
        );
        const localFamily = localHousehold
          ? members.filter(
              (person) =>
                person.householdId === localHousehold.id &&
                person.id !== targetId &&
                !isUnchangedSampleProfile(person) &&
                !knownNames.has(String(person.fullName || '').trim().toLowerCase())
            )
          : [];
        for (const person of localFamily) {
          const added = await fetchAuthorized('/api/vault?resource=people&subResource=member-household', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fullName: person.fullName,
              preferredName: person.preferredName,
              householdRole: person.householdRole,
              age: person.age,
              birthday: person.dateOfBirth,
            }),
          });
          const addedBody = await added.json().catch(() => ({}));
          if (added.ok && addedBody?.memberId) {
            family.push({
              id: addedBody.memberId,
              displayName: person.fullName,
              householdRole: person.householdRole,
              age: person.age,
              birthday: person.dateOfBirth || null,
              avatarUrl: person.avatarUrl || null,
              isSelf: false,
            });
          }
        }
        if (localHousehold?.address && !String(house.household.address || '').trim()) {
          await fetchAuthorized('/api/vault?resource=people&subResource=member-household', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: localHousehold.name || house.household.name, address: localHousehold.address }),
          });
        }
        if (cancelled) return;
        const self = family.find((person: { isSelf?: boolean }) => person.isSelf) || family[0];
        const savedMembers = family.map((person: {
          id: string;
          displayName?: string;
          householdRole?: Member['householdRole'];
          age?: number;
          birthday?: string | null;
          avatarUrl?: string | null;
          isSelf?: boolean;
        }) => {
          const member = churchMemberFromRoster({
            id: person.id,
            first_name: person.displayName,
            last_name: '',
            avatar_url: person.avatarUrl,
            birthday: person.birthday,
            household_id: householdId,
            household_name: house.household.name,
          });
          if (person.householdRole) {
            member.householdRole = person.householdRole;
            member.relationshipTitle = person.householdRole;
          }
          if (person.age !== undefined) member.age = person.age;
          if (person.isSelf) {
            member.fullName = displayName || member.fullName;
            member.preferredName = String(data.preferredName || member.preferredName);
            member.title = String(data.title || '');
            member.role = asProfileRole(data.role) || asProfileRole(userRole) || member.role;
            member.email = String(data.email || '');
            member.phone = String(data.phone || '');
            member.avatarUrl =
              String(data.avatarUrl || '').trim() || readMemberAvatar(String(person.id)) || member.avatarUrl;
            member.isOnline =
              typeof data.fellowshipOnline === 'boolean'
                ? data.fellowshipOnline
                : readMemberPresence(String(person.id)).online ?? false;
            member.lastActive = member.isOnline ? 'Just now' : 'Offline';
            member.coverUrl =
              String(data.coverUrl || '').trim() || readMemberPresence(String(person.id)).coverUrl || undefined;
            member.bio = String(data.bio || readMemberBio(String(person.id)) || '');
            member.joinDate =
              monthLabel(String(data.joinedOn || '')) ||
              readMemberJoined(String(person.id)) ||
              monthLabel(String(data.createdAt || '').slice(0, 7)) ||
              '';
            member.volunteerBadges = badgesFromList(data.volunteerBadges).length
              ? badgesFromList(data.volunteerBadges)
              : readMemberBadges(String(person.id));
            member.journeyMilestones = resolveMilestones(data.journeyMilestones, String(person.id));
            const huddles = resolveFavoriteHuddles(data, String(person.id));
            member.favoriteHuddles = huddles;
            member.favoriteHuddle = huddles[0] || null;
            if (birthday) member.dateOfBirth = birthday;
            if (age !== undefined) member.age = age;
            member.addressAs = resolveAddress(data.addressAs, String(person.id));
          }
          return withoutMinorContact(member);
        });
        setMembers((prev) => {
          const savedIds = new Set(savedMembers.map((person) => person.id));
          const kept = prev.filter(
            (person) =>
              !savedIds.has(person.id) &&
              person.id !== targetId &&
              person.householdId !== localHousehold?.id &&
              !isUnchangedSampleProfile(person)
          );
          return [...kept, ...savedMembers];
        });
        setHouseholds((prev) => [
          ...prev.filter((item) => item.id !== householdId && item.id !== localHousehold?.id),
          {
            id: householdId,
            name: String(localHousehold?.name || house.household.name || 'Household'),
            address: String(localHousehold?.address || house.household.address || ''),
            campus: '',
            memberIds: savedMembers.map((person) => person.id),
            headMemberId: self?.id || savedMembers[0]?.id || '',
            phone: '',
          },
        ]);
        if (self?.id) {
          setCurrentUserId(String(self.id));
          setSelectedMemberId((current) => (current === targetId ? String(self.id) : current));
        }
      } catch {
        if (!cancelled && !revealed) {
          setLinkedChurchRecord(false);
          setSelfProfileState('unlinked');
        }
      }
    };
    void hydrate();
    return () => {
      cancelled = true;
    };
    // Load the signed-in church record onto the starting "you" profile only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (viewedMemberId || selfProfileState !== 'linked') return;
    setSelectedMemberId((current) => (current === currentUserId ? current : currentUserId));
  }, [viewedMemberId, currentUserId, selfProfileState]);

  useEffect(() => {
    if (!isVaultMemberId(viewedMemberId)) {
      setRosterProfileNote('');
      setRosterProfileLoading(false);
      return;
    }
    let cancelled = false;
    setRosterProfileNote('');
    setRosterProfileLoading(true);
    void (async () => {
      try {
        const res = await fetchAuthorized(
          `/api/vault?resource=people&subResource=member-profile&memberId=${encodeURIComponent(viewedMemberId)}`
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        const listed = Array.isArray(data?.members)
          ? data.members.find((row: { id?: string }) => String(row?.id || '') === viewedMemberId)
          : null;
        const row = data?.member?.id ? data.member : listed;
        if (!res.ok || !row?.id) {
          setRosterProfileNote(data?.error || 'Could not open that member.');
          return;
        }
        const profile = churchMemberFromRoster({
          id: row.id,
          first_name: row.firstName || row.first_name,
          last_name: row.lastName || row.last_name,
          email: row.email || '',
          phone: row.phone || '',
          birthday: row.birthday,
          avatar_url: row.avatarUrl || row.avatar_url,
          role: row.role,
          household_id: row.household_id || (row.householdName ? `view-${row.id}` : ''),
          household_name: row.householdName || row.household_name,
          created_at: row.created_at,
        });
        const staffView = Boolean(data?.staff);
        profile.privacy = {
          showEmail: staffView || Boolean(String(row.email || '').trim()),
          showPhone: staffView || Boolean(String(row.phone || '').trim()),
          showGiving: false,
        };
        const viewedHuddles = resolveFavoriteHuddles(row, profile.id);
        profile.favoriteHuddles = viewedHuddles;
        profile.favoriteHuddle = viewedHuddles[0] || null;
        profile.joinDate = String(row.memberSince || '').trim() || profile.joinDate;
        profile.volunteerBadges = badgesFromList(row.volunteerBadges);
        profile.journeyMilestones = milestonesFromList(row.journeyMilestones);
        profile.isOnline = row.fellowshipOnline === true;
        profile.lastActive = profile.isOnline ? 'Just now' : 'Offline';
        profile.coverUrl = String(row.coverUrl || '').trim() || undefined;
        profile.addressAs = resolveAddress(row.addressAs, profile.id);
        setMembers((prev) => [...prev.filter((member) => member.id !== profile.id), profile]);
        const householdId = String(row.household_id || (row.householdName ? `view-${row.id}` : '')).trim();
        if (householdId) {
          const householdName = String(row.household_name || row.householdName || '').trim() || 'Household';
          setHouseholds((prev) => {
            if (prev.some((household) => household.id === householdId)) {
              return prev.map((household) =>
                household.id === householdId && !household.memberIds.includes(profile.id)
                  ? { ...household, memberIds: [...household.memberIds, profile.id] }
                  : household
              );
            }
            return [
              ...prev,
              {
                id: householdId,
                name: householdName,
                address: '',
                campus: '',
                memberIds: [profile.id],
                headMemberId: profile.id,
                phone: '',
              },
            ];
          });
        }
        setSelectedMemberId(profile.id);
      } catch {
        if (!cancelled) setRosterProfileNote('Could not open that member.');
      } finally {
        if (!cancelled) setRosterProfileLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewedMemberId]);

  const householdSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingHouseholdSave = useRef<{ householdId: string; updates: Partial<Household> } | null>(null);

  const updateHousehold = (householdId: string, updates: Partial<Household>) => {
    const nextName = updates.name !== undefined ? String(updates.name) : undefined;
    const nextAddress = updates.address !== undefined ? String(updates.address) : undefined;
    setHouseholds((prev) =>
      (Array.isArray(prev) ? prev : []).map((h) => {
        if (!h || h.id !== householdId) return h;
        return {
          ...h,
          ...(nextName !== undefined ? { name: nextName } : {}),
          ...(nextAddress !== undefined ? { address: nextAddress } : {}),
          memberIds: Array.isArray(h.memberIds) ? h.memberIds : [],
        };
      })
    );
    if (nextName === undefined && nextAddress === undefined) return;
    const previous = pendingHouseholdSave.current;
    pendingHouseholdSave.current = {
      householdId,
      updates: {
        ...(previous?.householdId === householdId ? previous.updates : {}),
        ...(nextName !== undefined ? { name: nextName } : {}),
        ...(nextAddress !== undefined ? { address: nextAddress } : {}),
      },
    };
    if (householdSaveTimer.current) clearTimeout(householdSaveTimer.current);
    householdSaveTimer.current = setTimeout(() => {
      const pending = pendingHouseholdSave.current;
      pendingHouseholdSave.current = null;
      if (!pending) return;
      void (async () => {
        try {
          const res = await fetchAuthorized('/api/vault?resource=people&subResource=member-household', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: pending.updates.name, address: pending.updates.address }),
          });
          const data = await res.json().catch(() => ({}));
          const savedId = String(data?.household?.id || '');
          if (!res.ok || !savedId || savedId === pending.householdId) return;
          const savedName = String(data?.household?.name || pending.updates.name || '');
          const savedAddress = String(data?.household?.address || pending.updates.address || '');
          setHouseholds((prev) => {
            const list = Array.isArray(prev) ? prev : [];
            const edited = list.find((item) => item?.id === pending.householdId);
            const existing = list.find((item) => item?.id === savedId);
            const memberIds = Array.from(
              new Set([
                ...(Array.isArray(existing?.memberIds) ? existing.memberIds : []),
                ...(Array.isArray(edited?.memberIds) ? edited.memberIds : []),
              ])
            );
            const merged = {
              ...(existing || {}),
              ...(edited || {}),
              id: savedId,
              name: savedName,
              address: savedAddress,
              campus: String(existing?.campus || edited?.campus || ''),
              phone: String(existing?.phone || edited?.phone || ''),
              headMemberId: String(existing?.headMemberId || edited?.headMemberId || memberIds[0] || ''),
              memberIds,
            };
            return [...list.filter((item) => item && item.id !== pending.householdId && item.id !== savedId), merged];
          });
          setMembers((prev) =>
            (Array.isArray(prev) ? prev : []).map((m) =>
              m?.householdId === pending.householdId ? { ...m, householdId: savedId } : m
            )
          );
        } catch (error) {
          console.warn('Failed to save household', error);
        }
      })();
    }, 500);
  };

  const removeHouseholdMember = (householdId: string, memberId: string) => {
    setHouseholds((prev) =>
      prev.map((h) => {
        if (h.id !== householdId) return h;
        const memberIds = h.memberIds.filter((id) => id !== memberId);
        return {
          ...h,
          memberIds,
          headMemberId: h.headMemberId === memberId ? memberIds[0] || h.headMemberId : h.headMemberId,
        };
      })
    );
  };

  const addHouseholdMember = (
    householdId: string,
    input: {
      fullName: string;
      preferredName?: string;
      relationshipTitle?: string;
      householdRole: Member['householdRole'];
      age?: number;
    }
  ) => {
    const fullName = input.fullName.trim();
    const id = `mem_${Date.now()}`;
    const preferred = input.preferredName?.trim() || fullName.split(' ')[0] || fullName;
    const member: Member = {
      id,
      username: fullName.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '') || id,
      fullName,
      preferredName: preferred,
      role: 'MEMBER',
      summary: '',
      bio: '',
      email: '',
      phone: '',
      privacy: { showEmail: false, showPhone: false, showGiving: false },
      joinDate: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      lastActive: 'Just added',
      age: input.age,
      relationshipTitle: input.relationshipTitle?.trim() || input.householdRole,
      householdId,
      householdRole: input.householdRole,
      connectionStatus: 'connected',
      isFollowing: false,
      isOnline: false,
      volunteerBadges: [],
      journeyMilestones: [],
      attendanceStats: {
        totalServicesThisYear: 0,
        streakWeeks: 0,
        lastCheckedIn: '',
        serviceType: '',
      },
      recentUpdates: [],
      childLock:
        input.householdRole === 'Child'
          ? { isLocked: true, hideFromDirectory: true, hideContactInfo: true, ageThreshold: 13 }
          : undefined,
    };
    setMembers((prev) => [...prev, member]);
    void (async () => {
      const res = await fetchAuthorized('/api/vault?resource=people&subResource=member-household', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: input.fullName,
          preferredName: input.preferredName,
          householdRole: input.householdRole,
          age: input.age,
          birthday: input.dateOfBirth,
        }),
      });
      const data = await res.json().catch(() => ({}));
      const savedId = String(data?.memberId || '');
      if (!res.ok || !savedId) return;
      setMembers((prev) => prev.map((person) => (person.id === id ? { ...person, id: savedId } : person)));
      setHouseholds((prev) =>
        prev.map((household) =>
          household.id !== householdId
            ? household
            : {
                ...household,
                memberIds: household.memberIds.map((memberId) => (memberId === id ? savedId : memberId)),
                headMemberId: household.headMemberId === id ? savedId : household.headMemberId,
              }
        )
      );
    })();
    setHouseholds((prev) =>
      prev.map((h) => {
        if (h.id !== householdId) return h;
        return {
          ...h,
          memberIds: [...h.memberIds, id],
          headMemberId: input.householdRole === 'Head of Household' ? id : h.headMemberId,
        };
      })
    );
    return id;
  };

  const addExistingToMyHousehold = async (memberId: string, householdRole: Member['householdRole']) => {
    const res = await fetchAuthorized('/api/vault?resource=people&subResource=member-household', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ existingMemberId: memberId, householdRole }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok || !data?.household?.id) {
      return { ok: false, error: data?.error || 'Could not add that member to your household.' };
    }
    const householdId = String(data.household.id);
    const selfId = String(data.selfId || '');
    setMembers((prev) =>
      prev.map((person) =>
        person.id === memberId
          ? { ...person, householdId, householdRole, relationshipTitle: householdRole }
          : person
      )
    );
    setHouseholds((prev) => {
      const cleared = prev
        .map((item) => ({
          ...item,
          memberIds: item.memberIds.filter((id) => id !== memberId),
        }))
        .filter((item) => item.id === householdId || item.memberIds.length > 0);
      const memberIds = Array.from(new Set([selfId, memberId].filter(Boolean)));
      const existing = cleared.find((item) => item.id === householdId);
      if (existing) {
        return cleared.map((item) =>
          item.id === householdId
            ? {
                ...item,
                name: String(data.household.name || item.name),
                address: String(data.household.address || item.address || ''),
                memberIds: Array.from(new Set([...item.memberIds, ...memberIds])),
              }
            : item
        );
      }
      return [
        ...cleared,
        {
          id: householdId,
          name: String(data.household.name || 'Household'),
          address: String(data.household.address || ''),
          campus: '',
          memberIds,
          headMemberId: selfId || memberId,
          phone: '',
        },
      ];
    });
    return { ok: true };
  };

  const persistLinkedIdentity = async (updates: Partial<Member>) => {
    if (!linkedChurchRecord) return;
    const names = splitDisplayName(String(updates.fullName || ''));
    const body: Record<string, unknown> = {};
    if (updates.fullName !== undefined) {
      body.fullName = updates.fullName;
      body.preferredName = updates.preferredName || updates.fullName;
      body.firstName = names.firstName;
      body.lastName = names.lastName;
    }
    if (updates.title !== undefined) body.title = updates.title;
    if (updates.role !== undefined && String(userRole || '').toUpperCase() === 'SUPER_ADMIN') {
      body.role = updates.role;
    }
    if (updates.dateOfBirth !== undefined) body.birthday = normalizeBirthday(updates.dateOfBirth) || null;
    if (updates.bio !== undefined) {
      body.bio = String(updates.bio || '').trim().slice(0, 4000);
      writeMemberBio(currentUserId, String(body.bio));
    }
    if (updates.joinDate !== undefined) {
      const month = joinedMonthKey(String(updates.joinDate || ''));
      body.joinedOn = month ? `${month}-01` : null;
      writeMemberJoined(currentUserId, month);
    }
    if (updates.volunteerBadges !== undefined) {
      body.volunteerBadges = (updates.volunteerBadges || [])
        .filter((badge) => badge.active !== false)
        .map((badge) => ({ category: badge.category, active: true }));
      writeMemberBadges(currentUserId, updates.volunteerBadges || []);
    }
    if (updates.journeyMilestones !== undefined) {
      body.journeyMilestones = updates.journeyMilestones || [];
      writeMemberMilestones(currentUserId, updates.journeyMilestones || []);
    }
    if (updates.favoriteHuddles !== undefined || updates.favoriteHuddle !== undefined) {
      const huddles =
        updates.favoriteHuddles !== undefined
          ? huddlesFromList(updates.favoriteHuddles)
          : updates.favoriteHuddle?.id && updates.favoriteHuddle.name
            ? [{ id: updates.favoriteHuddle.id, name: updates.favoriteHuddle.name }]
            : [];
      body.favoriteHuddles = huddles;
      writeMemberFavoriteHuddles(currentUserId, huddles);
    }
    if (updates.isOnline !== undefined) {
      body.fellowshipOnline = Boolean(updates.isOnline);
      writeMemberPresence(currentUserId, { online: Boolean(updates.isOnline) });
    }
    if (updates.coverUrl !== undefined) {
      const cover = coverForSave(String(updates.coverUrl || ''));
      body.coverUrl = cover;
      writeMemberPresence(currentUserId, { coverUrl: cover });
    }
    if (updates.addressAs !== undefined) {
      const next = updates.addressAs === 'brother' || updates.addressAs === 'sister' ? updates.addressAs : null;
      body.addressAs = next;
      writeMemberAddress(currentUserId, next);
    }
    if (updates.avatarUrl !== undefined) {
      body.avatarUrl = String(updates.avatarUrl || '').trim();
      writeMemberAvatar(currentUserId, String(body.avatarUrl));
    }
    if (updates.phone !== undefined) {
      const self = members.find((m) => m.id === currentUser.id);
      const nextAge = updates.age !== undefined ? updates.age : self?.age;
      const nextRole = updates.householdRole || self?.householdRole;
      body.phone = mayHoldOwnContact({ age: nextAge, householdRole: nextRole }) ? updates.phone : '';
    }
    try {
      const res = await fetchAuthorized('/api/vault?resource=people&subResource=member-self', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const saved = await res.json().catch(() => ({}));
      const storedAvatar = String(saved?.avatarUrl || '').trim();
      if (res.ok && updates.avatarUrl !== undefined && storedAvatar) {
        writeMemberAvatar(currentUserId, storedAvatar);
        try {
          localStorage.setItem('awc_user_avatar', storedAvatar);
        } catch {
          /* The church profile still keeps the photo. */
        }
        if (storedAvatar !== String(updates.avatarUrl || '').trim()) {
          setMembers((prev) =>
            prev.map((person) =>
              person.id === currentUser.id || person.id === currentUserId
                ? { ...person, avatarUrl: storedAvatar }
                : person
            )
          );
        }
      }
    } catch (err) {
      console.warn('Could not save church member identity', err);
    }
  };

  const updateMemberAvatar = (id: string, avatarDataUrl: string) => {
    if (!mayReviseMember(id)) return;
    setMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, avatarUrl: avatarDataUrl } : m))
    );
    if (id === currentUser.id || id === currentUserId) {
      writeMemberAvatar(id, avatarDataUrl);
      if (currentUserId !== id) writeMemberAvatar(currentUserId, avatarDataUrl);
      void persistLinkedIdentity({ avatarUrl: avatarDataUrl });
    }
    const updatedMember = members.find((m) => m.id === id);
    setPushToast({
      id: 'toast_' + Date.now(),
      title: 'Profile Photo Updated',
      body: `${updatedMember?.fullName || 'Member'} updated their profile avatar.`,
      type: 'service_alert',
      timestamp: 'Just now',
      read: false,
    });
  };

  const updateMemberCover = (id: string, coverUrl: string) => {
    if (!mayReviseMember(id)) return;
    setMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, coverUrl } : m))
    );
    if (id === currentUser.id || id === currentUserId) {
      const cover = coverForSave(coverUrl);
      writeMemberPresence(id, { coverUrl: cover });
      if (currentUserId !== id) writeMemberPresence(currentUserId, { coverUrl: cover });
      void persistLinkedIdentity({ coverUrl: cover || '' });
    }
    const updatedMember = members.find((m) => m.id === id);
    setPushToast({
      id: 'toast_cover_' + Date.now(),
      title: 'Cover Banner Updated',
      body: `${updatedMember?.fullName || 'Member'} updated their profile cover banner.`,
      type: 'service_alert',
      timestamp: 'Just now',
      read: false,
    });
  };

  const toggleConnect = (targetMemberId: string) => {
    if (targetMemberId === currentUser.id) return;

    setMembers((prev) =>
      prev.map((m) => {
        if (m.id === targetMemberId) {
          const nextStatus: ConnectionStatus =
            m.connectionStatus === 'connected' ? 'none' : 'connected';
          return { ...m, connectionStatus: nextStatus };
        }
        return m;
      })
    );

    const target = members.find((m) => m.id === targetMemberId);
    if (target && target.connectionStatus !== 'connected') {
      const toast: ChurchNotification = {
        id: 'toast_conn_' + Date.now(),
        title: 'Fellowship Connected',
        body: `You are now connected with ${target.fullName}.`,
        type: 'connection',
        timestamp: 'Just now',
        read: false,
      };
      setPushToast(toast);
    }
  };

  const toggleFollow = (targetMemberId: string) => {
    if (targetMemberId === currentUser.id) return;
    setMembers((prev) =>
      prev.map((m) => {
        if (m.id === targetMemberId) {
          return { ...m, isFollowing: !m.isFollowing };
        }
        return m;
      })
    );
  };

  const openChatWith = (memberId: string) => {
    setActiveChatPartnerId(memberId);
  };

  const closeChat = () => {
    setActiveChatPartnerId(null);
  };

  const sendDirectMessage = (receiverId: string, content: string) => {
    if (!content.trim()) return;
    const newMsg: ChatMessage = {
      id: 'msg_' + Date.now(),
      senderId: currentUser.id,
      receiverId,
      content: content.trim(),
      timestamp: 'Just now',
      read: false,
    };
    setMessages((prev) => [...prev, newMsg]);
  };

  const addStatusUpdate = (memberId: string, content: string) => {
    if (!content.trim()) return;
    const newUpdate = {
      id: 'stat_' + Date.now(),
      authorId: memberId,
      content: content.trim(),
      timestamp: 'Just now',
      amenCount: 1,
      hasAmened: true,
    };

    setMembers((prev) =>
      prev.map((m) =>
        m.id === memberId
          ? { ...m, recentUpdates: [newUpdate, ...m.recentUpdates] }
          : m
      )
    );
  };

  const toggleAmen = (memberId: string, statusId: string) => {
    setMembers((prev) =>
      prev.map((m) => {
        if (m.id === memberId) {
          const updated = m.recentUpdates.map((u) => {
            if (u.id === statusId) {
              const nextState = !u.hasAmened;
              return {
                ...u,
                hasAmened: nextState,
                amenCount: nextState ? u.amenCount + 1 : Math.max(0, u.amenCount - 1),
              };
            }
            return u;
          });
          return { ...m, recentUpdates: updated };
        }
        return m;
      })
    );
  };

  const rememberOwnMilestones = (memberId: string, milestones: MembershipMilestone[]) => {
    if (memberId !== currentUser.id && memberId !== currentUserId) return;
    writeMemberMilestones(memberId, milestones);
    if (currentUserId !== memberId) writeMemberMilestones(currentUserId, milestones);
    void persistLinkedIdentity({ journeyMilestones: milestones });
  };

  const addMembershipMilestone = (
    memberId: string,
    milestone: Omit<MembershipMilestone, 'id'>
  ) => {
    if (!mayReviseMember(memberId)) return;
    const newMilestone: MembershipMilestone = {
      ...milestone,
      id: 'jm_' + Date.now(),
    };
    const current = members.find((person) => person.id === memberId);
    const next = [newMilestone, ...(current?.journeyMilestones || [])];
    setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, journeyMilestones: next } : m)));
    rememberOwnMilestones(memberId, next);
  };

  const updateMembershipMilestone = (
    memberId: string,
    milestoneId: string,
    updates: Partial<MembershipMilestone>
  ) => {
    if (!mayReviseMember(memberId)) return;
    const current = members.find((person) => person.id === memberId);
    const next = (current?.journeyMilestones || []).map((ms) =>
      ms.id === milestoneId ? { ...ms, ...updates } : ms
    );
    setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, journeyMilestones: next } : m)));
    rememberOwnMilestones(memberId, next);
  };

  const deleteMembershipMilestone = (memberId: string, milestoneId: string) => {
    if (!mayReviseMember(memberId)) return;
    const current = members.find((person) => person.id === memberId);
    const next = (current?.journeyMilestones || []).filter((ms) => ms.id !== milestoneId);
    setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, journeyMilestones: next } : m)));
    rememberOwnMilestones(memberId, next);
  };

  const addPrayerRequest = (
    request: Omit<PrayerRequest, 'id' | 'timestamp' | 'prayedCount' | 'hasPrayed'>
  ) => {
    const newRequest: PrayerRequest = {
      ...request,
      id: 'pr_' + Date.now(),
      timestamp: 'Just now',
      prayedCount: 1,
      hasPrayed: true,
    };
    setPrayerRequests((prev) => [newRequest, ...prev]);

    setPushToast({
      id: 'toast_pr_' + Date.now(),
      title: 'Prayer Request Posted',
      body: `"${request.title}" is now shared on the PLCC Church Community Prayer Wall.`,
      type: request.isUrgent ? 'urgent_prayer' : 'service_alert',
      timestamp: 'Just now',
      read: false,
      urgent: request.isUrgent,
    });
  };

  const togglePrayed = (requestId: string) => {
    setPrayerRequests((prev) =>
      prev.map((pr) => {
        if (pr.id === requestId) {
          const nextHasPrayed = !pr.hasPrayed;
          return {
            ...pr,
            hasPrayed: nextHasPrayed,
            prayedCount: nextHasPrayed
              ? pr.prayedCount + 1
              : Math.max(0, pr.prayedCount - 1),
          };
        }
        return pr;
      })
    );
  };

  const deletePrayerRequest = (requestId: string) => {
    setPrayerRequests((prev) => prev.filter((pr) => pr.id !== requestId));
  };

  const updatePrayerRequest = (requestId: string, updates: Partial<PrayerRequest>) => {
    setPrayerRequests((prev) =>
      prev.map((pr) => (pr.id === requestId ? { ...pr, ...updates } : pr))
    );
  };

  const rememberOwnPresence = (memberId: string, online: boolean) => {
    if (memberId !== currentUser.id && memberId !== currentUserId) return;
    writeMemberPresence(memberId, { online });
    if (currentUserId !== memberId) writeMemberPresence(currentUserId, { online });
    void persistLinkedIdentity({ isOnline: online });
  };

  const toggleMemberOnlineStatus = (memberId?: string) => {
    const targetId = memberId || currentUserId;
    if (!mayReviseMember(targetId)) return;
    const nextState = !members.find((person) => person.id === targetId)?.isOnline;
    setMembers((prev) =>
      prev.map((m) =>
        m.id === targetId
          ? {
              ...m,
              isOnline: nextState,
              lastActive: nextState ? 'Just now' : 'Offline',
            }
          : m
      )
    );
    rememberOwnPresence(targetId, nextState);
  };

  const setMemberOnlineStatus = (memberId: string, isOnline: boolean) => {
    if (!mayReviseMember(memberId)) return;
    setMembers((prev) =>
      prev.map((m) =>
        m.id === memberId
          ? {
              ...m,
              isOnline,
              lastActive: isOnline ? 'Just now' : 'Offline',
            }
          : m
      )
    );
    rememberOwnPresence(memberId, isOnline);
  };

  const dismissPushToast = () => {
    setPushToast(null);
  };

  // Track child IDs temporarily unlocked during the current session
  const [unlockedChildSessionIds, setUnlockedChildSessionIds] = useState<string[]>([]);

  const pastoralViewer = ['SUPER_ADMIN', 'PASTOR', 'ADMIN'].includes(String(userRole || '').toUpperCase());

  const isParentOrGuardianOf = (guardianId: string, childId: string): boolean => {
    if (guardianId !== currentUserId) return false;
    if (pastoralViewer) return true;
    return unlockedChildSessionIds.includes(childId);
  };

  const verifyParentPin = (childMemberId: string, pin: string): boolean => {
    const child = members.find((m) => m.id === childMemberId);
    const expectedPin = child?.childLock?.parentPin || '1234';
    return pin.trim() === expectedPin.trim();
  };

  const unlockChildForSession = (childMemberId: string) => {
    setUnlockedChildSessionIds((prev) => (prev.includes(childMemberId) ? prev : [...prev, childMemberId]));
    setPushToast({
      id: 'toast_' + Date.now(),
      title: 'Guardian Access Unlocked 🛡️',
      body: 'Child profile is now accessible for this session.',
      type: 'service_alert',
      timestamp: 'Just now',
      read: false,
    });
  };

  const lockChildForSession = (childMemberId: string) => {
    setUnlockedChildSessionIds((prev) => prev.filter((id) => id !== childMemberId));
  };

  const isChildProfileLockedForViewer = (child: Member, viewerId?: string): boolean => {
    if (!child.childLock?.isLocked) return false;
    if (unlockedChildSessionIds.includes(child.id)) return false;
    const actualViewerId = viewerId || currentUserId;
    if (isParentOrGuardianOf(actualViewerId, child.id)) {
      return false;
    }
    return true;
  };

  const toggleChildLock = (
    childMemberId: string,
    isLocked: boolean,
    customSettings?: Partial<ChildLockSettings>
  ) => {
    setMembers((prev) =>
      prev.map((m) => {
        if (m.id === childMemberId) {
          const defaultLock: ChildLockSettings = {
            isLocked: false,
            parentPin: '1234',
            hideFromDirectory: true,
            hideContactInfo: true,
            hidePhotos: false,
            ageThreshold: 13,
          };
          const currentLock = m.childLock || defaultLock;
          const updatedLock: ChildLockSettings = {
            ...currentLock,
            ...customSettings,
            isLocked,
            lockedByParentId: isLocked ? (customSettings?.lockedByParentId || currentUserId) : undefined,
            lockedByParentName: isLocked ? (customSettings?.lockedByParentName || currentUser.fullName) : undefined,
            lockedAt: isLocked ? new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined,
          };
          return {
            ...m,
            childLock: updatedLock,
          };
        }
        return m;
      })
    );

    if (isLocked) {
      setUnlockedChildSessionIds((prev) => prev.filter((id) => id !== childMemberId));
    }

    const child = members.find((m) => m.id === childMemberId);
    setPushToast({
      id: 'toast_' + Date.now(),
      title: isLocked ? 'Child Profile Locked 🔒' : 'Child Profile Unlocked 🛡️',
      body: isLocked
        ? `${child?.fullName || 'Child profile'} is protected. Sensitive details hidden based on age.`
        : `${child?.fullName || 'Child profile'} is now unlocked for church community view.`,
      type: 'service_alert',
      timestamp: 'Just now',
      read: false,
    });
  };

  const updateChildLockSettings = (childMemberId: string, settings: Partial<ChildLockSettings>) => {
    setMembers((prev) =>
      prev.map((m) => {
        if (m.id === childMemberId) {
          const currentLock = m.childLock || {
            isLocked: true,
            parentPin: '1234',
            hideFromDirectory: true,
            hideContactInfo: true,
            hidePhotos: false,
            ageThreshold: 13,
          };
          return {
            ...m,
            childLock: {
              ...currentLock,
              ...settings,
            },
          };
        }
        return m;
      })
    );

    setPushToast({
      id: 'toast_' + Date.now(),
      title: 'Child Privacy Settings Updated',
      body: 'Parental controls and age protection rules have been saved.',
      type: 'service_alert',
      timestamp: 'Just now',
      read: false,
    });
  };

  return (
    <ChurchContext.Provider
      value={{
        currentUser,
        switchCurrentUser,
        members,
        households,
        messages,
        selectedMemberId,
        setSelectedMemberId,
        selectedMember,
        rosterProfileNote,
        rosterProfileLoading,
        activeChatPartnerId,
        openChatWith,
        closeChat,
        isEditProfileOpen,
        setIsEditProfileOpen,
        isCropAvatarOpen,
        setIsCropAvatarOpen,
        isDirectoryModalOpen,
        setIsDirectoryModalOpen,
        openDirectoryModal,
        closeDirectoryModal,
        notifications,
        pushToast,
        dismissPushToast,
        prayerRequests,
        updateMemberProfile,
        linkedChurchRecord,
        selfProfileState,
        persistLinkedIdentity,
        updateHousehold,
        removeHouseholdMember,
        addHouseholdMember,
        addExistingToMyHousehold,
        updateMemberAvatar,
        updateMemberCover,
        toggleConnect,
        toggleFollow,
        sendDirectMessage,
        addStatusUpdate,
        toggleAmen,
        addMembershipMilestone,
        updateMembershipMilestone,
        deleteMembershipMilestone,
        addPrayerRequest,
        togglePrayed,
        deletePrayerRequest,
        updatePrayerRequest,
        toggleMemberOnlineStatus,
        setMemberOnlineStatus,
        navigateToMemberProfile,
        unlockedChildSessionIds,
        toggleChildLock,
        updateChildLockSettings,
        isParentOrGuardianOf,
        verifyParentPin,
        unlockChildForSession,
        lockChildForSession,
        isChildProfileLockedForViewer,
      }}
    >
      {children}
    </ChurchContext.Provider>
  );
};

export const useChurch = () => {
  const context = useContext(ChurchContext);
  if (!context) {
    throw new Error('useChurch must be used within a ChurchProvider');
  }
  return context;
};
