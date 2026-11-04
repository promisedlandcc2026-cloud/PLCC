export interface VideoSource {
  id: string;
  title: string;
  type: 'YouTube' | 'Vimeo' | 'Zoom' | 'Meet' | 'Custom';
  url: string;
  isDefault: boolean;
  scheduleNote?: string;
}

export interface ChatChannel {
  id: string;
  name: string;
  description: string;
  visibility?: string | null;
  /** Public image URL for WhatsApp /api/share-huddle card */
  share_image_url?: string | null;
  created_by?: string | null;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  userName: string;
  text: string;
  createdAt: number;
  role?: string;
  isAi?: boolean;
  avatarUrl?: string | null;
  userId?: string | null;
}

const STORAGE_KEYS = {
  VIDEO_SOURCES: 'community_video_sources',
  CHANNELS: 'community_chat_channels',
  MESSAGES: 'community_chat_messages',
  USER_PROFILE: 'community_user_profile',
  CURRENT_ROLE: 'current_role'
};

const DEFAULT_CHANNELS: ChatChannel[] = [
  { id: 'announcements', name: 'announcements', description: 'Important church-wide news' },
  { id: 'prayer-ops', name: 'prayer-ops', description: 'Real-time intercessory coordination' }
];

export const communityStorage = {
  getVideoSources: (): VideoSource[] => {
    const data = localStorage.getItem(STORAGE_KEYS.VIDEO_SOURCES);
    return data ? JSON.parse(data) : [];
  },
  // Added missing method to save video sources to local storage
  saveVideoSources: (sources: VideoSource[]) => {
    localStorage.setItem(STORAGE_KEYS.VIDEO_SOURCES, JSON.stringify(sources));
    window.dispatchEvent(new Event('storage_sync'));
  },
  getChannels: (): ChatChannel[] => {
    const data = localStorage.getItem(STORAGE_KEYS.CHANNELS);
    return data ? JSON.parse(data) : DEFAULT_CHANNELS;
  },
  saveChannels: (channels: ChatChannel[]) => {
    localStorage.setItem(STORAGE_KEYS.CHANNELS, JSON.stringify(channels));
    window.dispatchEvent(new Event('storage_sync'));
  },
  getMessages: (): ChatMessage[] => {
    const data = localStorage.getItem(STORAGE_KEYS.MESSAGES);
    return data ? JSON.parse(data) : [];
  },
  saveMessages: (messages: ChatMessage[]) => {
    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages));
    // Trigger local event for same-tab updates and storage event for cross-tab
    window.dispatchEvent(new Event('storage_sync'));
  },
  getUserProfile: () => {
    const name = localStorage.getItem(STORAGE_KEYS.USER_PROFILE) || 'ADMIN';
    const role = localStorage.getItem(STORAGE_KEYS.CURRENT_ROLE) || 'ADMIN';
    return { name, role };
  },
  setUserProfile: (name: string, role: string) => {
    localStorage.setItem(STORAGE_KEYS.USER_PROFILE, name);
    localStorage.setItem(STORAGE_KEYS.CURRENT_ROLE, role);
    window.dispatchEvent(new Event('storage_sync'));
  }
};