export type MemberRole = 'SUPER_ADMIN' | 'PASTOR' | 'LEADER' | 'VOLUNTEER' | 'MEMBER';

export type ConnectionStatus = 'none' | 'pending_sent' | 'pending_received' | 'connected';

export interface VolunteerBadge {
  id: string;
  name: string;
  category: 'Outreach' | 'Worship' | 'Hospitality' | 'Tech & Media' | 'Ushering' | 'Children';
  tier: 'Bronze' | 'Silver' | 'Gold' | 'Leader';
  hours: number;
  iconName: string;
  description: string;
  earnedDate: string;
  /** Omitted or true means the badge is awarded. Admins can turn it off. */
  active?: boolean;
}

export interface StatusUpdate {
  id: string;
  authorId: string;
  content: string;
  timestamp: string;
  amenCount: number;
  hasAmened: boolean;
}

export interface MembershipMilestone {
  id: string;
  title: string;
  date: string;
  category: 'Baptism' | 'Membership' | 'Leadership' | 'Discipleship' | 'Ordination' | 'Service';
  description: string;
  officiatedBy?: string;
}

export interface ChildLockSettings {
  isLocked: boolean;
  lockedByParentId?: string;
  lockedByParentName?: string;
  parentPin?: string; // 4-digit security PIN for parent unlock
  hideFromDirectory?: boolean; // Hide from public church directory
  hideContactInfo?: boolean; // Mask phone & email
  hidePhotos?: boolean; // Mask or blur child photo
  ageThreshold?: number; // Lock if under this age (e.g. 13 or 18)
  lockedAt?: string;
  note?: string;
}

export interface Member {
  id: string;
  username: string;
  fullName: string;
  preferredName?: string;
  title?: string;
  role: MemberRole;
  avatarUrl?: string;
  coverUrl?: string;
  summary: string;
  bio: string;
  favoriteHuddle?: { id: string; name: string } | null;
  favoriteHuddles?: { id: string; name: string }[];
  age?: number;
  dateOfBirth?: string;
  relationshipTitle?: string;
  childLock?: ChildLockSettings;
  email: string;
  phone: string;
  privacy: {
    showEmail: boolean;
    showPhone: boolean;
    showGiving: boolean;
  };
  joinDate: string;
  lastActive: string;
  householdId: string;
  householdRole: 'Head of Household' | 'Spouse' | 'Youth' | 'Child' | 'Independent Member';
  addressAs?: 'brother' | 'sister' | null;
  connectionStatus: ConnectionStatus;
  isFollowing: boolean;
  isOnline: boolean;
  volunteerBadges: VolunteerBadge[];
  journeyMilestones: MembershipMilestone[];
  attendanceStats: {
    totalServicesThisYear: number;
    streakWeeks: number;
    lastCheckedIn: string;
    serviceType: string;
  };
  givingSummary?: {
    status: 'Faithful' | 'Active' | 'Pledged';
    pledgeCampaign: string;
    ytdTithe: number;
  };
  recentUpdates: StatusUpdate[];
}

export interface Household {
  id: string;
  name: string;
  address: string;
  campus: string;
  memberIds: string[];
  headMemberId: string;
  phone: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  timestamp: string;
  read: boolean;
}

export interface PrayerRequest {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  title: string;
  category: 'Healing & Health' | 'Family & Marriage' | 'Spiritual Growth' | 'Financial Provision' | 'Youth & School' | 'Praise Report';
  description: string;
  timestamp: string;
  prayedCount: number;
  hasPrayed: boolean;
  isUrgent: boolean;
  isAnonymous: boolean;
}

export interface ChurchNotification {
  id: string;
  title: string;
  body: string;
  type: 'urgent_prayer' | 'service_alert' | 'event' | 'direct_message' | 'connection';
  timestamp: string;
  read: boolean;
  urgent?: boolean;
  targetMemberId?: string;
}

export type ActiveTab = 'dashboard' | 'members' | 'profile' | 'households' | 'community' | 'prayer_wall' | 'volunteers';
