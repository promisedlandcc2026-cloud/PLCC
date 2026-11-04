import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    X,
    Bell,
    Megaphone,
    Heart,
    ClipboardCheck,
    Loader2,
    CheckCheck,
    MessageCircle,
    AtSign,
    Reply,
    Mic,
    CalendarDays,
    Cake,
} from 'lucide-react';
import { getAuthHeaders } from '../../lib/api';
import BirthdayCard from '../BirthdayCard';

interface NotificationDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    onInboxChange?: () => void;
    /** When the active user changes, drop stale inbox rows. */
    userId?: string | null;
}

type InboxType =
    | 'announcement'
    | 'prayer'
    | 'assignment'
    | 'community_mention'
    | 'community_reply'
    | 'community_dm'
    | 'community_huddle_started'
    | 'community_feed_comment'
    | 'community_feed_mention_post'
    | 'community_feed_mention_comment'
    | 'event_approval'
    | 'celebration';

interface InboxItem {
    id: string;
    type: InboxType;
    title: string;
    body?: string | null;
    link?: string | null;
    read_at?: string | null;
    created_at: string;
}

const NotificationDrawer: React.FC<NotificationDrawerProps> = ({ isOpen, onClose, onInboxChange, userId }) => {
    const navigate = useNavigate();
    const [items, setItems] = useState<InboxItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [markingAll, setMarkingAll] = useState(false);
    const [card, setCard] = useState<InboxItem | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setItems([]);
    }, [userId]);

    useEffect(() => {
        if (!isOpen) return;
        if (!userId) {
            setItems([]);
            return;
        }
        let cancelled = false;
        const loadInbox = async () => {
            setLoading(true);
            try {
                const headers = await getAuthHeaders();
                const res = await fetch('/api/vault?resource=notifications', { headers });
                const data = await res.json();
                if (cancelled) return;
                if (res.ok && data.ok) {
                    setItems(data.notifications || []);
                } else {
                    setItems([]);
                }
            } catch (err) {
                console.error('Failed to fetch notifications', err);
                if (!cancelled) setItems([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        void loadInbox();
        return () => {
            cancelled = true;
        };
    }, [isOpen, userId]);

    // ESC closes; outside click closes (desktop popover + mobile sheet).
    useEffect(() => {
        if (!isOpen) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };

        const onPointerDown = (e: MouseEvent | TouchEvent) => {
            const target = e.target as Node | null;
            if (!target) return;
            if (panelRef.current?.contains(target)) return;
            // Bell toggle lives outside this panel (Topbar); ignore clicks on the trigger.
            const el = target instanceof Element ? target : null;
            if (el?.closest('[data-notification-trigger="true"]')) return;
            // The birthday card opens on top of the drawer; taps on it shouldn't close the drawer.
            if (el?.closest('[data-birthday-card="true"]')) return;
            onClose();
        };

        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('touchstart', onPointerDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('touchstart', onPointerDown);
        };
    }, [isOpen, onClose]);

    const markRead = async (id: string) => {
        try {
            const headers = await getAuthHeaders();
            await fetch('/api/vault?resource=notifications', {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ id, read: true }),
            });
            setItems((prev) =>
                prev.map((item) => (item.id === id ? { ...item, read_at: item.read_at || new Date().toISOString() } : item))
            );
            onInboxChange?.();
        } catch (err) {
            console.error('Failed to mark notification read', err);
        }
    };

    const markAllRead = async () => {
        setMarkingAll(true);
        try {
            const headers = await getAuthHeaders();
            await fetch('/api/vault?resource=notifications', {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ mark_all_read: true }),
            });
            const now = new Date().toISOString();
            setItems((prev) => prev.map((item) => ({ ...item, read_at: item.read_at || now })));
            onInboxChange?.();
        } catch (err) {
            console.error('Failed to mark all notifications read', err);
        } finally {
            setMarkingAll(false);
        }
    };

    const formatTime = (isoString: string) => {
        const date = new Date(isoString);
        const diff = (Date.now() - date.getTime()) / 1000;
        if (diff < 60) return 'Just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return date.toLocaleDateString();
    };

    const getIcon = (type: InboxType) => {
        switch (type) {
            case 'prayer':
                return <Heart size={16} className="text-emerald-500" />;
            case 'celebration':
                return <Cake size={16} className="text-burgundy" />;
            case 'assignment':
                return <ClipboardCheck size={16} className="text-burgundy" />;
            case 'community_mention':
                return <AtSign size={16} className="text-burgundy" />;
            case 'community_feed_mention_post':
            case 'community_feed_mention_comment':
                return <AtSign size={16} className="text-burgundy" />;
            case 'community_feed_comment':
                return <Reply size={16} className="text-burgundy" />;
            case 'community_reply':
                return <Reply size={16} className="text-burgundy" />;
            case 'community_dm':
                return <MessageCircle size={16} className="text-burgundy" />;
            case 'community_huddle_started':
                return <Mic size={16} className="text-burgundy" />;
            case 'event_approval':
                return <CalendarDays size={16} className="text-burgundy" />;
            default:
                return <Megaphone size={16} className="text-amber-500" />;
        }
    };

    const typeLabel = (type: InboxType) => {
        switch (type) {
            case 'prayer':
                return 'Prayer';
            case 'assignment':
                return 'Assignment';
            case 'community_mention':
                return 'Mention';
            case 'community_feed_mention_post':
            case 'community_feed_mention_comment':
                return 'Community Mention';
            case 'community_feed_comment':
                return 'Community Comment';
            case 'community_reply':
                return 'Reply';
            case 'community_dm':
                return 'Direct Message';
            case 'community_huddle_started':
                return 'Voice Huddle';
            case 'event_approval':
                return 'Event Approval';
            case 'celebration':
                return 'Celebration';
            default:
                return 'Announcement';
        }
    };

    const typeAccent = (type: InboxType) => {
        if (type === 'prayer') return 'text-emerald-600';
        if (
            type === 'assignment' ||
            type === 'community_mention' ||
            type === 'community_reply' ||
            type === 'community_dm' ||
            type === 'community_huddle_started' ||
            type === 'community_feed_comment' ||
            type === 'community_feed_mention_post' ||
            type === 'community_feed_mention_comment' ||
            type === 'event_approval'
        ) {
            return 'text-burgundy';
        }
        return 'text-gold';
    };

    const unreadCount = items.filter((item) => !item.read_at).length;

    if (!isOpen) return null;

    const header = (
        <div className="px-4 sm:px-5 py-3.5 border-b border-gray-100 flex items-start justify-between gap-4 shrink-0 bg-white">
            <div className="min-w-0 pt-0.5">
                <h2 id="awc-notifications-title" className="text-[15px] font-bold text-[#0d1a14] leading-tight tracking-tight">
                    Notifications
                </h2>
                <p className="text-[11px] text-gray-400 font-medium mt-1">
                    {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
                </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
                {unreadCount > 0 && (
                    <button
                        type="button"
                        onClick={markAllRead}
                        disabled={markingAll}
                        className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-[11px] font-semibold text-burgundy hover:bg-burgundy/[0.06] disabled:opacity-50 transition-colors"
                    >
                        {markingAll ? <Loader2 size={13} className="animate-spin" /> : <CheckCheck size={13} />}
                        Mark all read
                    </button>
                )}
                <button
                    type="button"
                    onClick={onClose}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-300 hover:text-burgundy hover:bg-gray-50 transition-colors"
                    aria-label="Close notifications"
                >
                    <X size={16} />
                </button>
            </div>
        </div>
    );

    const body = (
        <div className="flex-1 overflow-y-auto overscroll-contain awc-notif-scroll bg-white">
            {loading ? (
                <div className="flex flex-col items-center justify-center py-14 gap-2 text-gray-400">
                    <Loader2 size={20} className="animate-spin text-burgundy" />
                    <span className="text-xs font-medium">Loading…</span>
                </div>
            ) : items.length === 0 ? (
                <div className="text-center py-14 px-6 text-gray-400">
                    <Bell size={22} className="mx-auto mb-2 opacity-35" />
                    <p className="text-sm font-semibold text-[#0d1a14]">You&apos;re all caught up</p>
                    <p className="text-xs mt-1 text-gray-400 leading-relaxed">
                        Mentions, replies, and Vault News will show here.
                    </p>
                </div>
            ) : (
                <ul className="py-2" role="list">
                    {items.map((item) => {
                        const unread = !item.read_at;
                        return (
                            <li key={item.id} className="px-1.5">
                                <button
                                    type="button"
                                    onClick={async () => {
                                        if (unread) await markRead(item.id);
                                        // Birthday / anniversary from the Pastor opens as a card.
                                        if (item.type === 'celebration') {
                                            setCard(item);
                                            return;
                                        }
                                        if (item.link) navigate(item.link);
                                        onClose();
                                    }}
                                    className={`w-full text-left cursor-pointer px-3 py-3.5 flex items-start gap-2.5 rounded-xl transition-colors border-l-2 ${
                                        unread
                                            ? 'bg-gold-cream/18 border-l-gold hover:bg-gold-cream/28'
                                            : 'bg-transparent border-l-transparent hover:bg-gray-50'
                                    }`}
                                >
                                    <div
                                        className={`mt-0.5 w-8 h-8 rounded-lg shrink-0 flex items-center justify-center ${
                                            unread ? 'bg-white border border-gold/15' : 'bg-gray-50 border border-gray-100'
                                        }`}
                                    >
                                        {getIcon(item.type)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2 mb-0.5">
                                            <span className={`text-[9px] font-bold uppercase tracking-wider ${typeAccent(item.type)}`}>
                                                {item.link === '/dashboard' ? 'Vault News' : typeLabel(item.type)}
                                            </span>
                                            <span className="text-[10px] text-gray-400 font-medium flex items-center gap-1.5 shrink-0">
                                                {unread && (
                                                    <span className="w-1.5 h-1.5 rounded-full bg-burgundy" aria-hidden />
                                                )}
                                                {formatTime(item.created_at)}
                                            </span>
                                        </div>
                                        <p
                                            className={
                                                unread
                                                    ? 'text-[13px] leading-snug truncate font-semibold text-[#0d1a14]'
                                                    : 'text-[13px] leading-snug truncate font-medium text-[#0d1a14]'
                                            }
                                        >
                                            {item.title}
                                        </p>
                                        {item.body && (
                                            <p className="text-[12px] text-gray-500 line-clamp-2 leading-snug mt-0.5">
                                                {item.body}
                                            </p>
                                        )}
                                    </div>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );

    return (
        <>
            {/* Mobile: light dim (no pink blur) + bottom sheet */}
            <div
                className="md:hidden fixed inset-0 z-[140] bg-black/25"
                aria-hidden
                onClick={onClose}
            />
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="awc-notifications-title"
                className={[
                    // Mobile sheet
                    'fixed inset-x-0 bottom-0 z-[150] flex flex-col bg-white border-t border-gray-100',
                    'rounded-t-2xl shadow-[0_-8px_40px_rgba(0,0,0,0.12)] max-h-[85vh]',
                    'animate-in slide-in-from-bottom duration-200',
                    // Desktop: right-anchored under bell (origin-top-right so it does not float center)
                    'md:absolute md:inset-auto md:left-auto md:right-0 md:top-full md:mt-2',
                    'md:w-[440px] md:max-w-[min(440px,calc(100vw-1.5rem))] md:max-h-[600px]',
                    'md:rounded-2xl md:border md:border-gray-100 md:origin-top-right',
                    'md:shadow-[0_12px_40px_rgba(13, 26, 20,0.12)] md:animate-in md:fade-in md:zoom-in-95 md:slide-in-from-top-1',
                ].join(' ')}
            >
                <div className="md:hidden flex justify-center pt-2.5 pb-1" aria-hidden>
                    <div className="w-9 h-1 rounded-full bg-gray-200" />
                </div>
                {header}
                {body}
            </div>
            <style>{`
        .awc-notif-scroll::-webkit-scrollbar { width: 4px; }
        .awc-notif-scroll::-webkit-scrollbar-track { background: transparent; }
        .awc-notif-scroll::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.08); border-radius: 10px; }
      `}</style>
            {card && <BirthdayCard title={card.title} body={card.body} onClose={() => setCard(null)} />}
        </>
    );
};

export default NotificationDrawer;
