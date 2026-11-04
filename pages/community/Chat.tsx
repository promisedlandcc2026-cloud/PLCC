import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus, Hash, Info, Send, ArrowLeft, Smile, Paperclip, AtSign,
  X, Loader2, CornerDownLeft, Bot, Mic, ShieldCheck, MoreHorizontal,
  Reply, Trash2, FileText, Image as ImageIcon, Users, ClipboardList,
  Link2, Upload, Check, Share2, ChevronDown,
} from 'lucide-react';
import { ChatChannel } from '../../lib/communityStorage';
import { highlightMentions } from '../../lib/mentions';
import { useNav } from '../../App';
import { GoogleGenAI } from '@google/genai';
import NewChannelModal from '../../components/Community/NewChannelModal';
import ManageChannelMembersModal from '../../components/Community/ManageChannelMembersModal';
import VoiceHuddle from '../../components/Community/VoiceHuddle';
import HuddleAttendancePanel, {
  canViewHuddleAttendanceUi,
} from '../../components/Community/HuddleAttendancePanel';
import CommunityIdentityNav from '../../components/Community/CommunityIdentityNav';
import { fetchWithTimeout, getAuthHeaders, isAbortOrTimeoutError, vaultFetch } from '../../lib/api';
import { useVaultPoll } from '../../lib/useVaultPoll';
import {
  formatChannelHuddleBadge,
  formatHeaderHuddleLabel,
  formatHuddleParticipantAria,
} from '../../api/_utils/livekitVoice.js';
import {
  buildHuddlePreviewShareUrl,
  decideHuddleInviteDeepLink,
  HUDDLE_INVITE_INTENT_KEY,
  parseHuddleInviteIntent,
} from '../../api/_utils/huddleInvite.js';
import { shouldAutoScrollHuddleChat } from '../../api/_utils/huddleChat.js';

const CHANNEL_CREATE_ROLES = new Set([
  'SUPER_ADMIN',
  'PASTOR',
  'ADMIN',
  'ADMIN_STAFF',
  'FIRST_LADY',
  'SECRETARY',
  'ASST_SECRETARY',
  'MINISTRY_LEADER',
]);

const QUICK_REACTIONS = ['❤️', '🙏', '👍', '🙌', '😂', '😮'];
const MAX_FILE_BYTES = 10 * 1024 * 1024;

type ReactionRow = { id?: string; message_id: string; user_id: string; emoji: string };
type AttachmentRow = {
  id: string;
  original_filename?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  kind?: string | null;
  signed_url?: string | null;
};
type ParentPreview = {
  id: string;
  user_name?: string | null;
  content?: string | null;
  is_deleted?: boolean;
  avatar_url?: string | null;
};

type UiMessage = {
  id: string;
  channelId: string;
  userName: string;
  userId: string | null;
  avatarUrl?: string | null;
  text: string;
  createdAt: number;
  isAi?: boolean;
  isDeleted?: boolean;
  parentId?: string | null;
  parent?: ParentPreview | null;
  reactions: ReactionRow[];
  attachments: AttachmentRow[];
};

function AvatarBubble({
  name,
  avatarUrl,
  isAi,
  className,
}: {
  name: string;
  avatarUrl?: string | null;
  isAi?: boolean;
  className: string;
}) {
  if (isAi) {
    return (
      <div className={className}>
        <Bot size={16} />
      </div>
    );
  }
  if (avatarUrl) {
    return <img src={avatarUrl} alt="" className={`${className} object-cover`} />;
  }
  return <div className={className}>{(name || '?').charAt(0)}</div>;
}

