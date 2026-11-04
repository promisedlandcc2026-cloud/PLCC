import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search,
  MessageSquare,
  Plus,
  Lock,
  ArrowLeft,
  MoreVertical,
  Phone,
  Video,
  ShieldCheck,
  Send,
  Sparkles,
  Paperclip,
  Smile,
  AtSign,
  ChevronRight,
  Loader2
} from 'lucide-react';
import { useNav } from '../../App';
import { getAuthHeaders, vaultFetch } from '../../lib/api';
import { useVaultPoll } from '../../lib/useVaultPoll';
import { shouldAutoScrollHuddleChat } from '../../api/_utils/huddleChat.js';
import VoiceHuddle from '../../components/Community/VoiceHuddle';

interface User {
  id: string;
  name: string;
  role: string;
  avatar_url?: string | null;
  status?: 'online' | 'offline' | 'away';
}

interface Message {
  id: string;
  channelId: string;
  userName: string;
  text: string;
  createdAt: number;
  avatarUrl?: string | null;
  userId?: string | null;
}

const DirectAccessPage: React.FC = () => {
  const { userRole, userName, userId } = useNav();
  const [searchParams] = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mentors, setMentors] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [activeChannel, setActiveChannel] = useState<any>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showSearchHint, setShowSearchHint] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deepLinkHandled, setDeepLinkHandled] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [callWithCamera, setCallWithCamera] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [conversationQuery, setConversationQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuNote, setMenuNote] = useState('');
  const scrollBottomRef = useRef<HTMLDivElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const pinnedToBottomRef = useRef(true);
  const forceScrollRef = useRef(false);
  const sendingRef = useRef(false);

  // Fetch Mentors
  useEffect(() => {
    const fetchMentors = async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/vault?resource=community&subResource=chat&subResource=mentors', { headers });
        if (res.ok) {
          const data = await res.json();
          setMentors(
            (Array.isArray(data) ? data : []).map((u: any) => ({
              ...u,
              name: String(u.displayName || u.name || u.memberName || u.email || 'Unnamed').trim(),
            }))
          );
        }
      } catch (e) {
        console.error("Failed to fetch mentors", e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchMentors();
  }, []);

  // Fetch or Create DM Channel
  const handleSelectUser = async (user: User) => {
    setCallOpen(false);
    setMenuOpen(false);
    setConversationQuery('');
    setSearchOpen(false);
    setSelectedUser(user);
    setActiveChannel(null); // Reset channel while loading
    pinnedToBottomRef.current = true;
    forceScrollRef.current = true;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/vault?resource=community&subResource=chat&subResource=dm-channel&partnerId=${encodeURIComponent(user.id)}`,
        { headers }
      );
      if (res.ok) {
        const channel = await res.json();
        setActiveChannel(channel);
        fetchMessages(channel.id);
      } else {
        const errData = await res.json();
        console.error("Failed to negotiate DM channel", errData);
        alert(`⚠️ Could not open secure corridor: ${errData.error || 'Unknown Error'}. Please contact support.`);
      }
    } catch (e) {
      console.error("Failed to negotiate DM channel", e);
      alert("⚠️ Connection error while opening corridor. Please check your internet.");
    }
  };

  // Deep-link from Active Staff: /community/chat/dm?partnerId=...
  useEffect(() => {
    if (deepLinkHandled || isLoading) return;
    const partnerId = searchParams.get('partnerId');
    if (!partnerId) {
      setDeepLinkHandled(true);
      return;
    }
    const partner = mentors.find((m) => m.id === partnerId);
    const name = String(searchParams.get('name') || '').trim();
    setDeepLinkHandled(true);
    void handleSelectUser(
      partner || {
        id: partnerId,
        name: name || 'Member',
        role: 'MEMBER',
      }
    );
  }, [deepLinkHandled, isLoading, mentors, searchParams]);

  // Fetch Messages
  const fetchMessages = async (channelId: string, rethrow = false) => {
    try {
      const res = await vaultFetch(
        `/api/vault?resource=community&subResource=chat&subResource=messages&channelId=${channelId}`
      );
      if (res.ok) {
        const data = await res.json();
        setMessages(data.map((m: any) => ({
          id: m.id,
          channelId: m.channel_id,
          userName: m.display_name || m.user_name || 'Staff',
          userId: m.user_id || null,
          avatarUrl: m.avatar_url || null,
          text: m.content,
          createdAt: new Date(m.created_at).getTime()
        })));
      }
    } catch (e) {
      console.error("Failed to fetch messages", e);
      if (rethrow) throw e;
    }
  };

  // Filtered Mentors
  const filteredMentors = useMemo(() => {
    if (!searchQuery.trim()) return mentors;
    const query = searchQuery.toLowerCase();
    return mentors.filter(m =>
      m.name.toLowerCase().includes(query) ||
      m.role.toLowerCase().includes(query)
    );
  }, [mentors, searchQuery]);

  // Polling for messages
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

  useEffect(() => {
    if (forceScrollRef.current || pinnedToBottomRef.current) {
      forceScrollRef.current = false;
      scrollBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      pinnedToBottomRef.current = true;
    }
  }, [messages]);

  useEffect(() => {
    if (showSearchHint) {
      searchInputRef.current?.focus();
    }
  }, [showSearchHint]);

  const handleSendMessage = async () => {
    if ((!inputText.trim() && !selectedFile) || !activeChannel || isSending || sendingRef.current) return;

    const text = inputText.trim();
    const fileName = selectedFile?.name;
    const finalContent = fileName ? `${text}\n\n📎 Attached: ${fileName}`.trim() : text;

    sendingRef.current = true;
    setIsSending(true);
    setInputText('');
    setSelectedFile(null);
    setShowEmojiPicker(false);
    pinnedToBottomRef.current = true;
    forceScrollRef.current = true;

    // Optimistic Update
    const optimisticMsg: Message = {
      id: `temp-${Date.now()}`,
      channelId: activeChannel.id,
      userName: userName || 'Me',
      text: text,
      createdAt: Date.now()
    };

    setMessages(prev => [...prev, optimisticMsg]);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/vault?resource=community&subResource=chat&subResource=messages', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: activeChannel.id,
          content: finalContent,
        })
      });

      if (!res.ok) {
        throw new Error('Failed to save message');
      }

      // Full refresh after success to get real IDs and timestamps
      forceScrollRef.current = true;
      fetchMessages(activeChannel.id);

    } catch (e) {
      console.error("Failed to send message", e);
      // Error Recovery: Restore text and notify
      setInputText(text);
      setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id));
      alert("⚠️ Message failed to send. Please try again.");
    } finally {
      sendingRef.current = false;
      setIsSending(false);
    }
  };

  const handleEmojiClick = (emoji: string) => {
    setInputText(prev => prev + emoji);
    setShowEmojiPicker(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleMentionClick = () => {
    if (!selectedUser) return;
    setInputText(prev => (prev.endsWith(' ') || prev === '' ? prev : prev + ' ') + `@${selectedUser.name} `);
  };

  return (
    <div className="flex-1 flex bg-white rounded-none lg:rounded-[2.5rem] border-none lg:border lg:border-gray-100 overflow-hidden shadow-none lg:shadow-2xl relative animate-in fade-in duration-700 min-h-0 h-full">

      {/* Contact Sidebar */}
      <div className={`${selectedUser ? 'hidden md:flex' : 'flex'} w-full md:w-80 lg:w-[400px] border-r border-gray-50 flex-col bg-[#fcfcfb] shrink-0 h-full`}>
        <div className="px-6 md:px-8 border-b border-gray-50 flex items-center justify-between bg-white h-16 md:h-20 shrink-0">
          <h2 className="font-extrabold text-[#101814] text-lg md:text-xl tracking-tight">Direct Access</h2>
          <button
            onClick={() => {
              searchInputRef.current?.focus();
              setShowSearchHint(true);
              setTimeout(() => setShowSearchHint(false), 3000);
            }}
            className="p-2 text-burgundy hover:bg-gold-cream rounded-xl transition-all shadow-sm active:scale-95 bg-white border border-gray-100 relative group"
          >
            <Plus size={20} />
            {showSearchHint && (
              <div className="absolute top-full right-0 mt-2 w-48 bg-[#0d1a14] text-gold text-[10px] font-black p-3 rounded-xl shadow-xl z-50 animate-in fade-in slide-in-from-top-2 uppercase tracking-widest leading-relaxed">
                Search for anyone below to start a new chat
              </div>
            )}
          </button>
        </div>

        <div className="p-4 flex-1 overflow-y-auto custom-scrollbar scrolling-touch overscroll-contain">
          <div className="px-2 md:px-4 mb-6 md:mb-8">
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-gold transition-colors" size={20} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search people..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-6 py-4 bg-gray-50/50 rounded-2xl outline-none border border-transparent focus:bg-white focus:border-gold/20 transition-all text-sm font-semibold text-[#0d1a14]"
              />
            </div>
          </div>

          <div className="px-1 md:px-2 space-y-1">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] px-4 md:px-6 mb-3 md:mb-4">Authorized Registry</p>
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <Loader2 className="animate-spin text-gold" size={24} />
                <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">Accessing Ledger...</p>
              </div>
            ) : filteredMentors.length > 0 ? (
              filteredMentors.map((user, i) => (
                <button
                  key={user.id}
                  onClick={() => handleSelectUser(user)}
                  className={`w-full flex items-center p-3 md:p-4 rounded-xl md:rounded-2xl transition-all group relative border ${selectedUser?.id === user.id
                    ? 'bg-burgundy text-gold shadow-lg md:shadow-xl shadow-burgundy/20'
                    : 'bg-transparent border-transparent hover:bg-white hover:shadow-sm'
                    }`}
                >
                  <div className="relative shrink-0">
                    <div className={`w-10 h-10 md:w-12 md:h-12 rounded-[1rem] md:rounded-2xl flex items-center justify-center font-black text-[14px] md:text-[15px] shadow-sm transition-transform group-hover:scale-105 ${selectedUser?.id === user.id ? 'bg-gold text-burgundy shadow-inner' : 'bg-gold-cream text-gold border border-gold/10'
                      }`}>
                      {user.name.charAt(0)}
                    </div>
                    <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 md:w-4 md:h-4 rounded-full border-2 border-white shadow-sm ${user.status === 'online' ? 'bg-green-500' : 'bg-gray-400'
                      }`} />
                  </div>
                  <div className="ml-3 md:ml-4 text-left overflow-hidden flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className={`text-[14px] md:text-[15px] font-extrabold truncate ${selectedUser?.id === user.id ? 'text-white' : 'text-[#101814]'}`}>{user.name}</p>
                    </div>
                    <p className={`text-[10px] md:text-[11px] font-bold uppercase tracking-widest truncate ${selectedUser?.id === user.id ? 'text-gold/80' : 'text-gray-400'}`}>{user.role}</p>
                  </div>
                </button>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-200 mb-4">
                  <Search size={32} />
                </div>
                <p className="text-xs font-black text-[#0d1a14] uppercase tracking-tighter mb-1">No personnel found</p>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Adjust your search parameters</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Chat Interface */}
      <div className={`${!selectedUser ? 'hidden md:flex' : 'flex'} flex-1 flex-col bg-white min-w-0 h-full overflow-hidden`}>
        {selectedUser ? (
          <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-10 duration-500 overflow-hidden">
            {/* Header */}
            <div className="h-16 md:h-20 px-4 md:px-10 border-b border-gray-50 flex items-center justify-between shrink-0 bg-white/95 backdrop-blur-md z-10">
              <div className="flex items-center min-w-0">
                <button onClick={() => setSelectedUser(null)} className="mr-3 md:mr-4 p-2 -ml-1 text-gray-400 hover:text-burgundy hover:bg-gold-cream rounded-xl md:hidden shrink-0 transition-all">
                  <ArrowLeft size={22} />
                </button>
                <div className="flex items-center gap-3 md:gap-4 overflow-hidden">
                  <div className="relative shrink-0">
                    <div className="w-9 h-9 md:w-11 md:h-11 rounded-[0.8rem] md:rounded-2xl bg-gold-cream text-gold flex items-center justify-center font-black shadow-inner border border-gold/10">
                      {selectedUser.name.charAt(0)}
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 md:-bottom-1 md:-right-1 w-3 md:w-3.5 h-3 md:h-3.5 rounded-full border-2 border-white shadow-sm bg-green-500" />
                  </div>
                  <div className="overflow-hidden">
                    <h3 className="text-lg md:text-xl font-black text-[#101814] leading-none mb-1 truncate tracking-tight">{selectedUser.name}</h3>
                    <p className="text-[9px] md:text-[11px] text-gray-400 font-bold uppercase tracking-widest truncate">Authorized System {selectedUser.role}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 md:gap-2 shrink-0">
                <button
                  type="button"
                  disabled={!activeChannel?.id}
                  onClick={() => {
                    setCallWithCamera(false);
                    setCallOpen(true);
                    setMenuOpen(false);
                  }}
                  className="p-2 text-gray-400 hover:text-burgundy hover:bg-gray-50 rounded-xl transition-all disabled:opacity-40"
                  title="Start a voice call"
                  aria-label="Start a voice call"
                >
                  <Phone size={20} />
                </button>
                <button
                  type="button"
                  disabled={!activeChannel?.id}
                  onClick={() => {
                    setCallWithCamera(true);
                    setCallOpen(true);
                    setMenuOpen(false);
                  }}
                  className="p-2 text-gray-400 hover:text-burgundy hover:bg-gray-50 rounded-xl transition-all disabled:opacity-40"
                  title="Start a video call"
                  aria-label="Start a video call"
                >
                  <Video size={20} />
                </button>
                <div className="w-px h-6 bg-gray-100 mx-1 hidden sm:block" />
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMenuOpen((open) => !open)}
                    className="p-2 text-gray-400 hover:text-burgundy hover:bg-gray-50 rounded-xl transition-all"
                    title="Conversation menu"
                    aria-label="Conversation menu"
                  >
                    <MoreVertical size={20} />
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-gray-100 rounded-2xl shadow-xl p-1.5 z-20">
                      <button
                        type="button"
                        onClick={() => {
                          setSearchOpen((open) => !open);
                          if (searchOpen) setConversationQuery('');
                          setMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 text-xs font-semibold text-[#0d1a14] rounded-xl hover:bg-gray-50"
                      >
                        {searchOpen ? 'Clear search' : 'Search this conversation'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const text = messages.map((msg) => `${msg.userName}: ${msg.text}`).join('\n');
                          void navigator.clipboard?.writeText(text).then(
                            () => setMenuNote('Conversation copied.'),
                            () => setMenuNote('Could not copy this conversation.')
                          );
                          setMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 text-xs font-semibold text-[#0d1a14] rounded-xl hover:bg-gray-50"
                      >
                        Copy conversation
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCallOpen(false);
                          setSelectedUser(null);
                          setMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 text-xs font-semibold text-[#1d372c] rounded-xl hover:bg-gray-50"
                      >
                        Close conversation
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            {searchOpen && (
              <div className="px-4 md:px-10 py-2 border-b border-gray-50 bg-white">
                <input
                  type="search"
                  value={conversationQuery}
                  onChange={(event) => setConversationQuery(event.target.value)}
                  placeholder="Search this conversation"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-gray-100 bg-gray-50 outline-none focus:border-gold/30"
                />
              </div>
            )}
            {menuNote && <p className="px-4 md:px-10 py-1 text-[11px] text-stone-400 bg-white">{menuNote}</p>}

            {/* Conversation Timeline */}
            <div
              ref={messageListRef}
              onScroll={onMessageListScroll}
              className="flex-1 overflow-y-auto px-4 py-6 md:p-12 space-y-8 md:space-y-12 bg-[#fafafa]/20 custom-scrollbar scrolling-touch overscroll-contain"
              data-dm-message-list="true"
            >
              <div className="flex flex-col items-center">
                <div className="bg-white border border-gray-100 px-4 md:px-6 py-1.5 md:py-2 rounded-full shadow-sm text-[9px] md:text-[10px] font-black text-gray-300 uppercase tracking-[0.3em]">
                  Security Corridor Opened
                </div>
                <div className="w-px h-8 md:h-12 bg-gradient-to-b from-gray-100 to-transparent mt-2" />
              </div>

              <div className="flex justify-center mb-6 md:mb-10">
                <div className="bg-gold-cream/40 p-5 md:p-6 rounded-[2rem] md:rounded-[2.5rem] border border-gold/20 flex items-start gap-3 md:gap-4 max-w-sm animate-in slide-in-from-bottom-5 duration-700">
                  <Sparkles size={20} className="text-gold shrink-0 mt-1" />
                  <p className="text-[12px] md:text-[13px] text-[#0d1a14] font-bold leading-relaxed">PLCC AI: This is a private ministry care corridor. Conversations are encrypted and restricted to authorized personnel.</p>
                </div>
              </div>

              <div className="flex flex-col gap-6">
                {messages
                  .filter((msg) => {
                    const query = conversationQuery.trim().toLowerCase();
                    if (!query) return true;
                    return `${msg.userName} ${msg.text}`.toLowerCase().includes(query);
                  })
                  .map((msg) => (
                  <div key={msg.id} className={`flex ${msg.userName === userName ? 'flex-row-reverse' : 'flex-row'} items-start gap-3 md:gap-4 max-w-[90%] sm:max-w-[80%] ${msg.userName === userName ? 'self-end' : ''}`}>
                    <div className={`w-9 h-9 md:w-10 md:h-10 rounded-[0.8rem] md:rounded-xl flex items-center justify-center font-black shadow-sm shrink-0 text-sm md:text-base overflow-hidden ${msg.userId === userId || msg.userName === userName ? 'bg-burgundy text-gold' : 'bg-white text-burgundy border border-gray-100'}`}>
                      {msg.avatarUrl ? (
                        <img src={msg.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        (msg.userName || '?').charAt(0)
                      )}
                    </div>
                    <div className={`p-4 md:p-5 rounded-[1.2rem] md:rounded-[1.5rem] shadow-sm text-[14px] md:text-[15.5px] leading-relaxed ${msg.userName === userName
                      ? 'bg-burgundy text-white rounded-tr-none border-b-4 border-gold/30 shadow-xl shadow-burgundy/10'
                      : 'bg-white text-[#0d1a14] rounded-tl-none border border-gray-100 shadow-sm'
                      }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                <div ref={scrollBottomRef} />
              </div>
            </div>

            {/* Premium Message Composer */}
            <form
              onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
              className="px-2 md:px-12 pb-4 md:pb-10 pt-2 bg-white shrink-0"
            >
              <div className="bg-white border border-gray-100 rounded-[1.5rem] md:rounded-[2.5rem] p-1.5 md:p-4 shadow-xl focus-within:ring-4 focus-within:ring-burgundy/5 transition-all relative">
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={handleFileChange}
                />
                {selectedFile && (
                  <div className="absolute top-0 right-10 -translate-y-1/2 bg-gold-cream text-burgundy text-[10px] font-black px-4 py-1.5 rounded-full border border-gold/30 shadow-lg animate-in fade-in slide-in-from-bottom-2 flex items-center gap-2">
                    <Paperclip size={12} />
                    {selectedFile.name}
                    <button onClick={() => setSelectedFile(null)} className="ml-1 hover:text-black">×</button>
                  </div>
                )}
                <textarea
                  className="w-full bg-transparent border-0 focus:ring-0 text-[15px] md:text-[16px] px-4 md:px-6 py-2 md:py-3 resize-none outline-none min-h-[44px] max-h-[120px] text-[#0d1a14] placeholder:text-gray-300 font-medium overflow-y-auto scrolling-touch"
                  placeholder={`Message...`}
                  rows={1}
                  value={inputText}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (!isSending && !sendingRef.current) handleSendMessage();
                    }
                  }}
                  disabled={isSending}
                  onChange={(e) => {
                    setInputText(e.target.value);
                    e.target.style.height = 'inherit';
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                  }}
                />
                <div className="flex items-center justify-between px-2 md:px-4 pt-1 lg:pt-2 mt-1">
                  <div className="flex items-center gap-0.5 md:gap-1 relative">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className={`p-2 hover:bg-gold-cream rounded-xl transition-all ${selectedFile ? 'text-burgundy' : 'text-gray-400'}`}
                    >
                      <Paperclip size={20} />
                    </button>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                        className={`p-2 hover:bg-gold-cream rounded-xl transition-all ${showEmojiPicker ? 'text-burgundy' : 'text-gray-400'}`}
                      >
                        <Smile size={20} />
                      </button>
                      {showEmojiPicker && (
                        <div className="absolute bottom-full left-0 mb-4 bg-white border border-gray-100 p-2 rounded-2xl shadow-2xl flex items-center gap-1 animate-in zoom-in-95 fade-in duration-200 z-[100]">
                          {['❤️', '🙏', '✅', '🙌', '✨', '😊'].map(emoji => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => handleEmojiClick(emoji)}
                              className="w-10 h-10 flex items-center justify-center text-xl hover:bg-gray-50 rounded-xl transition-all active:scale-95"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleMentionClick}
                      className="p-2 text-gray-400 hover:text-burgundy hover:bg-gold-cream rounded-xl transition-all"
                    >
                      <AtSign size={20} />
                    </button>
                  </div>
                  <button
                    type="submit"
                    disabled={!inputText.trim() || isSending}
                    className={`flex items-center gap-2 md:gap-3 px-6 md:px-10 py-2.5 md:py-3.5 rounded-xl md:rounded-2xl font-black text-[11px] md:text-[13px] uppercase tracking-widest transition-all active:scale-95 ${inputText.trim()
                      ? 'bg-burgundy text-gold shadow-lg md:shadow-xl shadow-burgundy/30 hover:bg-burgundy-dark border-b-2 border-gold/40'
                      : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                      }`}
                  >
                    {isSending ? <Loader2 className="animate-spin" size={16} /> : (
                      <>
                        <span className="hidden sm:inline">Dispatch</span>
                        <Send size={16} fill={inputText.trim() ? "currentColor" : "none"} />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
            {activeChannel?.id && (
              <VoiceHuddle
                isOpen={callOpen}
                channelId={String(activeChannel.id)}
                channelName={selectedUser.name}
                startWithCamera={callWithCamera}
                onClose={() => setCallOpen(false)}
              />
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-20 text-center bg-[#fdfdfc]/30">
            <div className="max-w-md animate-in fade-in zoom-in duration-1000">
              <div className="relative w-28 h-28 md:w-40 md:h-40 mx-auto mb-8 md:mb-10">
                <div className="absolute inset-0 bg-gold-cream rounded-[2.5rem] md:rounded-[3.5rem] rotate-12 border border-gold/10 shadow-inner opacity-50" />
                <div className="relative w-full h-full bg-white text-gold rounded-[2.5rem] md:rounded-[3.5rem] flex items-center justify-center shadow-xl md:shadow-2xl border border-gray-50 transition-transform duration-700 hover:rotate-0">
                  <MessageSquare size={80} strokeWidth={1} />
                </div>
                <div className="absolute -bottom-2 -right-2 md:-bottom-4 md:-right-4 bg-burgundy text-gold p-2 md:p-4 rounded-xl md:rounded-[1.5rem] shadow-2xl border-2 md:border-4 border-white animate-bounce-slow">
                  <ShieldCheck size={32} />
                </div>
              </div>
              <h3 className="text-xl md:text-3xl font-black text-[#101814] mb-3 md:mb-4 tracking-tight">Ministry Care Corridor</h3>
              <p className="text-sm md:text-lg text-gray-400 mb-8 md:mb-10 leading-relaxed font-medium px-4 md:px-6">
                Initiate a secure, one-on-one dialogue with congregants or staff members. All care conversations are private and protected.
              </p>
              <div className="inline-flex items-center gap-2 md:gap-3 text-[9px] md:text-[11px] font-black text-gray-400 uppercase tracking-[0.3em] bg-gold-cream/40 px-4 md:px-6 py-2.5 md:py-4 rounded-full border border-gold/10 shadow-sm">
                <Lock size={14} className="text-burgundy" />
                Secure Protocol Active
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(29, 55, 44, 0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(29, 55, 44, 0.1); }
        .scrolling-touch { -webkit-overflow-scrolling: touch; }
        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .animate-bounce-slow { animation: bounce-slow 3s ease-in-out infinite; }
      `}</style>
    </div>
  );
};

export default DirectAccessPage;