function formatBytes(n?: number | null) {
  if (!n || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function aggregateReactions(rows: ReactionRow[], currentUserId?: string | null) {
  const map = new Map<string, { emoji: string; count: number; mine: boolean }>();
  for (const r of rows || []) {
    const cur = map.get(r.emoji) || { emoji: r.emoji, count: 0, mine: false };
    cur.count += 1;
    if (currentUserId && r.user_id === currentUserId) cur.mine = true;
    map.set(r.emoji, cur);
  }
  return [...map.values()];
}

const ChatPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { userRole, userName, userId, userAvatar, isAuthenticated } = useNav();
  const canCreateChannel = CHANNEL_CREATE_ROLES.has(String(userRole || ''));
  const canViewHuddleAttendance = canViewHuddleAttendanceUi(userRole);
  const [attendancePanelOpen, setAttendancePanelOpen] = useState(false);
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeChannel, setActiveChannel] = useState<ChatChannel | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isVoiceHuddleOpen, setIsVoiceHuddleOpen] = useState(false);
  const [huddleOpenedFromInvite, setHuddleOpenedFromInvite] = useState(false);
  const [huddleInviteEndedNotice, setHuddleInviteEndedNotice] = useState(false);
  const [huddleByChannel, setHuddleByChannel] = useState<
    Record<string, { active: boolean; participantCount: number }>
  >({});
  const [inVoiceHuddleChannelId, setInVoiceHuddleChannelId] = useState<string | null>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [staff, setStaff] = useState<any[]>([]);
  const [staffLoaded, setStaffLoaded] = useState(false);
  const [unreadByChannel, setUnreadByChannel] = useState<Record<string, number>>({});
  const [deepLinkChannelHandled, setDeepLinkChannelHandled] = useState(false);
  const huddleIntentConsumedRef = useRef<string | null>(null);

  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  const [showChannelPanel, setShowChannelPanel] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1280px)').matches : true
  );

  // Phone back / browser back: leave the open channel before leaving Chat.
  useEffect(() => {
    if (mobileView !== 'chat') return;
    const token = 'awcChatMobileBack';
    if (!(window.history.state && (window.history.state as { awcChatMobileBack?: boolean }).awcChatMobileBack)) {
      window.history.pushState({ ...(window.history.state || {}), [token]: true }, '');
    }
    const onPop = () => {
      setMobileView('list');
      setShowChannelPanel(false);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [mobileView]);

  const goToChannelList = () => {
    setShowChannelPanel(false);
    if (
      mobileView === 'chat' &&
      window.history.state &&
      (window.history.state as { awcChatMobileBack?: boolean }).awcChatMobileBack
    ) {
      window.history.back();
      return;
    }
    setMobileView('list');
  };
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isManageMembersOpen, setIsManageMembersOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

  const [replyTo, setReplyTo] = useState<UiMessage | null>(null);
  const [reactPickerFor, setReactPickerFor] = useState<string | null>(null);
  const [mobileMenuFor, setMobileMenuFor] = useState<string | null>(null);

  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [pendingMentionIds, setPendingMentionIds] = useState<string[]>([]);
  const [mentionCandidates, setMentionCandidates] = useState<
    { id: string; name: string; avatar_url?: string | null }[]
  >([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  /** Message created but attachment upload failed — retry uploads only (no duplicate row). */
  const [pendingAttachmentRetryId, setPendingAttachmentRetryId] = useState<string | null>(null);
  const [whatsappLinkCopied, setWhatsappLinkCopied] = useState(false);
  const [shareCardBusy, setShareCardBusy] = useState(false);
  const [shareCardError, setShareCardError] = useState<string | null>(null);
  const [shareCardSuccess, setShareCardSuccess] = useState<string | null>(null);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);

  const scrollBottomRef = useRef<HTMLDivElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const pinnedToBottomRef = useRef(true);
  const forceScrollRef = useRef(false);
  const sendingRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shareCardInputRef = useRef<HTMLInputElement>(null);

  const activeVis = String((activeChannel as any)?.visibility || '').toLowerCase();
  const canManageActiveChannel =
    Boolean(activeChannel) &&
    (activeVis === 'private' || activeVis === 'ministry') &&
    (canCreateChannel ||
      String((activeChannel as any)?.created_by || '') === String(userId || ''));
  const canUseVoiceHuddle = Boolean(activeChannel) && activeVis !== 'dm';
  const canUploadShareCard =
    Boolean(activeChannel) &&
    activeVis !== 'dm' &&
    (canCreateChannel ||
      canManageActiveChannel ||
      String((activeChannel as any)?.created_by || '') === String(userId || ''));

  const mapApiMessage = (m: any): UiMessage => ({
    id: m.id,
    channelId: m.channel_id,
    userName: m.display_name || m.user_name || 'Staff',
    userId: m.user_id || null,
    avatarUrl: m.avatar_url || null,
    text: m.is_deleted ? '' : m.content || '',
    createdAt: new Date(m.created_at).getTime(),
    isAi: m.user_name === 'Vault AI' && !m.user_id,
    isDeleted: Boolean(m.is_deleted || m.deleted_at),
    parentId: m.parent_id || null,
    parent: m.parent || null,
    reactions: m.reactions || [],
    attachments: m.attachments || [],
  });

  const fetchUnread = async () => {
    try {
      const res = await vaultFetch(
        `/api/vault?resource=community&subResource=chat&subResource=unread-count`
      );
      if (res.ok) {
        const data = await res.json();
        setUnreadByChannel(data.byChannel || {});
      }
    } catch (e) {
      console.error('Failed to fetch unread', e);
    }
  };

  const fetchHuddleStatuses = async (channelList: ChatChannel[]) => {
    if (!isAuthenticated || !userId) {
      setHuddleByChannel({});
      return;
    }
    const ids = (channelList || [])
      .filter((c) => String((c as any).visibility || '').toLowerCase() !== 'dm')
      .map((c) => c.id)
      .filter(Boolean);
    if (ids.length === 0) {
      setHuddleByChannel({});
      return;
    }
    try {
      const headers = await getAuthHeaders();
      const res = await fetchWithTimeout(
        `/api/vault?resource=community&subResource=chat&subResource=voice-huddle-statuses&channelIds=${encodeURIComponent(ids.join(','))}`,
        { headers },
        12_000
      );
      if (!res.ok) {
        // Fail soft — omit LIVE badges
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data?.ok && data.byChannel && typeof data.byChannel === 'object') {
        setHuddleByChannel(data.byChannel);
      }
    } catch (e) {
      console.warn('Failed to fetch voice huddle statuses', e);
    }
  };

  const fetchChannels = async () => {
    setChannelsError(null);
    setIsLoading(true);
    try {
      const loadOnce = async () => {
        const headers = await getAuthHeaders();
        // Cold Vercel + large channel lists can exceed 15s; keep a hard ceiling.
        return fetchWithTimeout(
          '/api/vault?resource=community&subResource=chat&subResource=channels',
          { headers },
          45_000
        );
      };

      let res: Response;
      try {
        res = await loadOnce();
      } catch (firstErr) {
        if (!isAbortOrTimeoutError(firstErr)) throw firstErr;
        console.warn('Channels fetch timed out; retrying once…', firstErr);
        res = await loadOnce();
      }

      if (res.ok) {
        const data = await res.json();
        setChannels(data);
        // Initial selection; ?channel= deep-link effect may override after load (ACL-safe list only).
        if (data.length > 0) {
          setActiveChannel((prev) => {
            if (prev) return prev;
            const lastId = localStorage.getItem('last_chat_channel');
            return data.find((c: any) => c.id === lastId) || data[0];
          });
        }
        // Presence ASAP so LIVE badges appear for open huddles on other accounts.
        void fetchHuddleStatuses(Array.isArray(data) ? data : []);
      } else {
        const data = await res.json().catch(() => ({}));
        setChannelsError(data?.error || `Could not load channels (${res.status})`);
      }
    } catch (e) {
      console.warn('Failed to fetch channels', e);
      setChannelsError(
        isAbortOrTimeoutError(e)
          ? 'Chat timed out loading channels. Tap Retry (cold starts can be slow).'
          : 'Could not load channels. Retry or refresh the page.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const markChannelRead = async (channelId: string) => {
    try {
      await vaultFetch('/api/vault?resource=community&subResource=chat&subResource=mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId }),
        timeoutMs: 12_000,
      });
    } catch (e) {
      console.error('Failed to mark channel read', e);
    }
  };

  const fetchMessages = async (channelId: string, rethrow = false) => {
    try {
      const res = await vaultFetch(
        `/api/vault?resource=community&subResource=chat&subResource=messages&channelId=${channelId}`,
        { timeoutMs: 20_000 }
      );
      if (res.ok) {
        const data = await res.json();
        setMessages((data || []).map(mapApiMessage));
        localStorage.setItem('last_chat_read', new Date().toISOString());
        setUnreadByChannel((prev) => {
          const next = { ...prev };
          delete next[channelId];
          return next;
        });
        await markChannelRead(channelId);
        fetchUnread();
      }
    } catch (e) {
      console.error('Failed to fetch messages', e);
      if (rethrow) throw e;
    }
  };

  const fetchStaff = async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/vault?resource=community&subResource=chat&subResource=mentors', {
        headers,
      });
      if (res.ok) {
        const data = await res.json();
        setStaff(Array.isArray(data) ? data : []);
      } else {
        setStaff([]);
      }
    } catch (e) {
      console.error('Failed to fetch staff', e);
      setStaff([]);
    } finally {
      setStaffLoaded(true);
    }
  };

  const fetchMentionCandidates = async (channelId: string, q: string) => {
    try {
      setMentionLoading(true);
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/vault?resource=community&subResource=chat&subResource=mention-candidates&channelId=${encodeURIComponent(channelId)}&q=${encodeURIComponent(q)}`,
        { headers }
      );
      if (res.ok) {
        const data = await res.json();
        setMentionCandidates(Array.isArray(data) ? data : []);
      } else {
        setMentionCandidates([]);
      }
    } catch (e) {
      console.error('Failed to fetch mention candidates', e);
      setMentionCandidates([]);
    } finally {
      setMentionLoading(false);
    }
  };

  useEffect(() => {
    fetchChannels();
    fetchStaff();
    fetchUnread();
    localStorage.setItem('last_chat_read', new Date().toISOString());
  }, []);

  // Notification / share deep-link: /community/chat?channel=<uuid>[&huddle=1]
  // Channels endpoint is ACL-filtered — inaccessible ids simply do not select (no error toast).
  // Ended huddles still open the channel; presence polling shows Join Huddle or inactive header.
  // huddle=1 is one-time open-intent only — never auto-connects LiveKit / mic / camera.
  const deepChannelId = String(searchParams.get('channel') || '').trim();
  const deepHuddleIntent = parseHuddleInviteIntent(searchParams.get(HUDDLE_INVITE_INTENT_KEY));

  const stripHuddleIntentParam = () => {
    setSearchParams(
      (prev) => {
        if (!prev.has(HUDDLE_INVITE_INTENT_KEY)) return prev;
        const next = new URLSearchParams(prev);
        next.delete(HUDDLE_INVITE_INTENT_KEY);
        return next;
      },
      { replace: true }
    );
  };

  useEffect(() => {
    setDeepLinkChannelHandled(false);
    huddleIntentConsumedRef.current = null;
    setHuddleInviteEndedNotice(false);
  }, [deepChannelId]);

  useEffect(() => {
    if (isLoading || !channels.length || deepLinkChannelHandled) return;
    if (!deepChannelId) {
      setDeepLinkChannelHandled(true);
      return;
    }
    const deepChannel = channels.find((c) => c.id === deepChannelId);
    setDeepLinkChannelHandled(true);
    if (!deepChannel) return;
    setActiveChannel(deepChannel);
    localStorage.setItem('last_chat_channel', deepChannel.id);
    setMobileView('chat');
  }, [isLoading, channels, deepChannelId, deepLinkChannelHandled]);

  // Phase 3G.1: after ACL channel select, consume huddle=1 once → open pre-join if live.
  useEffect(() => {
    if (!isAuthenticated || !userId) return;
    if (!deepLinkChannelHandled || !deepChannelId || !deepHuddleIntent) return;
    if (huddleIntentConsumedRef.current === deepChannelId) return;

    const accessible = channels.find((c) => c.id === deepChannelId);
    if (!accessible) {
      huddleIntentConsumedRef.current = deepChannelId;
      stripHuddleIntentParam();
      return;
    }
    if (String((accessible as any).visibility || '').toLowerCase() === 'dm') {
      huddleIntentConsumedRef.current = deepChannelId;
      stripHuddleIntentParam();
      return;
    }
    if (!activeChannel || activeChannel.id !== deepChannelId) return;

    let cancelled = false;
    (async () => {
      let huddleActive = false;
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(
          `/api/vault?resource=community&subResource=chat&subResource=voice-huddle-status&channelId=${encodeURIComponent(deepChannelId)}`,
          { headers }
        );
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          huddleActive = Boolean(data.active) && Number(data.participantCount || 0) > 0;
          setHuddleByChannel((prev) => ({
            ...prev,
            [deepChannelId]: {
              active: huddleActive,
              participantCount: Number(data.participantCount || 0),
            },
          }));
        }
      } catch {
        huddleActive = false;
      }
      if (cancelled) return;

      const decision = decideHuddleInviteDeepLink({
        huddleIntent: true,
        channelAccessible: true,
        huddleActive,
      });

      // Consume intent before open/close so re-renders cannot reopen the modal.
      huddleIntentConsumedRef.current = deepChannelId;
      stripHuddleIntentParam();

      if (decision === 'open_prejoin') {
        setHuddleOpenedFromInvite(true);
        setIsVoiceHuddleOpen(true);
        setHuddleInviteEndedNotice(false);
        return;
      }
      if (decision === 'ended') {
        setHuddleInviteEndedNotice(true);
        setHuddleOpenedFromInvite(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally omit searchParams object identity; deepHuddleIntent + channel drive this once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isAuthenticated,
    userId,
    deepLinkChannelHandled,
    deepChannelId,
    deepHuddleIntent,
    channels,
    activeChannel,
  ]);

  // Batch LiveKit huddle presence for loaded channels (15–30s cadence).
  useEffect(() => {
    if (!isAuthenticated || !userId) {
      setHuddleByChannel({});
      setInVoiceHuddleChannelId(null);
      return;
    }
    if (!channels.length) return;

    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void fetchHuddleStatuses(channels);
    };

    tick();
    const interval = window.setInterval(tick, 10000);
    const onVis = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [channels, isAuthenticated, userId]);

  // After closing the huddle modal, refresh batch status so LIVE badges settle.
  useEffect(() => {
    if (isVoiceHuddleOpen) return;
    if (!isAuthenticated || !userId || !channels.length) return;
    const t = window.setTimeout(() => {
      void fetchHuddleStatuses(channels);
    }, 800);
    return () => window.clearTimeout(t);
  }, [isVoiceHuddleOpen, isAuthenticated, userId, channels]);

  useEffect(() => {
    if (!showMentionPicker || !activeChannel?.id) {
      setMentionCandidates([]);
      return;
    }
    const handle = window.setTimeout(() => {
      void fetchMentionCandidates(activeChannel.id, mentionQuery);
    }, 150);
    return () => window.clearTimeout(handle);
  }, [showMentionPicker, activeChannel?.id, mentionQuery]);

  useVaultPoll(
    async () => {
      if (activeChannel?.id) await fetchMessages(activeChannel.id, true);
    },
    { intervalMs: 5000, enabled: Boolean(activeChannel?.id), deps: [activeChannel?.id] }
  );

  const onMessageListScroll = useCallback(() => {
    const el = messageListRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    pinnedToBottomRef.current = shouldAutoScrollHuddleChat({ distanceFromBottom: distance });
  }, []);

  const scrollMessagesToBottom = useCallback((smooth = true) => {
    const el = messageListRef.current;
    if (el) {
      if (smooth) {
        scrollBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      } else {
        el.scrollTop = el.scrollHeight;
      }
    } else {
      scrollBottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    }
    pinnedToBottomRef.current = true;
  }, []);

  useEffect(() => {
    if (forceScrollRef.current || pinnedToBottomRef.current) {
      forceScrollRef.current = false;
      scrollMessagesToBottom(true);
    }
  }, [messages, activeChannel, scrollMessagesToBottom]);

  const handleSelectChannel = (channel: ChatChannel) => {
    setActiveChannel(channel);
    setReplyTo(null);
    setReactPickerFor(null);
    setMobileMenuFor(null);
    setPendingAttachmentRetryId(null);
    pinnedToBottomRef.current = true;
    forceScrollRef.current = true;
    localStorage.setItem('last_chat_channel', channel.id);
    localStorage.setItem('last_chat_read', new Date().toISOString());
    setMobileView('chat');
  };

  const processAiResponse = async (userText: string, channelId: string) => {
    if (!userText.toLowerCase().includes('@vault')) return;
    setIsAiThinking(true);
    try {
      let statsContext = '';
      try {
        const headers = await getAuthHeaders();
        const statsRes = await fetch('/api/vault?resource=organization&subResource=church-stats', {
          headers,
        });
        const statsData = await statsRes.json();
        if (statsData.ok) {
          statsContext = `\nLIVE SYSTEM METRICS:\n- Total Members: ${statsData.stats.members}\n- MTD Giving: $${statsData.stats.mtdGiving.toLocaleString()}\n- Recent Attendance: ${statsData.stats.recentAttendance}`;
        }
      } catch (e) {
        console.error('Chat AI Sync Error:', e);
      }

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        config: {
          systemInstruction: `You are Vault AI, an embedded participant in the PLCC Admin Chat. You help staff with ministry coordination, giving insights, and member data. Tone: Authoritative but Kind. Mention the user by name if possible. ${statsContext}`,
        },
      });

      const headers = await getAuthHeaders();
      await fetch('/api/vault?resource=community&subResource=chat&subResource=ai-message', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId,
          content: response.text || 'Administrative protocol engaged. How else can I assist?',
        }),
      });
      fetchMessages(channelId);
    } catch (e) {
      console.error('AI Participation Error:', e);
    } finally {
      setIsAiThinking(false);
    }
  };

  const uploadAttachment = async (messageId: string, file: File) => {
    const headers = await getAuthHeaders();
    const dataUrl = await fileToBase64(file);
    const res = await fetch('/api/vault?resource=community&subResource=chat&subResource=attachments', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messageId,
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        fileBase64: dataUrl,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Upload failed');
    }
    return res.json();
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeChannel || uploading || sendingRef.current || isSending) return;

    const draftText = inputText.trim();
    const file = selectedFile;
    const mentionIds = [...pendingMentionIds];
    const parentId = replyTo?.id || null;

    // Retry path: message already exists; only re-upload the file.
    if (pendingAttachmentRetryId) {
      if (!file) {
        setAttachError('Re-select the file to finish uploading the attachment.');
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        setAttachError('File too large (max 10MB)');
        return;
      }
      setAttachError(null);
      setUploading(true);
      try {
        await uploadAttachment(pendingAttachmentRetryId, file);
        setPendingAttachmentRetryId(null);
        setSelectedFile(null);
        setAttachError(null);
        forceScrollRef.current = true;
        fetchMessages(activeChannel.id);
      } catch (uploadErr: any) {
        setAttachError(
          `${uploadErr?.message || 'Attachment upload failed'} — Send again to retry the upload only.`
        );
      } finally {
        setUploading(false);
        if (window.innerWidth > 768) inputRef.current?.focus();
      }
      return;
    }

    if (!draftText && !file) return;
    setAttachError(null);

    if (file && file.size > MAX_FILE_BYTES) {
      setAttachError('File too large (max 10MB)');
      return;
    }

    // Single-flight: clear draft before await so double Enter cannot re-post.
    sendingRef.current = true;
    setIsSending(true);
    setInputText('');
    setShowEmojiPicker(false);
    setShowMentionPicker(false);
    setPendingMentionIds([]);
    setReplyTo(null);
    setSelectedFile(null);
    pinnedToBottomRef.current = true;
    forceScrollRef.current = true;

    try {
      setUploading(Boolean(file));
      const headers = await getAuthHeaders();
      const res = await fetch('/api/vault?resource=community&subResource=chat&subResource=messages', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: activeChannel.id,
          content: draftText,
          parent_id: parentId,
          mentionedUserIds: mentionIds,
          attachmentPending: Boolean(file),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to send');
      }

      const created = await res.json();

      if (file && created?.id) {
        try {
          await uploadAttachment(created.id, file);
          setPendingAttachmentRetryId(null);
        } catch (uploadErr: any) {
          setPendingAttachmentRetryId(created.id);
          setSelectedFile(file);
          setAttachError(
            `${uploadErr?.message || 'Attachment upload failed'} — Message saved without the file. Send again to retry the upload only.`
          );
          forceScrollRef.current = true;
          fetchMessages(activeChannel.id);
          return;
        }
      }

      forceScrollRef.current = true;
      fetchMessages(activeChannel.id);
      if (draftText) processAiResponse(draftText, activeChannel.id);
    } catch (err: any) {
      console.error('Failed to send message', err);
      // Restore draft so the user can retry a failed send.
      setInputText(draftText);
      setPendingMentionIds(mentionIds);
      if (parentId) {
        /* reply preview already cleared; user can re-reply if needed */
      }
      if (file) setSelectedFile(file);
      setAttachError(err?.message || 'Failed to send message');
    } finally {
      sendingRef.current = false;
      setIsSending(false);
      setUploading(false);
      if (window.innerWidth > 768) inputRef.current?.focus();
    }
  };

  const toggleReaction = async (messageId: string, emoji: string, mine: boolean) => {
    try {
      const headers = await getAuthHeaders();
      if (mine) {
        await fetch(
          `/api/vault?resource=community&subResource=chat&subResource=reactions&messageId=${encodeURIComponent(messageId)}&emoji=${encodeURIComponent(emoji)}`,
          { method: 'DELETE', headers }
        );
      } else {
        await fetch('/api/vault?resource=community&subResource=chat&subResource=reactions', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId, emoji }),
        });
      }
      if (activeChannel) fetchMessages(activeChannel.id);
    } catch (e) {
      console.error('Reaction failed', e);
    } finally {
      setReactPickerFor(null);
      setMobileMenuFor(null);
    }
  };

  const handleDeleteMessage = async (msg: UiMessage) => {
    if (!msg.userId || msg.userId !== userId) return;
    if (!window.confirm('Delete this message?')) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/vault?resource=community&subResource=chat&subResource=delete-message', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: msg.id }),
      });
      if (res.ok && activeChannel) fetchMessages(activeChannel.id);
    } catch (e) {
      console.error('Delete failed', e);
    } finally {
      setMobileMenuFor(null);
    }
  };

  const insertMention = (person: { id: string; name: string }) => {
    const first = String(person.name || '').trim().split(/\s+/)[0] || 'Member';
    const token = `@${first}`;
    setInputText((prev) => {
      const at = prev.lastIndexOf('@');
      if (showMentionPicker && at >= 0) {
        return `${prev.slice(0, at)}${token} `;
      }
      return `${prev}${prev.endsWith(' ') || !prev ? '' : ' '}${token} `;
    });
    setPendingMentionIds((prev) => (prev.includes(person.id) ? prev : [...prev, person.id]));
    setShowMentionPicker(false);
    setMentionQuery('');
    inputRef.current?.focus();
  };

  const onInputChange = (value: string) => {
    setInputText(value);
    const at = value.lastIndexOf('@');
    if (at >= 0) {
      const after = value.slice(at + 1);
      if (!after.includes(' ') && after.length <= 40) {
        setShowMentionPicker(true);
        setMentionQuery(after);
        return;
      }
    }
    if (!value.endsWith('@')) {
      // keep picker closed unless trailing @query
      if (!value.includes('@') || value.endsWith(' ')) setShowMentionPicker(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setAttachError('File too large (max 10MB)');
      setSelectedFile(null);
      return;
    }
    setAttachError(null);
    setSelectedFile(file);
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    // Dropping the file abandons a pending upload retry (message text already saved).
    if (pendingAttachmentRetryId) {
      setPendingAttachmentRetryId(null);
      setAttachError('Attachment retry cancelled. The message was kept without a file.');
    }
  };

  const openDm = (person: { id: string }) => {
    navigate(`/community/chat/dm?partnerId=${encodeURIComponent(person.id)}`);
  };

  const buildChannelWhatsAppShareUrl = (channelId: string, bustCache = false) => {
    const origin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'https://plcc-opal.vercel.app';
    const base = buildHuddlePreviewShareUrl({ origin, channelId });
    if (!base) return null;
    // Bust WhatsApp's preview cache after uploading a new card.
    return bustCache ? `${base}&v=${Date.now().toString(36)}` : base;
  };

  const copyWhatsAppHuddleLink = async (opts?: {
    bustCache?: boolean;
    keepMenuOpen?: boolean;
  }) => {
    if (!activeChannel?.id) return;
    const url = buildChannelWhatsAppShareUrl(activeChannel.id, Boolean(opts?.bustCache));
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setWhatsappLinkCopied(true);
      if (!opts?.keepMenuOpen) setShareMenuOpen(false);
      setTimeout(() => setWhatsappLinkCopied(false), 2000);
    } catch {
      window.prompt('Copy WhatsApp Huddle link', url);
    }
  };

  const compressShareCardFile = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read image'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Invalid image'));
        img.onload = () => {
          const maxEdge = 1000;
          const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(String(reader.result || ''));
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.72));
        };
        img.src = String(reader.result || '');
      };
      reader.readAsDataURL(file);
    });

  useEffect(() => {
    if (!shareMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('[data-channel-share-menu]')) return;
      setShareMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [shareMenuOpen]);

  useEffect(() => {
    setShareMenuOpen(false);
    setShareCardError(null);
    setShareCardSuccess(null);
  }, [activeChannel?.id]);

  const uploadChannelShareCard = async (file: File) => {
    if (!activeChannel?.id || shareCardBusy) return;
    setShareCardBusy(true);
    setShareCardError(null);
    setShareCardSuccess(null);
    try {
      const dataUrl = await compressShareCardFile(file);
      const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
      const uploadRes = await fetch(
        '/api/vault?resource=community&subResource=chat&subResource=share-image',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            channelId: activeChannel.id,
            imageBase64: dataUrl,
            contentType: 'image/jpeg',
          }),
        }
      );
      const uploadData = await uploadRes.json().catch(() => ({}));
      if (!uploadRes.ok || !uploadData?.ok || !uploadData?.url) {
        setShareCardError(
          uploadData?.error ||
            'Could not upload WhatsApp card. If this keeps failing, run add_chat_channel_share_image.sql in Supabase.'
        );
        setShareMenuOpen(true);
        return;
      }
      const updated = uploadData.channel || {
        ...activeChannel,
        share_image_url: String(uploadData.url),
      };
      setActiveChannel(updated);
      setChannels((prev) =>
        prev.map((c) => (c.id === activeChannel.id ? { ...c, ...updated } : c))
      );
      setShareCardSuccess('WhatsApp card saved — fresh link copied for WhatsApp.');
      setShareMenuOpen(true);
      await copyWhatsAppHuddleLink({ bustCache: true, keepMenuOpen: true });
    } catch {
      setShareCardError('Could not upload WhatsApp card.');
      setShareMenuOpen(true);
    } finally {
      setShareCardBusy(false);
      if (shareCardInputRef.current) shareCardInputRef.current.value = '';
    }
  };

  const canDeleteChannel = (channel: ChatChannel | null | undefined) => {
    if (!channel || !userId) return false;
    const vis = String((channel as any).visibility || '').toLowerCase();
    if (vis === 'dm' || vis === 'leadership') return false;
    if (Boolean((channel as any).is_announcement)) return false;
    if (String((channel as any).slug || '').toLowerCase() === 'leadership-briefing') return false;
    const role = String(userRole || '').toUpperCase();
    const broadAdmin = [
      'SUPER_ADMIN',
      'PASTOR',
      'ADMIN',
      'ADMIN_STAFF',
      'FIRST_LADY',
      'SECRETARY',
      'ASST_SECRETARY',
    ].includes(role);
    if (broadAdmin) return true;
    return String((channel as any).created_by || '') === String(userId);
  };

  const handleDeleteChannel = async (channel: ChatChannel, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (!canDeleteChannel(channel)) return;
    if (
      !window.confirm(
        `Delete #${channel.name}? Messages in this channel will be permanently removed.`
      )
    ) {
      return;
    }
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/vault?resource=community&subResource=chat&subResource=channels&channelId=${encodeURIComponent(channel.id)}`,
        { method: 'DELETE', headers }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(data?.error || 'Unable to delete channel');
        return;
      }
      const remaining = channels.filter((c) => c.id !== channel.id);
      setChannels(remaining);
      setUnreadByChannel((prev) => {
        const next = { ...prev };
        delete next[channel.id];
        return next;
      });
      setHuddleByChannel((prev) => {
        const next = { ...prev };
        delete next[channel.id];
        return next;
      });
      if (activeChannel?.id === channel.id) {
        const nextActive = remaining[0] || null;
        setActiveChannel(nextActive);
        if (nextActive?.id) {
          localStorage.setItem('last_chat_channel', nextActive.id);
        } else {
          localStorage.removeItem('last_chat_channel');
        }
      }
    } catch (err) {
      console.error('Failed to delete channel', err);
      window.alert('Unable to delete channel');
    }
  };

  const activeHuddleMeta = useMemo(() => {
    const activeId = activeChannel?.id || '';
    const huddle = activeId ? huddleByChannel[activeId] : undefined;
    const polledCount =
      huddle?.active && Number(huddle.participantCount) > 0
        ? Number(huddle.participantCount)
        : 0;
    const inHuddle = Boolean(
      inVoiceHuddleChannelId && inVoiceHuddleChannelId === activeId
    );
    // Local join counts as LIVE even before the next LiveKit poll (cross-browser lag).
    const liveCount = Math.max(polledCount, inHuddle ? 1 : 0);
    return { liveCount, inHuddle, isLive: liveCount > 0 };
  }, [activeChannel?.id, huddleByChannel, inVoiceHuddleChannelId]);

  const channelTypeLabel = useMemo(() => {
    const visibility = String(activeChannel?.visibility || '').toLowerCase();
    if (visibility === 'dm') return 'Direct message';
    if (visibility === 'ministry') return 'Ministry channel';
    if (visibility === 'public' || String(activeChannel?.type || '').toLowerCase() === 'public') {
      return 'Open channel';
    }
    return 'Private channel';
  }, [activeChannel]);

  const communityMembers = useMemo(() => {
    return (staff || [])
      .filter((person) => person?.id)
      .map((person) => {
        const displayName = String(
          person.displayName || person.name || person.memberName || person.email || 'Unnamed'
        ).trim();
        return { ...person, displayName };
      });
  }, [staff]);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-[#F9F9F7] font-inter pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
      <CommunityIdentityNav active="chat" variant="compact" />
      <div className="relative flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden">
      <aside
        className={`${mobileView === 'list' ? 'flex' : 'hidden md:flex'} w-full md:w-60 lg:w-64 border-r border-gray-100 flex-col bg-white shrink-0 h-full`}
      >
        <div className="px-4 lg:px-3.5 border-b border-gray-100 flex items-center justify-between shrink-0 h-16 lg:h-14">
          <div className="flex items-center gap-2.5 lg:gap-2">
            <div className="w-9 h-9 lg:w-8 lg:h-8 rounded-xl bg-burgundy flex items-center justify-center text-gold shadow-lg shadow-burgundy/10">
              <ShieldCheck size={18} />
            </div>
            <div>
              <span className="block font-black text-xs lg:text-[12px] tracking-tight text-[#0d1a14] uppercase">
                Communications
              </span>
              <span className="block text-[8px] font-bold text-gold uppercase tracking-widest">Authorized Node</span>
            </div>
          </div>
          {canCreateChannel ? (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="p-1.5 text-burgundy hover:bg-gold-cream rounded-xl transition-all"
              aria-label="Create channel"
            >
              <Plus size={18} />
            </button>
          ) : null}
        </div>

        <div className="p-3 lg:p-2.5 flex-1 overflow-y-auto custom-scrollbar space-y-4 lg:space-y-3">
          <div className="px-1 lg:px-0.5">
            <p className="text-[9px] font-black text-gray-300 uppercase tracking-[0.22em] mb-2 lg:mb-1.5">
              Ministry Channels
            </p>
            <nav className="space-y-0.5">
              {channels.map((channel) => {
                const unread = unreadByChannel[channel.id] || 0;
                const active = activeChannel?.id === channel.id;
                const huddle = huddleByChannel[channel.id];
                const liveCount =
                  huddle?.active && Number(huddle.participantCount) > 0
                    ? Number(huddle.participantCount)
                    : 0;
                const liveBadge = formatChannelHuddleBadge(liveCount);
                const deletable = canDeleteChannel(channel);
                return (
                  <div
                    key={channel.id}
                    className={`group/channel flex items-center rounded-xl transition-all ${
                      active
                        ? 'bg-burgundy text-gold shadow-md shadow-burgundy/15'
                        : 'text-gray-400 hover:bg-gray-50 hover:text-burgundy'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectChannel(channel)}
                      className="flex-1 min-w-0 flex items-center px-3 py-2.5 lg:py-2 text-[13px] font-bold text-left"
                    >
                      <Hash
                        size={14}
                        className={`mr-2 shrink-0 ${active ? 'text-gold' : 'text-gray-200'}`}
                        strokeWidth={3}
                      />
                      <span className="truncate flex-1 min-w-0">{channel.name}</span>
                      {liveBadge ? (
                        <span
                          className={`ml-1 shrink-0 inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md border ${
                            active
                              ? 'bg-white/10 text-gold border-gold/30'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                          }`}
                          title={formatHuddleParticipantAria(liveCount)}
                          aria-label={formatHuddleParticipantAria(liveCount)}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"
                            aria-hidden
                          />
                          {liveBadge}
                        </span>
                      ) : null}
                      {unread > 0 && !active ? (
                        <span className="ml-1 min-w-[18px] h-[18px] px-1 rounded-full bg-gold text-[#0d1a14] text-[9px] font-black flex items-center justify-center">
                          {unread > 9 ? '9+' : unread}
                        </span>
                      ) : null}
                    </button>
                    {deletable ? (
                      <button
                        type="button"
                        onClick={(e) => handleDeleteChannel(channel, e)}
                        className={`mr-1.5 p-1.5 rounded-lg shrink-0 opacity-70 md:opacity-0 md:group-hover/channel:opacity-100 focus:opacity-100 transition-opacity ${
                          active
                            ? 'text-gold/80 hover:bg-white/10 hover:text-gold'
                            : 'text-gray-300 hover:bg-red-50 hover:text-red-600'
                        }`}
                        aria-label={`Delete ${channel.name}`}
                        title="Delete channel"
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </nav>
          </div>
        </div>

        <div className="p-3 lg:p-2.5 border-t border-gray-50 bg-gray-50/50">
          <div className="flex items-center gap-2.5 p-2 rounded-xl bg-white border border-gray-100 shadow-sm">
            <div className="w-8 h-8 rounded-lg bg-burgundy overflow-hidden shrink-0">
              {userAvatar ? (
                <img src={userAvatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gold text-[10px] font-black">
                  {(userName || '?').charAt(0)}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <span className="block text-[11px] font-black text-[#0d1a14] truncate">{userName || 'Member'}</span>
              <span className="block text-[8px] font-bold text-gray-300 uppercase tracking-widest truncate">
                {String(userRole || '')}
              </span>
            </div>
          </div>
        </div>
      </aside>

      <main className={`${mobileView === 'chat' ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0 h-full`}>
        <header className="relative z-50 px-3 md:px-5 border-b border-black/[0.06] flex items-center justify-between bg-white shrink-0 h-14 gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              className="md:hidden relative z-50 p-2 -ml-1 text-burgundy rounded-xl hover:bg-burgundy/5 h-9 w-9 flex items-center justify-center"
              onClick={goToChannelList}
              aria-label="Back to channels"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="min-w-0">
              <h2 className="font-bold text-[#0d1a14] text-[15px] tracking-tight truncate flex items-center gap-1.5">
                <Hash size={15} className="text-burgundy/50 shrink-0" />
                {activeChannel?.name || (isLoading ? 'Loading…' : 'Select a channel')}
              </h2>
              <p className="text-[11px] text-gray-400 font-medium truncate">
                {activeChannel?.description ||
                  (isLoading ? 'Connecting to chat…' : 'Choose a ministry channel')}
              </p>
              {shareCardError ? (
                <p className="text-[11px] text-red-600 font-medium truncate" role="alert">
                  {shareCardError}
                </p>
              ) : shareCardSuccess ? (
                <p className="text-[11px] text-emerald-700 font-medium truncate" role="status">
                  {shareCardSuccess}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {canUseVoiceHuddle ? (
              <div className="relative" data-channel-share-menu>
                <input
                  ref={shareCardInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadChannelShareCard(f);
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShareMenuOpen((v) => !v)}
                  className={`inline-flex items-center gap-1.5 h-9 px-2.5 rounded-xl text-[11px] font-semibold border transition-colors ${
                    shareMenuOpen || whatsappLinkCopied
                      ? 'bg-burgundy text-gold border-burgundy'
                      : 'bg-white text-[#0d1a14] border-black/[0.08] hover:border-burgundy/25 hover:bg-burgundy/[0.03]'
                  }`}
                  aria-label="Share for WhatsApp"
                  aria-expanded={shareMenuOpen}
                  aria-haspopup="menu"
                  title="Share for WhatsApp"
                >
                  {whatsappLinkCopied ? <Check size={15} /> : <Share2 size={15} />}
                  <span className="hidden md:inline">
                    {whatsappLinkCopied ? 'Copied' : 'Share'}
                  </span>
                  <ChevronDown
                    size={14}
                    className={`hidden sm:block opacity-60 transition-transform ${
                      shareMenuOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {shareMenuOpen ? (
                  <div
                    role="menu"
                    className="absolute right-0 top-[calc(100%+6px)] z-[60] w-64 rounded-2xl border border-black/[0.06] bg-white py-1.5 shadow-[0_12px_40px_rgba(13, 26, 20,0.12)]"
                  >
                    {(activeChannel as any)?.share_image_url ? (
                      <div className="px-3.5 pt-2 pb-2.5 border-b border-black/[0.05]">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                          Current card
                        </p>
                        <img
                          src={String((activeChannel as any).share_image_url)}
                          alt=""
                          className="w-full h-28 object-cover rounded-xl border border-black/[0.06] bg-gray-50"
                        />
                      </div>
                    ) : null}
                    {shareCardError ? (
                      <p className="px-3.5 py-2 text-[11px] font-medium text-red-600 leading-snug" role="alert">
                        {shareCardError}
                      </p>
                    ) : null}
                    {shareCardSuccess ? (
                      <p className="px-3.5 py-2 text-[11px] font-medium text-emerald-700 leading-snug" role="status">
                        {shareCardSuccess}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => void copyWhatsAppHuddleLink({ bustCache: true })}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-medium text-[#0d1a14] hover:bg-burgundy/[0.04]"
                      aria-label="Copy WhatsApp link"
                    >
                      <Link2 size={16} className="text-burgundy shrink-0" />
                      <span className="min-w-0">
                        <span className="block leading-tight">Copy WhatsApp link</span>
                        <span className="block text-[11px] font-normal text-gray-400 leading-tight mt-0.5">
                          Preview shows your channel card
                        </span>
                      </span>
                    </button>
                    {canUploadShareCard ? (
                      <button
                        type="button"
                        role="menuitem"
                        disabled={shareCardBusy}
                        onClick={() => shareCardInputRef.current?.click()}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-medium text-[#0d1a14] hover:bg-burgundy/[0.04] disabled:opacity-50"
                        aria-label="Upload WhatsApp card"
                      >
                        {shareCardBusy ? (
                          <Loader2 size={16} className="animate-spin text-burgundy shrink-0" />
                        ) : (
                          <Upload size={16} className="text-burgundy shrink-0" />
                        )}
                        <span className="min-w-0">
                          <span className="block leading-tight">
                            {shareCardBusy ? 'Uploading…' : 'Upload WhatsApp card'}
                          </span>
                          <span className="block text-[11px] font-normal text-gray-400 leading-tight mt-0.5">
                            {(activeChannel as any)?.share_image_url
                              ? 'Replace channel preview image'
                              : 'Set channel preview image'}
                          </span>
                        </span>
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {canManageActiveChannel ? (
              <button
                type="button"
                onClick={() => setIsManageMembersOpen(true)}
                className="inline-flex items-center justify-center h-9 w-9 rounded-xl bg-white text-[#0d1a14] border border-black/[0.08] hover:border-burgundy/25 hover:bg-burgundy/[0.03] transition-colors"
                aria-label="Members"
                title="Members"
              >
                <Users size={16} />
              </button>
            ) : null}

            {canUseVoiceHuddle && canViewHuddleAttendance ? (
              <button
                type="button"
                onClick={() => setAttendancePanelOpen((v) => !v)}
                className={`inline-flex items-center justify-center h-9 w-9 rounded-xl border transition-colors ${
                  attendancePanelOpen
                    ? 'bg-burgundy text-gold border-burgundy'
                    : 'bg-white text-[#0d1a14] border-black/[0.08] hover:border-burgundy/25 hover:bg-burgundy/[0.03]'
                }`}
                aria-pressed={attendancePanelOpen}
                aria-label="Huddle attendance"
                title="Attendance"
                data-huddle-attendance-chat-toggle="true"
              >
                <ClipboardList size={16} aria-hidden />
              </button>
            ) : null}

            {canUseVoiceHuddle ? (
              (() => {
                const activeId = activeChannel?.id || '';
                const huddle = huddleByChannel[activeId];
                const polledCount =
                  huddle?.active && Number(huddle.participantCount) > 0
                    ? Number(huddle.participantCount)
                    : 0;
                const inHuddle = Boolean(
                  inVoiceHuddleChannelId && inVoiceHuddleChannelId === activeId
                );
                const liveCount = Math.max(polledCount, inHuddle ? 1 : 0);
                const label = formatHeaderHuddleLabel({
                  participantCount: liveCount,
                  inHuddle,
                });
                const isLive = liveCount > 0;
                const askToJoin = isLive && !inHuddle;
                return (
                  <button
                    type="button"
                    onClick={() => {
                      setHuddleOpenedFromInvite(false);
                      setIsVoiceHuddleOpen(true);
                    }}
                    className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-[11px] font-bold tracking-wide border transition-colors ${
                      askToJoin
                        ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                        : isLive
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                          : 'bg-[#0d1a14] text-[#f5e6c8] border-[#0d1a14] hover:bg-[#0b1410]'
                    }`}
                    aria-label={
                      isLive
                        ? `${label}. ${formatHuddleParticipantAria(liveCount)}`
                        : 'Live Huddle'
                    }
                    data-huddle-ask-to-join={askToJoin ? 'true' : undefined}
                  >
                    {isLive ? (
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          askToJoin ? 'bg-white' : 'bg-emerald-500'
                        } ${askToJoin || inHuddle ? 'animate-pulse' : ''}`}
                        aria-hidden
                      />
                    ) : (
                      <Mic size={14} aria-hidden />
                    )}
                    <span className="hidden sm:inline">{label}</span>
                    <span className="sm:hidden">
                      {isLive
                        ? inHuddle
                          ? `In · ${liveCount}`
                          : `Ask · ${liveCount}`
                        : 'Huddle'}
                    </span>
                  </button>
                );
              })()
            ) : null}

            <button
              className={`inline-flex items-center justify-center h-9 w-9 rounded-xl border transition-colors ${
                showChannelPanel
                  ? 'text-burgundy bg-gold-cream/70 border-gold/30'
                  : 'text-gray-400 bg-white border-black/[0.08] hover:text-burgundy hover:border-burgundy/25'
              }`}
              type="button"
              aria-label={showChannelPanel ? 'Hide channel details' : 'Show channel details'}
              aria-pressed={showChannelPanel}
              onClick={() => setShowChannelPanel((v) => !v)}
            >
              <Info size={16} />
            </button>
          </div>
        </header>

        {huddleInviteEndedNotice ? (
          <div
            className="mx-3 mt-2 md:mx-6 lg:mx-8 flex items-start justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm"
            role="status"
            data-huddle-invite-ended="true"
          >
            <p className="text-[12px] font-semibold text-burgundy leading-snug">
              This Huddle has ended.
            </p>
            <button
              type="button"
              onClick={() => setHuddleInviteEndedNotice(false)}
              className="shrink-0 p-1 rounded-lg text-gray-300 hover:text-burgundy focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              aria-label="Dismiss ended huddle notice"
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        ) : null}

        {canUseVoiceHuddle &&
        activeHuddleMeta.isLive &&
        !activeHuddleMeta.inHuddle &&
        !isVoiceHuddleOpen ? (
          <div
            className="mx-3 mt-2 md:mx-6 lg:mx-8 flex items-center justify-between gap-3 rounded-2xl border border-emerald-300/80 bg-gradient-to-r from-emerald-600 to-emerald-500 px-3.5 py-3 shadow-[0_0_24px_rgba(16,185,129,0.45)]"
            role="status"
            data-huddle-ask-banner="true"
          >
            <div className="min-w-0 flex items-center gap-2.5">
              <span
                className="w-2.5 h-2.5 rounded-full bg-white animate-pulse shrink-0 shadow-[0_0_10px_rgba(255,255,255,0.8)]"
                aria-hidden
              />
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white">
                  Live Huddle
                </p>
                <p className="text-[12px] font-semibold text-emerald-50 leading-snug truncate">
                  {activeHuddleMeta.liveCount} in voice · tap to join with mic
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {canViewHuddleAttendance ? (
                <button
                  type="button"
                  onClick={() => setAttendancePanelOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-900/30 text-white font-black text-[10px] uppercase tracking-widest border border-white/25 hover:bg-emerald-900/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  data-huddle-attendance-live-entry="true"
                  aria-label="See who is in the huddle"
                >
                  <ClipboardList size={13} aria-hidden />
                  Who’s here
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setHuddleOpenedFromInvite(false);
                  setIsVoiceHuddleOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white text-emerald-700 font-black text-[10px] uppercase tracking-widest shadow-[0_0_16px_rgba(255,255,255,0.55)] hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                data-huddle-ask-to-join="true"
                aria-label={`Ask to join Live Huddle. ${formatHuddleParticipantAria(activeHuddleMeta.liveCount)}`}
              >
                <Mic size={13} aria-hidden />
                Ask to Join
              </button>
            </div>
          </div>
        ) : null}

        {canUseVoiceHuddle && canViewHuddleAttendance && attendancePanelOpen && activeChannel ? (
          <div
            className="mx-3 mt-2 md:mx-6 lg:mx-8"
            data-huddle-attendance-history-panel="true"
          >
            <HuddleAttendancePanel
              channelId={activeChannel.id}
              pollMs={activeHuddleMeta.isLive ? 9000 : 0}
              preferHistory={!activeHuddleMeta.isLive}
              onClose={() => setAttendancePanelOpen(false)}
            />
          </div>
        ) : null}

        <div
          ref={messageListRef}
          onScroll={onMessageListScroll}
          className="flex-1 overflow-y-auto scrolling-touch px-3 md:px-6 lg:px-6 xl:px-8 py-4 lg:py-3 space-y-3.5 lg:space-y-3 custom-scrollbar bg-[#FDFDFB]"
          data-chat-message-list="true"
        >
          {isLoading ? (
            <div className="h-full flex items-center justify-center text-gray-300 text-xs font-bold uppercase tracking-widest">
              <Loader2 className="animate-spin mr-2" size={16} /> Loading
            </div>
          ) : channelsError ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 gap-3">
              <p className="text-sm font-bold text-[#0d1a14] max-w-sm">{channelsError}</p>
              <button
                type="button"
                onClick={() => {
                  setIsLoading(true);
                  void fetchChannels();
                }}
                className="px-4 py-2 rounded-xl bg-burgundy text-gold text-xs font-black uppercase tracking-widest"
              >
                Retry
              </button>
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-30">
              <Hash size={32} className="text-gold/20 mb-3" />
              <h4 className="text-base font-black text-[#0d1a14] uppercase tracking-tighter">Beginning of Corridor</h4>
            </div>
          ) : (
            <div className="w-full max-w-3xl mx-auto space-y-3.5 lg:space-y-3">
            {messages.map((msg) => {
              const reactionGroups = aggregateReactions(msg.reactions, userId);
              const isMine = Boolean(msg.userId && msg.userId === userId);
              return (
                <div key={msg.id} className="flex items-start gap-2.5 lg:gap-3 group relative">
                  <AvatarBubble
                    name={msg.userName}
                    avatarUrl={msg.avatarUrl}
                    isAi={msg.isAi}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-[11px] shadow-sm shrink-0 border overflow-hidden ${
                      msg.isAi
                        ? 'bg-gold text-white border-gold/20'
                        : isMine
                          ? 'bg-burgundy text-gold border-burgundy/10'
                          : 'bg-white text-burgundy border-gray-200'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-black text-[#0d1a14] text-[13px] uppercase tracking-tight">
                        {msg.userName}
                      </span>
                      <span className="text-[8px] text-gray-300 font-bold uppercase tracking-widest">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {/* Desktop hover actions */}
                      {!msg.isDeleted && (
                        <div className="hidden md:flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity ml-auto">
                          <button
                            type="button"
                            className="p-1 rounded-md text-gray-300 hover:text-burgundy hover:bg-burgundy/5"
                            title="React"
                            onClick={() =>
                              setReactPickerFor((id) => (id === msg.id ? null : msg.id))
                            }
                          >
                            <Smile size={14} />
                          </button>
                          <button
                            type="button"
                            className="p-1 rounded-md text-gray-300 hover:text-burgundy hover:bg-burgundy/5"
                            title="Reply"
                            onClick={() => {
                              setReplyTo(msg);
                              inputRef.current?.focus();
                            }}
                          >
                            <Reply size={14} />
                          </button>
                          {isMine ? (
                            <button
                              type="button"
                              className="p-1 rounded-md text-gray-300 hover:text-red-600 hover:bg-red-50"
                              title="Delete"
                              onClick={() => handleDeleteMessage(msg)}
                            >
                              <Trash2 size={14} />
                            </button>
                          ) : null}
                        </div>
                      )}
                      {/* Mobile overflow */}
                      {!msg.isDeleted && (
                        <button
                          type="button"
                          className="md:hidden ml-auto p-1 text-gray-300"
                          aria-label="Message actions"
                          onClick={() => setMobileMenuFor((id) => (id === msg.id ? null : msg.id))}
                        >
                          <MoreHorizontal size={16} />
                        </button>
                      )}
                    </div>

                    {mobileMenuFor === msg.id && !msg.isDeleted ? (
                      <div className="md:hidden mb-1.5 flex flex-wrap gap-1">
                        <button
                          type="button"
                          className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white border border-gray-100 text-burgundy"
                          onClick={() => setReactPickerFor(msg.id)}
                        >
                          React
                        </button>
                        <button
                          type="button"
                          className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white border border-gray-100 text-burgundy"
                          onClick={() => {
                            setReplyTo(msg);
                            setMobileMenuFor(null);
                            inputRef.current?.focus();
                          }}
                        >
                          Reply
                        </button>
                        {isMine ? (
                          <button
                            type="button"
                            className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white border border-red-100 text-red-600"
                            onClick={() => handleDeleteMessage(msg)}
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    ) : null}

                    {reactPickerFor === msg.id ? (
                      <div className="mb-1.5 flex gap-1 bg-white border border-gray-100 rounded-xl px-2 py-1.5 shadow-sm w-fit">
                        {QUICK_REACTIONS.map((emoji) => {
                          const mine = reactionGroups.some((g) => g.emoji === emoji && g.mine);
                          return (
                            <button
                              key={emoji}
                              type="button"
                              className={`text-base leading-none p-1 rounded-md hover:bg-gray-50 ${mine ? 'ring-1 ring-burgundy/30 bg-burgundy/5' : ''}`}
                              onClick={() => toggleReaction(msg.id, emoji, mine)}
                            >
                              {emoji}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}

                    <div
                      className={`text-[14px] leading-relaxed break-words px-3.5 py-2.5 rounded-2xl rounded-tl-none shadow-sm border ${
                        msg.isAi
                          ? 'bg-gold-cream border-gold/20 text-[#0d1a14] italic'
                          : isMine
                            ? 'bg-white border-burgundy/5 text-gray-800'
                            : 'bg-white border-gray-100 text-gray-700'
                      }`}
                    >
                      {msg.parent ? (
                        <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-black/[0.03] border-l-2 border-gold/50 text-[11px]">
                          <span className="font-black text-burgundy/70 uppercase tracking-wide text-[9px]">
                            {msg.parent.is_deleted
                              ? 'Original message unavailable'
                              : `Replying to ${msg.parent.user_name || 'Member'}`}
                          </span>
                          {!msg.parent.is_deleted && msg.parent.content ? (
                            <p className="text-gray-500 truncate mt-0.5">{msg.parent.content}</p>
                          ) : null}
                        </div>
                      ) : null}

                      {msg.isDeleted ? (
                        <span className="italic text-gray-400 text-[13px]">This message was deleted</span>
                      ) : (
                        <>
                          {msg.text ? <div>{highlightMentions(msg.text)}</div> : null}
                          {msg.attachments?.length > 0 ? (
                            <div className={`space-y-2 ${msg.text ? 'mt-2' : ''}`}>
                              {msg.attachments.map((att) => {
                                const isImage =
                                  att.kind === 'image' || String(att.mime_type || '').startsWith('image/');
                                if (isImage && att.signed_url) {
                                  return (
                                    <a
                                      key={att.id}
                                      href={att.signed_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="block"
                                    >
                                      <img
                                        src={att.signed_url}
                                        alt={att.original_filename || 'attachment'}
                                        className="max-h-40 rounded-lg border border-gray-100 object-cover"
                                      />
                                    </a>
                                  );
                                }
                                return (
                                  <a
                                    key={att.id}
                                    href={att.signed_url || '#'}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-gray-50 border border-gray-100 hover:border-burgundy/20 text-[12px] font-bold text-burgundy"
                                  >
                                    {isImage ? <ImageIcon size={14} /> : <FileText size={14} />}
                                    <span className="truncate flex-1">{att.original_filename || 'File'}</span>
                                    <span className="text-[9px] text-gray-400 font-bold">
                                      {formatBytes(att.size_bytes)}
                                    </span>
                                  </a>
                                );
                              })}
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>

                    {reactionGroups.length > 0 && !msg.isDeleted ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {reactionGroups.map((g) => (
                          <button
                            key={g.emoji}
                            type="button"
                            onClick={() => toggleReaction(msg.id, g.emoji, g.mine)}
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] border ${
                              g.mine
                                ? 'bg-burgundy/10 border-burgundy/25 text-[#0d1a14]'
                                : 'bg-white border-gray-100 text-gray-500'
                            }`}
                          >
                            <span>{g.emoji}</span>
                            <span className="font-bold text-[10px]">{g.count}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
            </div>
          )}
          {isAiThinking && (
            <div className="w-full max-w-3xl mx-auto flex items-start gap-2.5 animate-pulse">
              <div className="w-8 h-8 rounded-lg bg-gold-cream flex items-center justify-center text-gold border border-gold/10">
                <Loader2 className="animate-spin" size={16} />
              </div>
              <div className="bg-gray-50 border border-gray-100 px-4 py-2.5 rounded-2xl rounded-tl-none">
                <span className="text-xs font-bold text-gray-400 italic">Vault AI is indexing…</span>
              </div>
            </div>
          )}
          <div ref={scrollBottomRef} className="h-2 max-w-3xl mx-auto" />
        </div>

        <footer className="p-3 md:p-4 lg:p-3 bg-white border-t border-gray-100 shrink-0">
          <div className="w-full max-w-3xl mx-auto">
            {replyTo ? (
              <div className="mb-2 flex items-start gap-2 px-3 py-2 rounded-xl bg-gold-cream/40 border border-gold/20">
                <Reply size={14} className="text-gold mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black text-burgundy uppercase tracking-wide">
                    Replying to {replyTo.userName}
                  </p>
                  <p className="text-[12px] text-gray-500 truncate">{replyTo.text || 'Message'}</p>
                </div>
                <button type="button" className="p-1 text-gray-400 hover:text-burgundy" onClick={() => setReplyTo(null)}>
                  <X size={14} />
                </button>
              </div>
            ) : null}

            {attachError ? (
              <p className="mb-2 text-[11px] font-bold text-red-600">{attachError}</p>
            ) : null}

            <div className="bg-gray-50 border border-gray-200 rounded-2xl lg:rounded-xl p-1.5 shadow-inner focus-within:ring-4 focus-within:ring-burgundy/5 focus-within:bg-white focus-within:border-burgundy/20 transition-all relative">
              <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
              {selectedFile && (
                <div className="absolute top-0 right-8 -translate-y-1/2 bg-gold-cream text-burgundy text-[9px] font-black px-3 py-1 rounded-full border border-gold/30 shadow-lg flex items-center gap-1.5 z-10">
                  <Paperclip size={11} />
                  {selectedFile.name}
                  <button
                    type="button"
                    onClick={clearSelectedFile}
                    className="ml-0.5 hover:text-black"
                    aria-label="Remove attachment"
                  >
                    ×
                  </button>
                </div>
              )}

              {showMentionPicker && (
                <div className="absolute bottom-full left-2 mb-2 w-64 max-h-48 overflow-y-auto bg-white border border-gray-100 rounded-xl shadow-xl z-20">
                  {mentionLoading && mentionCandidates.length === 0 ? (
                    <p className="p-3 text-[11px] text-gray-400 font-bold">Searching…</p>
                  ) : mentionCandidates.length === 0 ? (
                    <p className="p-3 text-[11px] text-gray-400 font-bold">
                      {mentionQuery.trim()
                        ? 'No eligible members match'
                        : 'Type a name to find members in this channel'}
                    </p>
                  ) : (
                    mentionCandidates.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gold-cream/40 text-left"
                        onClick={() => insertMention(p)}
                      >
                        {p.avatar_url ? (
                          <img src={p.avatar_url} alt="" className="w-6 h-6 rounded-md object-cover" />
                        ) : (
                          <div className="w-6 h-6 rounded-md bg-burgundy/10 text-burgundy text-[10px] font-black flex items-center justify-center">
                            {(p.name || '?').charAt(0)}
                          </div>
                        )}
                        <span className="text-[12px] font-bold text-[#0d1a14] truncate">{p.name}</span>
                      </button>
                    ))
                  )}
                </div>
              )}

              <textarea
                ref={inputRef}
                className="w-full bg-transparent border-0 focus:ring-0 text-[15px] lg:text-[14px] px-3.5 py-2.5 lg:py-2 resize-none outline-none min-h-[44px] max-h-[120px] text-[#0d1a14] placeholder:text-gray-300 font-medium"
                placeholder={`Message #${activeChannel?.name || 'channel'}…`}
                rows={1}
                value={inputText}
                onChange={(e) => {
                  onInputChange(e.target.value);
                  e.target.style.height = 'inherit';
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (!isSending && !uploading) handleSendMessage();
                  }
                  if (e.key === 'Escape') {
                    setShowMentionPicker(false);
                    setReplyTo(null);
                  }
                }}
                disabled={isSending || uploading}
              />
              <div className="flex items-center justify-between px-2 pb-1 border-t border-black/5 mt-0.5 pt-1.5">
                <div className="flex items-center gap-0.5 relative">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 min-w-[40px] min-h-[40px] lg:min-w-[36px] lg:min-h-[36px] text-gray-300 hover:text-burgundy rounded-lg"
                    title="Attach file"
                    disabled={uploading || isSending}
                  >
                    <Paperclip size={17} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className={`p-2 min-w-[40px] min-h-[40px] lg:min-w-[36px] lg:min-h-[36px] rounded-lg ${showEmojiPicker ? 'text-gold' : 'text-gray-300 hover:text-gold'}`}
                    title="Add emoji"
                  >
                    <Smile size={17} />
                  </button>
                  {showEmojiPicker && (
                    <div className="absolute bottom-full left-8 mb-2 bg-white border border-gray-100 rounded-xl shadow-xl p-2 flex gap-1 z-20">
                      {['❤️', '🙏', '✅', '🙌', '✨', '😊'].map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          className="text-lg p-1 hover:bg-gray-50 rounded-md"
                          onClick={() => {
                            setInputText((prev) => prev + emoji);
                            setShowEmojiPicker(false);
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setShowMentionPicker(true);
                      setMentionQuery('');
                      setInputText((prev) => (prev.endsWith(' ') || !prev ? prev : prev + ' ') + '@');
                      inputRef.current?.focus();
                    }}
                    className="p-2 min-w-[40px] min-h-[40px] lg:min-w-[36px] lg:min-h-[36px] text-gray-300 hover:text-burgundy rounded-lg"
                    title="Mention someone"
                  >
                    <AtSign size={17} />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => handleSendMessage()}
                  disabled={isSending || uploading || (!inputText.trim() && !selectedFile)}
                  className="flex items-center gap-1.5 h-10 lg:h-9 px-4 rounded-xl bg-burgundy text-gold text-[11px] font-black uppercase tracking-widest disabled:opacity-40"
                  data-chat-send="true"
                >
                  {isSending || uploading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  <span className="hidden sm:inline">Send</span>
                  <CornerDownLeft size={12} className="opacity-60 hidden lg:inline" />
                </button>
              </div>
            </div>
          </div>
        </footer>
      </main>

      {activeChannel && showChannelPanel ? (
        <>
          <button
            type="button"
            className="xl:hidden absolute top-16 lg:top-14 inset-x-0 bottom-0 z-30 bg-black/20 backdrop-blur-[1px]"
            aria-label="Close channel details"
            onClick={() => setShowChannelPanel(false)}
          />
          <aside
            className="flex absolute xl:static inset-y-0 right-0 z-40 xl:z-auto w-[min(100%,18rem)] xl:w-72 border-l border-gray-100 bg-white flex-col shrink-0 h-full shadow-xl xl:shadow-none"
            aria-label="Channel details"
          >
            <div className="px-4 h-16 lg:h-14 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                  Channel
                </p>
                <h3 className="text-sm font-black text-[#0d1a14] truncate uppercase tracking-tight">
                  #{activeChannel.name}
                </h3>
              </div>
              <button
                type="button"
                className="xl:hidden p-2 text-gray-300 hover:text-burgundy rounded-lg"
                aria-label="Close channel details"
                onClick={() => setShowChannelPanel(false)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden flex flex-col p-4 gap-5">
              <section className="shrink-0">
                <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400 mb-2">
                  About
                </h4>
                <p className="text-[13px] leading-relaxed text-gray-600">
                  {activeChannel.description?.trim() ||
                    'Share prayer requests, praise, and encouragement with the corridor.'}
                </p>
                <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-gold">
                  {channelTypeLabel}
                </p>
                {canDeleteChannel(activeChannel) ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteChannel(activeChannel)}
                    className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-red-600/80 hover:text-red-700"
                  >
                    <Trash2 size={12} aria-hidden />
                    Delete channel
                  </button>
                ) : null}
              </section>

              {canUseVoiceHuddle ? (
                <section className="shrink-0 rounded-2xl border border-gold/20 bg-gradient-to-b from-gold-cream/70 to-white p-3.5">
                  <div className="flex items-center gap-2 mb-2">
                    {activeHuddleMeta.isLive ? (
                      <span
                        className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"
                        aria-hidden
                      />
                    ) : (
                      <Mic size={14} className="text-gold shrink-0" aria-hidden />
                    )}
                    <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-[#0d1a14]">
                      Live Huddle
                    </h4>
                  </div>
                  <p className="text-[12px] text-gray-600 mb-3 leading-snug">
                    {activeHuddleMeta.isLive
                      ? activeHuddleMeta.inHuddle
                        ? `You're in · ${activeHuddleMeta.liveCount} voice${
                            activeHuddleMeta.liveCount === 1 ? '' : 's'
                          }`
                        : `${activeHuddleMeta.liveCount} in huddle right now`
                      : 'Start a voice huddle without leaving this channel.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setHuddleOpenedFromInvite(false);
                      setIsVoiceHuddleOpen(true);
                    }}
                    className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest border transition-all ${
                      activeHuddleMeta.isLive && !activeHuddleMeta.inHuddle
                        ? 'bg-emerald-500 text-white border-emerald-400 shadow-[0_0_18px_rgba(16,185,129,0.5)] hover:bg-emerald-600'
                        : activeHuddleMeta.isLive
                          ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                          : 'bg-burgundy text-gold border-burgundy hover:bg-[#0b1410]'
                    }`}
                    data-huddle-ask-to-join={
                      activeHuddleMeta.isLive && !activeHuddleMeta.inHuddle
                        ? 'true'
                        : undefined
                    }
                  >
                    <Mic size={13} aria-hidden />
                    {activeHuddleMeta.inHuddle
                      ? 'Open huddle'
                      : activeHuddleMeta.isLive
                        ? 'Ask to Join'
                        : 'Start huddle'}
                  </button>
                </section>
              ) : null}

              <section className="flex flex-col min-h-0 flex-1">
                <div className="flex items-center justify-between gap-2 mb-2 shrink-0">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">
                    Community Members
                  </h4>
                  {canManageActiveChannel ? (
                    <button
                      type="button"
                      onClick={() => setIsManageMembersOpen(true)}
                      className="text-[10px] font-black uppercase tracking-widest text-burgundy hover:text-gold"
                    >
                      Manage
                    </button>
                  ) : null}
                </div>
                {!staffLoaded ? (
                  <p className="text-[12px] text-gray-400 leading-snug">
                    Syncing community members…
                  </p>
                ) : communityMembers.length === 0 ? (
                  <p className="text-[12px] text-gray-400 leading-snug">
                    No community members to show yet.
                  </p>
                ) : (
                  <ul className="space-y-1 overflow-y-auto custom-scrollbar -mx-1 px-1 flex-1 min-h-0">
                    {communityMembers.map((person) => {
                      const isYou = String(person.id) === String(userId || '');
                      return (
                        <li key={person.id}>
                          <button
                            type="button"
                            onClick={() => {
                              if (!isYou) openDm(person);
                            }}
                            disabled={isYou}
                            className={`w-full flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 text-left transition-colors group ${
                              isYou ? 'cursor-default' : 'hover:bg-gray-50'
                            }`}
                            title={isYou ? 'You' : `Message ${person.displayName}`}
                          >
                            <div className="relative shrink-0">
                              {person.avatar_url ? (
                                <img
                                  src={person.avatar_url}
                                  alt=""
                                  className="w-8 h-8 rounded-lg object-cover border border-burgundy/10"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-lg bg-burgundy/5 flex items-center justify-center text-[10px] font-black text-burgundy border border-burgundy/10">
                                  {(person.displayName || '?').charAt(0).toUpperCase()}
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <span
                                className={`block text-[12px] font-bold truncate transition-colors ${
                                  isYou
                                    ? 'text-[#0d1a14]'
                                    : 'text-gray-600 group-hover:text-burgundy'
                                }`}
                              >
                                {person.displayName}
                                {isYou ? ' (you)' : ''}
                              </span>
                              <span className="block text-[8px] font-bold text-gray-300 uppercase tracking-widest truncate">
                                {person.role || 'Member'}
                              </span>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          </aside>
        </>
      ) : null}
      </div>

      <NewChannelModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={(channel) => {
          fetchChannels();
          if (channel?.id) {
            setActiveChannel(channel);
            setMobileView('chat');
          }
        }}
      />

      {activeChannel ? (
        <ManageChannelMembersModal
          isOpen={isManageMembersOpen}
          channelId={activeChannel.id}
          channelName={activeChannel.name}
          channelVisibility={activeChannel.visibility}
          onClose={() => setIsManageMembersOpen(false)}
        />
      ) : null}

      {/* Phase 3B: LiveKit voice only — legacy AI huddle must stay disconnected from Community Chat. */}
      {activeChannel && canUseVoiceHuddle ? (
        <VoiceHuddle
          isOpen={isVoiceHuddleOpen}
          channelId={activeChannel.id}
          channelName={activeChannel.name}
          audioOnly={/intercess/i.test(String(activeChannel.name || ''))}
          openedFromInvite={huddleOpenedFromInvite}
          onClose={() => {
            setIsVoiceHuddleOpen(false);
            setHuddleOpenedFromInvite(false);
          }}
          onPresenceChange={(presence) => {
            if (!presence.channelId) return;
            if (presence.connected) {
              setInVoiceHuddleChannelId(presence.channelId);
              setHuddleByChannel((prev) => ({
                ...prev,
                [presence.channelId]: {
                  active: presence.participantCount > 0,
                  participantCount: presence.participantCount,
                },
              }));
              return;
            }
            // Local disconnect — keep LIVE from server poll unless End cleared the room.
            setInVoiceHuddleChannelId((prev) =>
              prev === presence.channelId ? null : prev
            );
            if (presence.active === false && Number(presence.participantCount || 0) === 0) {
              setHuddleByChannel((prev) => ({
                ...prev,
                [presence.channelId]: { active: false, participantCount: 0 },
              }));
            }
          }}
        />
      ) : null}
    </div>
  );
};

export default ChatPage;
