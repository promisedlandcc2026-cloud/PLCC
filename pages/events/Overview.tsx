import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { ShareToAwcChat } from '../../components/awcone/ShareToAwcChat';
import { useNavigate, useSearchParams } from 'react-router-dom';
import QRCode from 'react-qr-code';
import {
  Calendar,
  Users,
  CheckSquare,
  ArrowUpRight,
  Clock,
  TrendingUp,
  MapPin,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  LayoutGrid,
  CalendarDays,
  Plus,
  QrCode as QrCodeIcon,
  X,
  Smartphone,
  ShieldCheck,
  Maximize2,
  Trash2,
  Edit3,
  CheckCircle2,
  Info,
  Mic2,
  GripVertical,
  ImagePlus,
  Camera,
  FileText,
  Tag,
  ClipboardCheck,
  Ban,
} from 'lucide-react';
import { canPerform } from '../../lib/permissions';
import { useNav } from '../../App';
import { supabase } from '../../lib/supabase';
import { fetchWithTimeout, getAuthHeaders } from '../../lib/api';
import AskAdminTitleLink from '../../components/common/AskAdminTitleLink';
import { rsvpGiftOptions } from '../../api/_utils/cookoutFoodContribution';
import {
  FELLOWSHIP_EVENTS,
  MARRIEDS_DINNER_2026_EVENT_ID,
  THANKSGIVING_2026_EVENT_ID,
  eventFundName,
  getFellowshipEventConfig,
  isFellowshipRsvpClosed,
  listFellowshipEvents,
} from '../../api/_utils/fellowshipEventConfig';
import { fellowshipRsvpStaffPath } from '../../lib/simpleNav';
import { buildStartsAtFromDateAndTime, toEventYmd } from '../../lib/eventDate';

interface ChurchEvent {
  id: string;
  title: string;
  time: string;
  endTime?: string;
  loc: string;
  type: string;
  imageUrl?: string;
  description?: string;
  department?: string;
  status?: 'pending' | 'approved' | 'rejected';
  submittedBy?: string | null;
  rsvpEnabled?: boolean;
  rsvpTemplate?: 'simple' | 'fellowship' | null;
  rsvpCloseAt?: string | null;
  /** Payments through PLCC Tithe (fellowship sign-ups). Null = use the event's defaults. */
  rsvpPaymentsEnabled?: boolean | null;
  rsvpGiftMin?: number | null;
  rsvpGiftOptions?: number[] | null;
  rsvpAllowPledge?: boolean | null;
}

const typeStyle = (type: string) => {
  const key = (type || '').toLowerCase();
  if (key.includes('youth')) return 'bg-gold-cream text-[#8a6a10] border-gold/30';
  if (key.includes('meet')) return 'bg-amber-50 text-amber-800 border-amber-200/60';
  if (key.includes('outreach') || key.includes('mission')) return 'bg-emerald-50 text-emerald-800 border-emerald-200/60';
  return 'bg-burgundy/10 text-burgundy border-burgundy/15';
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const emptyForm: Partial<ChurchEvent> = {
  title: '',
  time: '10:00 AM',
  endTime: '12:00 PM',
  loc: 'Main Sanctuary',
  type: 'Service',
  department: '',
  imageUrl: '',
  description: '',
  rsvpEnabled: false,
  rsvpTemplate: 'simple',
  rsvpCloseAt: null,
};

/** In-app HashRouter path (opens signup in Vault). */
function publicEventRsvpPath(eventId: string): string {
  return `/#/events/${encodeURIComponent(eventId)}/rsvp`;
}

/**
 * WhatsApp / text share URL — crawlers read og:image (calendar flyer).
 * Hash RSVP links cannot show a preview image.
 */
function publicEventRsvpShareUrl(eventId: string): string {
  const id = encodeURIComponent(eventId);
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api/share-rsvp?id=${id}`;
  }
  return `https://plcc-vault.vercel.app/api/share-rsvp?id=${id}`;
}

async function fileToCompressedDataUrl(file: File, maxWidth = 900, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image'));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(reader.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

async function uploadEventImage(file: File): Promise<string | null> {
  try {
    const dataUrl = await fileToCompressedDataUrl(file);
    const headers = await getAuthHeaders();

    const res = await fetch('/api/vault?resource=events&subResource=upload-image', {
      method: 'POST',
      headers,
      body: JSON.stringify({ imageBase64: dataUrl, contentType: 'image/jpeg' }),
    });
    const data = await res.json();
    if (data?.ok && data?.url) return data.url as string;

    if (supabase) {
      const blob = await (await fetch(dataUrl)).blob();
      const path = `events/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      const { error } = await supabase.storage.from('avatars').upload(path, blob, {
        contentType: 'image/jpeg',
        upsert: false,
      });
      if (!error) {
        const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
        if (pub?.publicUrl) return pub.publicUrl;
      }
    }

    console.error('Event image upload failed:', data?.error);
    return null;
  } catch (err) {
    console.error('Event image upload failed:', err);
    return null;
  }
}

const EventsOverview: React.FC = () => {
  const { userRole, userId } = useNav();
  const navigate = useNavigate();
  const isSuperAdmin = String(userRole || '').toUpperCase() === 'SUPER_ADMIN';
  const holidayRsvpEvents = listFellowshipEvents();
  const thanksgiving = getFellowshipEventConfig(THANKSGIVING_2026_EVENT_ID);
  const thanksgivingRsvpOpen = !isFellowshipRsvpClosed(thanksgiving);
  const marriedsDinner = getFellowshipEventConfig(MARRIEDS_DINNER_2026_EVENT_ID);
  const marriedsRsvpOpen = !isFellowshipRsvpClosed(marriedsDinner);
  const [holidayMenuOpen, setHolidayMenuOpen] = useState(false);
  const holidayMenuRef = useRef<HTMLDivElement | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState<'hub' | 'calendar'>('calendar');
  const [currentDate, setCurrentDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(new Date().getDate());
  const [showQRStation, setShowQRStation] = useState(false);
  const [qrMode, setQrMode] = useState<'general' | 'kids'>('general');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<{ day: number; event: ChurchEvent; index: number } | null>(null);

  const [formData, setFormData] = useState<Partial<ChurchEvent>>(emptyForm);
  const [newGiftOption, setNewGiftOption] = useState('');

  /**
   * Payments for a fellowship sign-up, through PLCC Tithe. Unset values fall back to the
   * built-in event (Thanksgiving / Marrieds) or, for a new event, payments on with $20 minimum.
   */
  const payments = useMemo(() => {
    const kit = editingEvent?.event.id ? FELLOWSHIP_EVENTS[editingEvent.event.id] : undefined;
    const enabled = formData.rsvpPaymentsEnabled ?? (kit ? Boolean(kit.paymentChoiceEnabled) : true);
    const min = Math.max(1, Math.floor(Number(formData.rsvpGiftMin ?? kit?.giftMin ?? 20)) || 20);
    const options = rsvpGiftOptions(min, formData.rsvpGiftOptions);
    const allowPledge = formData.rsvpAllowPledge ?? true;
    return { enabled, min, options, allowPledge };
  }, [editingEvent, formData.rsvpPaymentsEnabled, formData.rsvpGiftMin, formData.rsvpGiftOptions, formData.rsvpAllowPledge]);
  const [signupLinkBanner, setSignupLinkBanner] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [events, setEvents] = useState<Record<number, ChurchEvent[]>>({});
  const [pendingQueue, setPendingQueue] = useState<ChurchEvent[]>([]);
  const [lockedDates, setLockedDates] = useState<string[]>([]);
  const [canApproveEvents, setCanApproveEvents] = useState(() => canPerform(userRole, 'event.approve'));
  const [canSubmitEvents, setCanSubmitEvents] = useState(() => canPerform(userRole, 'event.submit'));
  const [canBypassDateLock, setCanBypassDateLock] = useState(() => isSuperAdmin);
  const [showPendingPanel, setShowPendingPanel] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [stats, setStats] = useState({
    upcomingEvents: 0,
    totalMembers: 0,
    checkInsToday: 0,
    upcomingEventsList: [] as any[],
  });
  const [draggedEvent, setDraggedEvent] = useState<{ day: number; index: number } | null>(null);
  const [dragOverDay, setDragOverDay] = useState<number | null>(null);

  const toYmd = (year: number, monthIndex: number, day: number) =>
    [
      year,
      String(monthIndex + 1).padStart(2, '0'),
      String(day).padStart(2, '0'),
    ].join('-');

  const isDayLocked = (day: number) => {
    const ymd = toYmd(currentDate.getFullYear(), currentDate.getMonth(), day);
    return lockedDates.includes(ymd);
  };

  const mapApiEvent = (ev: any): ChurchEvent => ({
    id: ev.id,
    title: ev.name || ev.title || '',
    time: ev.time || '10:00 AM',
    endTime: ev.end_time || ev.endTime || '',
    loc: ev.location || ev.loc || 'Sanctuary',
    type: ev.type || 'Service',
    imageUrl: ev.image_url || ev.imageUrl || '',
    description: ev.description || '',
    department: ev.department || '',
    status: (ev.status || 'approved') as ChurchEvent['status'],
    submittedBy: ev.submitted_by || null,
    rsvpEnabled: Boolean(ev.rsvp_enabled ?? ev.rsvpEnabled),
    rsvpTemplate:
      ev.rsvp_template === 'fellowship' || ev.rsvpTemplate === 'fellowship'
        ? 'fellowship'
        : ev.rsvp_template === 'simple' || ev.rsvpTemplate === 'simple'
          ? 'simple'
          : null,
    rsvpCloseAt: ev.rsvp_close_at || ev.rsvpCloseAt || null,
    rsvpPaymentsEnabled: typeof ev.rsvp_payments_enabled === 'boolean' ? ev.rsvp_payments_enabled : null,
    rsvpGiftMin: ev.rsvp_gift_min != null ? Number(ev.rsvp_gift_min) : null,
    rsvpGiftOptions: Array.isArray(ev.rsvp_gift_options) ? ev.rsvp_gift_options.map(Number) : null,
    rsvpAllowPledge: typeof ev.rsvp_allow_pledge === 'boolean' ? ev.rsvp_allow_pledge : null,
  });

  const fetchEvents = useCallback(async () => {
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const lastDay = new Date(year, month + 1, 0).getDate();
      const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      const headers = await getAuthHeaders();
      const res = await fetchWithTimeout(
        `/api/vault?resource=events&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=200`,
        { headers },
        55_000
      );
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        if (data.meta) {
          setCanApproveEvents(Boolean(data.meta.canApprove));
          setCanSubmitEvents(Boolean(data.meta.canSubmit));
          setCanBypassDateLock(
            data.meta.canBypassDateLock != null
              ? Boolean(data.meta.canBypassDateLock)
              : String(userRole || '').toUpperCase() === 'SUPER_ADMIN'
          );
        }
        setLockedDates(Array.isArray(data.lockedDates) ? data.lockedDates : []);

        const grouped: Record<number, ChurchEvent[]> = {};
        const viewingMonth = month;
        const viewingYear = year;
        const pendingList: ChurchEvent[] = [];

        (data.events || []).forEach((ev: any) => {
          const mapped = mapApiEvent(ev);
          if (mapped.status === 'pending') pendingList.push(mapped);

          const dateStr = String(ev.date || ev.starts_at || '').split('T')[0];
          if (!dateStr) return;
          const [y, m, d] = dateStr.split('-').map(Number);
          if (!y || !m || !d) return;
          const evDate = new Date(y, m - 1, d);
          if (evDate.getMonth() === viewingMonth && evDate.getFullYear() === viewingYear) {
            const day = evDate.getDate();
            if (!grouped[day]) grouped[day] = [];
            grouped[day].push(mapped);
          }
        });
        setEvents(grouped);
        setPendingQueue(pendingList);
      }

      const resStats = await fetchWithTimeout(
        '/api/vault?resource=events&subResource=stats',
        { headers },
        55_000
      );
      const dataStats = await resStats.json().catch(() => null);
      if (dataStats) setStats(dataStats);
    } catch (err) {
      console.error('Failed to fetch events:', err);
    }
  }, [currentDate, userRole]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    if (searchParams.get('pending') === '1') {
      setShowPendingPanel(true);
      setViewMode('calendar');
    }
  }, [searchParams]);

  // Deep-link from Home: /events/overview?date=YYYY-MM-DD (consume once so month nav still works)
  useEffect(() => {
    const ymd = toEventYmd(searchParams.get('date'));
    if (!ymd) return;
    const [y, m, d] = ymd.split('-').map(Number);
    if (!y || !m || !d) return;
    setViewMode('calendar');
    setCurrentDate(new Date(y, m - 1, 1));
    setSelectedDate(d);
    const next = new URLSearchParams(searchParams);
    next.delete('date');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!holidayMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!holidayMenuRef.current?.contains(e.target as Node)) {
        setHolidayMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [holidayMenuOpen]);

  const daysInMonth = (month: number, year: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();

  useEffect(() => {
    const maxDay = daysInMonth(currentDate.getMonth(), currentDate.getFullYear());
    setSelectedDate((prev) => Math.min(prev, maxDay));
  }, [currentDate]);

  const showToast = (message: string, type: 'success' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const shiftMonth = (delta: number) => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const goToday = () => {
    const now = new Date();
    setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(now.getDate());
  };

  const handleDragStart = (e: React.DragEvent, day: number, index: number) => {
    setDraggedEvent({ day, index });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(day));
  };

  const handleDragEnd = () => {
    setDragOverDay(null);
    setDraggedEvent(null);
  };

  const handleDragOver = (e: React.DragEvent, day: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverDay !== day) setDragOverDay(day);
  };

  const handleDrop = async (e: React.DragEvent, targetDay: number) => {
    e.preventDefault();
    setDragOverDay(null);
    if (!draggedEvent) return;

    const { day: sourceDay, index: sourceIndex } = draggedEvent;
    if (sourceDay === targetDay) {
      setDraggedEvent(null);
      return;
    }

    if (!canBypassDateLock && isDayLocked(targetDay)) {
      showToast('This day is locked — ask a Super Admin to move an event here', 'info');
      setDraggedEvent(null);
      return;
    }

    const eventDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), targetDay);
    const dateStr = [
      eventDate.getFullYear(),
      String(eventDate.getMonth() + 1).padStart(2, '0'),
      String(eventDate.getDate()).padStart(2, '0'),
    ].join('-');

    const eventToMove = events[sourceDay]?.[sourceIndex];
    if (!eventToMove) {
      setDraggedEvent(null);
      return;
    }

    const newEvents = { ...events };
    const sourceDayEvents = [...(newEvents[sourceDay] || [])];
    sourceDayEvents.splice(sourceIndex, 1);
    if (sourceDayEvents.length === 0) delete newEvents[sourceDay];
    else newEvents[sourceDay] = sourceDayEvents;

    const targetDayEvents = [...(newEvents[targetDay] || [])];
    targetDayEvents.push(eventToMove);
    newEvents[targetDay] = targetDayEvents;
    setEvents(newEvents);
    setSelectedDate(targetDay);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/vault?resource=events', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ id: eventToMove.id, date: dateStr }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      showToast(`Moved "${eventToMove.title}"`);
    } catch (err) {
      console.error('Failed to reschedule:', err);
      showToast('Could not move event', 'info');
      fetchEvents();
    }

    setDraggedEvent(null);
  };

  const openAddModal = (day: number) => {
    if (!canBypassDateLock && isDayLocked(day)) {
      showToast('This day is locked — an approved event is already scheduled', 'info');
      return;
    }
    setEditingEvent(null);
    setSelectedDate(day);
    setFormData({ ...emptyForm });
    setIsModalOpen(true);
  };

  const canEditListedEvent = (ev: ChurchEvent) => {
    if (canApproveEvents) return true;
    if (!canSubmitEvents) return false;
    return ev.status === 'pending' && ev.submittedBy && userId && ev.submittedBy === userId;
  };

  const openEditModal = (day: number, event: ChurchEvent, index: number) => {
    if (!canEditListedEvent(event)) return;
    setSelectedDate(day);
    setEditingEvent({ day, event, index });
    setFormData({ ...event });
    setIsModalOpen(true);
  };

  const handleReview = async (eventId: string, action: 'approve' | 'reject') => {
    let rejection_reason: string | undefined;
    if (action === 'reject') {
      const reason = window.prompt('Optional rejection reason:') || '';
      rejection_reason = reason.trim() || undefined;
    }
    setReviewingId(eventId);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/vault?resource=events', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ id: eventId, action, rejection_reason }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Review failed');
      showToast(action === 'approve' ? 'Event approved' : 'Event rejected');
      await fetchEvents();
    } catch (err: any) {
      showToast(err?.message || 'Could not update request', 'info');
    } finally {
      setReviewingId(null);
    }
  };

  const handleImagePick = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Please choose an image file', 'info');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      showToast('Image must be under 8MB', 'info');
      return;
    }
    setIsUploadingImage(true);
    try {
      const url = await uploadEventImage(file);
      if (url) {
        setFormData((prev) => ({ ...prev, imageUrl: url }));
        setImagePickerOpen(false);
        showToast('Image added');
      } else {
        showToast('Could not add image — try a smaller JPG', 'info');
      }
    } finally {
      setIsUploadingImage(false);
    }
  };

  const resolveImageForSave = async (): Promise<string | null> => {
    const current = (formData.imageUrl || '').trim();
    if (!current) return null;
    if (current.startsWith('http://') || current.startsWith('https://')) return current;

    // data: URLs are too large for reliable API saves — upload first
    if (current.startsWith('data:')) {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/vault?resource=events&subResource=upload-image', {
        method: 'POST',
        headers,
        body: JSON.stringify({ imageBase64: current, contentType: 'image/jpeg' }),
      });
      const data = await res.json();
      if (data?.ok && data?.url) {
        setFormData((prev) => ({ ...prev, imageUrl: data.url }));
        return data.url as string;
      }
      throw new Error(data?.error || 'Could not upload image');
    }
    return current;
  };

  const handleSaveEvent = async () => {
    if (!formData.title?.trim()) {
      showToast('Please enter an event title', 'info');
      return;
    }
    if (editingEvent && !canEditListedEvent(editingEvent.event)) {
      showToast('You do not have permission to edit this event', 'info');
      return;
    }
    if (!editingEvent && !(canApproveEvents || canSubmitEvents)) {
      showToast('You do not have permission to add events', 'info');
      return;
    }

    const dayForSave = editingEvent ? editingEvent.day : selectedDate;
    if (!editingEvent && !canBypassDateLock && isDayLocked(dayForSave)) {
      showToast('This day is locked — an approved event is already scheduled', 'info');
      return;
    }

    const eventDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), dayForSave);
    const dateStr = [
      eventDate.getFullYear(),
      String(eventDate.getMonth() + 1).padStart(2, '0'),
      String(eventDate.getDate()).padStart(2, '0'),
    ].join('-');

    setIsSaving(true);
    try {
      let imageUrl: string | null = null;
      try {
        imageUrl = await resolveImageForSave();
      } catch (imgErr: any) {
        showToast(imgErr?.message || 'Image upload failed', 'info');
        setIsSaving(false);
        return;
      }

      if (formData.rsvpEnabled && formData.rsvpTemplate !== 'simple' && formData.rsvpTemplate !== 'fellowship') {
        showToast('Choose a signup template: Simple or Fellowship meal', 'info');
        setIsSaving(false);
        return;
      }

      const timeLabel = formData.time || '10:00 AM';
      const eventBody = {
        id: editingEvent ? editingEvent.event.id : undefined,
        name: formData.title.trim(),
        date: dateStr,
        time: timeLabel,
        end_time: formData.endTime || null,
        location: formData.loc || '',
        type: formData.type?.trim() || 'Service',
        department: formData.department?.trim() || formData.type?.trim() || null,
        image_url: imageUrl,
        description: formData.description?.trim() || null,
        starts_at: buildStartsAtFromDateAndTime(dateStr, timeLabel),
        rsvp_enabled: Boolean(formData.rsvpEnabled),
        rsvp_template: formData.rsvpEnabled ? formData.rsvpTemplate || 'simple' : null,
        rsvp_close_at: formData.rsvpEnabled && formData.rsvpCloseAt ? formData.rsvpCloseAt : null,
        ...(formData.rsvpEnabled && formData.rsvpTemplate === 'fellowship'
          ? {
              rsvp_payments_enabled: payments.enabled,
              rsvp_gift_min: payments.min,
              rsvp_gift_options: payments.options,
              rsvp_allow_pledge: payments.allowPledge,
            }
          : {}),
      };

      const headers = await getAuthHeaders();
      const res = await fetch('/api/vault?resource=events', {
        method: editingEvent ? 'PATCH' : 'POST',
        headers,
        body: JSON.stringify(eventBody),
      });
      const data = await res.json();
      if (data.ok) {
        const persistedImage = data.event?.image_url || imageUrl || '';
        const createdPending = !editingEvent && data.event?.status === 'pending';
        if (imageUrl && !data.event?.image_url) {
          showToast('Event saved, but the image did not stick. Try a smaller photo.', 'info');
        } else if (data.warning) {
          showToast(data.warning, 'info');
        } else if (data.titheFund) {
          showToast(`Saved. Payments go to “${data.titheFund}” in PLCC Tithe.`);
        } else if (createdPending) {
          showToast('Event request submitted for approval');
        } else {
          showToast(editingEvent ? 'Event updated' : 'Event scheduled');
        }

        const savedId = editingEvent?.event.id || data.event?.id || `temp-${Date.now()}`;
        const saved: ChurchEvent = {
          id: savedId,
          title: formData.title!.trim(),
          time: formData.time || '10:00 AM',
          endTime: formData.endTime || data.event?.end_time || '',
          loc: formData.loc || '',
          type: formData.type?.trim() || 'Service',
          department: formData.department?.trim() || data.event?.department || '',
          imageUrl: persistedImage,
          description: formData.description?.trim() || data.event?.description || '',
          status: (data.event?.status || (canApproveEvents ? 'approved' : 'pending')) as ChurchEvent['status'],
          submittedBy: data.event?.submitted_by || userId,
          rsvpEnabled: Boolean(data.event?.rsvp_enabled ?? formData.rsvpEnabled),
          rsvpTemplate:
            (data.event?.rsvp_template as ChurchEvent['rsvpTemplate']) ||
            (formData.rsvpEnabled ? formData.rsvpTemplate || 'simple' : null),
          rsvpCloseAt: data.event?.rsvp_close_at || formData.rsvpCloseAt || null,
          rsvpPaymentsEnabled: payments.enabled,
          rsvpGiftMin: payments.min,
          rsvpGiftOptions: payments.options,
          rsvpAllowPledge: payments.allowPledge,
        };

        setEvents((prev) => {
          const next = { ...prev };
          if (editingEvent) {
            const list = [...(next[editingEvent.day] || [])];
            list[editingEvent.index] = saved;
            next[editingEvent.day] = list;
          } else {
            next[dayForSave] = [...(next[dayForSave] || []), saved];
          }
          return next;
        });

        await fetchEvents();
        setIsModalOpen(false);
        setImagePickerOpen(false);
        if (saved.rsvpEnabled && data.event?.id) {
          setSignupLinkBanner(publicEventRsvpShareUrl(data.event.id));
          showToast('Signup page ready — copy the WhatsApp link below', 'success');
        } else {
          setSignupLinkBanner(null);
        }
      } else {
        throw new Error(data.error || 'Save failed');
      }
    } catch (err: any) {
      console.error('Save Error:', err);
      showToast(err?.message || 'Failed to save event', 'info');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteEvent = async (day: number, index: number) => {
    const event = events[day][index];
    const signupWarn = event.rsvpEnabled
      ? '\n\nThis event has a signup page. Deleting it will also permanently remove any RSVP registrations for this event.'
      : '';
    if (!window.confirm(`Delete "${event.title}"?${signupWarn}`)) return;

    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/vault?resource=events', {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ id: event.id }),
      });
      const data = await res.json();
      if (data.ok) {
        const removed = Number(data.removedRsvps) || 0;
        showToast(
          removed > 0
            ? `Deleted "${event.title}" and ${removed} signup${removed === 1 ? '' : 's'}`
            : `Deleted "${event.title}"`,
          'info'
        );
        fetchEvents();
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      console.error('Delete Error:', err);
      showToast(err?.message || 'Failed to delete event', 'info');
    }
  };

  const today = new Date();
  const isCurrentMonth =
    currentDate.getMonth() === today.getMonth() && currentDate.getFullYear() === today.getFullYear();
  const selectedLabel = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    selectedDate
  ).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const renderCalendar = () => {
    const totalDays = daysInMonth(currentDate.getMonth(), currentDate.getFullYear());
    const cells: React.ReactNode[] = [];

    for (let i = 0; i < firstDayOfMonth; i++) {
      cells.push(
        <div key={`empty-${i}`} className="min-h-[4.75rem] md:min-h-[6.75rem] bg-[#faf9f8] border-b border-r border-gray-100/80" />
      );
    }

    for (let d = 1; d <= totalDays; d++) {
      const dayEvents = events[d] || [];
      const isToday = isCurrentMonth && d === today.getDate();
      const isSelected = d === selectedDate;
      const isDragOver = dragOverDay === d;
      const locked = !canBypassDateLock && isDayLocked(d);

      cells.push(
        <div
          key={d}
          onClick={() => setSelectedDate(d)}
          onDragOver={(e) => {
            if (locked) return;
            handleDragOver(e, d);
          }}
          onDragLeave={() => setDragOverDay(null)}
          onDrop={(e) => {
            if (locked) return;
            handleDrop(e, d);
          }}
          className={`
            min-h-[4.75rem] md:min-h-[6.75rem] p-1.5 md:p-2 border-b border-r border-gray-100/80 transition-colors cursor-pointer
            ${locked ? 'bg-gray-100/80' : isSelected ? 'bg-burgundy/[0.06]' : 'bg-white hover:bg-[#faf9f8]'}
            ${isDragOver ? 'bg-gold/10 ring-2 ring-inset ring-gold/50' : ''}
          `}
          data-calendar-day-locked={locked ? 'true' : undefined}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span
              className={`
                text-xs md:text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full
                ${isToday ? 'bg-burgundy text-gold' : isSelected ? 'bg-burgundy/10 text-burgundy' : locked ? 'text-gray-400' : 'text-gray-500'}
              `}
            >
              {d}
            </span>
            <div className="flex items-center gap-1">
              {locked && (
                <span className="text-[9px] font-bold uppercase tracking-wide text-gray-400" title="Day locked — only a Super Admin can add another event">
                  Locked
                </span>
              )}
              {dayEvents.length > 0 && (
                <span className="text-[10px] font-semibold text-gray-300 tabular-nums">{dayEvents.length}</span>
              )}
            </div>
          </div>

          <div className="space-y-1">
            {dayEvents.slice(0, 3).map((ev, i) => {
              const dragging = draggedEvent?.day === d && draggedEvent?.index === i;
              const isPending = ev.status === 'pending';
              return (
                <div
                  key={ev.id}
                  draggable={canApproveEvents || canEditListedEvent(ev)}
                  onDragStart={(e) => {
                    e.stopPropagation();
                    handleDragStart(e, d, i);
                  }}
                  onDragEnd={handleDragEnd}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedDate(d);
                    if (canEditListedEvent(ev)) {
                      openEditModal(d, ev, i);
                    }
                  }}
                  className={`
                    group/chip ${ev.imageUrl ? 'flex flex-col' : 'flex items-center gap-1'} px-1.5 py-1 rounded-md border text-left
                    transition-opacity overflow-hidden
                    ${canEditListedEvent(ev) ? 'cursor-pointer' : 'cursor-default'}
                    ${isPending ? 'bg-amber-50 text-amber-900 border-amber-200/70' : typeStyle(ev.type)}
                    ${dragging ? 'opacity-30' : 'opacity-100'}
                  `}
                  title={`${ev.time}${ev.endTime ? ` – ${ev.endTime}` : ''} · ${ev.title}${isPending ? ' (pending)' : ''}`}
                >
                  {ev.imageUrl ? (
                    <div className="w-full min-w-0">
                      <img
                        src={ev.imageUrl}
                        alt=""
                        className="w-full h-8 md:h-10 object-cover rounded-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setImagePreviewUrl(ev.imageUrl || null);
                        }}
                      />
                      <p className="text-[10px] md:text-[11px] font-semibold leading-tight truncate mt-0.5">
                        {isPending ? '⏳ ' : ''}
                        {ev.title}
                      </p>
                    </div>
                  ) : (
                    <>
                      <GripVertical size={10} className="opacity-30 shrink-0 hidden md:block" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] md:text-[11px] font-semibold leading-tight truncate">
                          {isPending ? '⏳ ' : ''}
                          {ev.title}
                        </p>
                        <p className="text-[9px] opacity-70 font-medium truncate hidden sm:block">{ev.time}</p>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
            {dayEvents.length > 3 && (
              <p className="text-[9px] font-semibold text-gray-400 pl-0.5">+{dayEvents.length - 3} more</p>
            )}
          </div>
        </div>
      );
    }

    return cells;
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-500 pb-12 relative px-1">
      {toast && (
        <div className="fixed top-20 right-4 md:right-8 z-[110] animate-in slide-in-from-right-8 duration-300">
          <div
            className={`px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 border bg-white ${
              toast.type === 'success' ? 'text-green-700 border-green-100' : 'text-burgundy border-burgundy/10'
            }`}
          >
            {toast.type === 'success' ? <CheckCircle2 size={18} /> : <Info size={18} />}
            <span className="font-bold text-sm">{toast.message}</span>
          </div>
        </div>
      )}

      {signupLinkBanner && (
        <div className="rounded-2xl border border-burgundy/20 bg-burgundy/[0.04] px-4 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[#0d1a14]">WhatsApp / text signup link</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Shows your calendar flyer as the preview, then opens the signup page.
            </p>
            <p className="text-xs text-gray-600 break-all mt-1">{signupLinkBanner}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(signupLinkBanner);
                  showToast('WhatsApp signup link copied');
                } catch {
                  showToast('Could not copy — select the link manually', 'info');
                }
              }}
              className="px-3.5 py-2.5 rounded-xl bg-burgundy text-gold text-xs font-bold min-h-[44px]"
            >
              Copy link
            </button>
            <button
              type="button"
              onClick={() => setSignupLinkBanner(null)}
              className="p-2.5 rounded-xl text-gray-400 hover:text-burgundy min-h-[44px] min-w-[44px]"
              aria-label="Dismiss signup link"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl md:text-[2.35rem] font-black text-[#0d1a14] tracking-tight">Events</h1>
              <AskAdminTitleLink />
            </div>
            <p className="text-gray-500 text-sm mt-1.5">Church calendar and gathering tools</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/thanksgiving-rsvp')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-burgundy text-gold font-bold text-sm hover:bg-burgundy/90 min-h-[44px] shadow-sm"
            >
              <ClipboardCheck size={16} />
              {thanksgivingRsvpOpen ? 'Grand Family Celebration RSVP' : 'Grand Family Celebration details'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/marrieds-dinner-rsvp')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-burgundy/20 text-burgundy font-bold text-sm hover:bg-burgundy/5 min-h-[44px] shadow-sm"
            >
              <ClipboardCheck size={16} />
              {marriedsRsvpOpen ? 'Marrieds Dinner RSVP' : 'Marrieds Dinner details'}
            </button>
            {isSuperAdmin && (
              <div className="relative" ref={holidayMenuRef}>
                <button
                  type="button"
                  onClick={() => setHolidayMenuOpen((v) => !v)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-burgundy/20 text-burgundy font-bold text-sm hover:bg-burgundy/5 min-h-[44px] shadow-sm"
                  aria-expanded={holidayMenuOpen}
                  aria-haspopup="menu"
                >
                  <ClipboardCheck size={16} />
                  Staff RSVP lists
                  <ChevronDown size={14} className={`transition-transform ${holidayMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {holidayMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-1.5 z-40 min-w-[220px] rounded-xl border border-gray-100 bg-white shadow-lg py-1.5"
                  >
                    {holidayRsvpEvents.map((ev) => (
                      <button
                        key={ev.eventId}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setHolidayMenuOpen(false);
                          navigate(fellowshipRsvpStaffPath(ev.eventId));
                        }}
                        className="w-full text-left px-3.5 py-2.5 text-sm font-semibold text-[#0d1a14] hover:bg-burgundy/5"
                      >
                        {ev.shortName}
                        <span className="block text-[11px] font-medium text-gray-400 mt-0.5">
                          {ev.date}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowQRStation(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 min-h-[44px]"
              title="Check-in QR"
            >
              <QrCodeIcon size={16} className="text-gold" />
              <span className="hidden sm:inline">QR check-in</span>
            </button>
            <div className="bg-white border border-gray-200 p-1 rounded-xl flex items-center">
              <button
                type="button"
                onClick={() => setViewMode('calendar')}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all min-h-[40px] ${
                  viewMode === 'calendar' ? 'bg-burgundy text-gold' : 'text-gray-400 hover:text-burgundy'
                }`}
              >
                <CalendarDays size={14} />
                Calendar
              </button>
              <button
                type="button"
                onClick={() => setViewMode('hub')}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all min-h-[40px] ${
                  viewMode === 'hub' ? 'bg-burgundy text-gold' : 'text-gray-400 hover:text-burgundy'
                }`}
              >
                <LayoutGrid size={14} />
                Overview
              </button>
            </div>
            {canApproveEvents && pendingQueue.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setShowPendingPanel(true);
                  setSearchParams({ pending: '1' });
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 font-bold text-sm min-h-[44px] hover:bg-amber-100"
              >
                <ClipboardCheck size={16} />
                Pending ({pendingQueue.length})
              </button>
            )}
            {(canApproveEvents || canSubmitEvents) && (
              <button
                type="button"
                onClick={() => openAddModal(selectedDate)}
                disabled={!canBypassDateLock && isDayLocked(selectedDate)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-burgundy text-gold font-bold text-sm min-h-[44px] hover:opacity-95 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus size={16} />
                {canApproveEvents ? 'Add event' : 'Request event'}
              </button>
            )}
          </div>
        </div>
      </div>

      {showPendingPanel && canApproveEvents && (
        <div className="bg-white rounded-2xl border border-amber-200/80 shadow-sm p-5 md:p-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-black text-[#0d1a14]">Pending requests</h2>
              <p className="text-xs text-gray-400 mt-0.5">Approve to publish and lock that day (only Super Admin can add another event after)</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowPendingPanel(false);
                setSearchParams({});
              }}
              className="p-2 text-gray-300 hover:text-burgundy rounded-lg"
              aria-label="Close pending"
            >
              <X size={18} />
            </button>
          </div>
          {pendingQueue.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No pending event requests.</p>
          ) : (
            <div className="space-y-3">
              {pendingQueue.map((ev) => (
                <div
                  key={ev.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl border border-amber-100 bg-amber-50/40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-[#0d1a14] text-sm">{ev.title}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {ev.time}
                      {ev.endTime ? ` – ${ev.endTime}` : ''} · {ev.loc}
                    </p>
                    <p className="text-[10px] font-bold text-amber-800/80 mt-1 uppercase tracking-wide">
                      {ev.department || ev.type || 'Ministry'} · Pending
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={reviewingId === ev.id}
                      onClick={() => handleReview(ev.id, 'approve')}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-burgundy text-gold text-xs font-bold min-h-[40px] disabled:opacity-50"
                    >
                      <CheckCircle2 size={14} />
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={reviewingId === ev.id}
                      onClick={() => handleReview(ev.id, 'reject')}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-gray-500 text-xs font-bold min-h-[40px] hover:border-red-200 hover:text-red-700 disabled:opacity-50"
                    >
                      <Ban size={14} />
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {viewMode === 'hub' ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: 'Upcoming', value: stats.upcomingEvents, icon: Calendar, tone: 'burgundy' },
              { label: 'Members', value: stats.totalMembers, icon: Users, tone: 'gold' },
              { label: 'Checked in today', value: stats.checkInsToday, icon: CheckSquare, tone: 'burgundy' },
            ].map((card) => (
              <div key={card.label} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                      card.tone === 'gold' ? 'bg-gold/15 text-gold' : 'bg-burgundy/5 text-burgundy'
                    }`}
                  >
                    <card.icon size={22} />
                  </div>
                </div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{card.label}</p>
                <p className="text-3xl font-black text-[#0d1a14]">{card.value}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 md:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-burgundy/5 text-burgundy flex items-center justify-center shrink-0">
                <ClipboardCheck size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-[#0d1a14]">{thanksgiving.shortName} RSVP</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  {thanksgiving.date} · {thanksgiving.timeLabel} · {thanksgiving.location}
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/thanksgiving-rsvp')}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-burgundy text-gold font-bold text-sm hover:bg-burgundy/90 min-h-[44px] shrink-0"
              >
                {thanksgivingRsvpOpen ? 'Sign up' : 'View details'}
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 md:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-burgundy/5 text-burgundy flex items-center justify-center shrink-0">
                <ClipboardCheck size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-[#0d1a14]">{marriedsDinner.shortName} RSVP</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  {marriedsDinner.date} · {marriedsDinner.timeLabel} · {marriedsDinner.location}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Pledge or Pay Now (Cash App, Zelle, Venmo) — Mark Paid posts to DCB
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/marrieds-dinner-rsvp')}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-burgundy text-gold font-bold text-sm hover:bg-burgundy/90 min-h-[44px] shrink-0"
              >
                {marriedsRsvpOpen ? 'Sign up' : 'View details'}
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {isSuperAdmin && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 md:p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-xl bg-burgundy/5 text-burgundy flex items-center justify-center shrink-0">
                  <ClipboardCheck size={22} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-[#0d1a14]">Staff RSVP lists</p>
                  <p className="text-sm text-gray-500 mt-0.5">Manage fellowship holiday signups</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {holidayRsvpEvents.map((ev) => (
                  <button
                    key={ev.eventId}
                    type="button"
                    onClick={() => navigate(fellowshipRsvpStaffPath(ev.eventId))}
                    className="text-left rounded-xl border border-gray-100 px-4 py-3 hover:border-burgundy/25 hover:bg-burgundy/[0.03] transition-colors"
                  >
                    <p className="font-bold text-sm text-[#0d1a14]">{ev.shortName}</p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{ev.name}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 md:p-8 min-h-[280px] flex flex-col">
              <h2 className="text-lg font-black text-[#0d1a14] flex items-center gap-2 mb-6">
                <TrendingUp size={18} className="text-gold" />
                Engagement
              </h2>
              <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-gray-100 rounded-2xl bg-gray-50/40 py-12">
                <ArrowUpRight size={28} className="text-gold/40 mb-3" />
                <p className="text-sm text-gray-400 font-medium text-center px-4">
                  Attendance trends will appear here as check-ins grow.
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 md:p-8">
              <h3 className="text-lg font-black text-[#0d1a14] mb-5">Up next</h3>
              <div className="space-y-3">
                {stats.upcomingEventsList?.length > 0 ? (
                  stats.upcomingEventsList.map((ev, i) => {
                    const dateObj = new Date((ev.date || '').split('T')[0] + 'T00:00:00');
                    return (
                      <div key={ev.id || i} className="flex items-center gap-3 p-3 rounded-xl border border-gray-50 hover:bg-gray-50">
                        <div className="w-12 h-12 bg-burgundy rounded-xl flex flex-col items-center justify-center text-gold shrink-0">
                          <span className="text-[9px] font-bold uppercase opacity-70">
                            {dateObj.toLocaleString('default', { month: 'short' })}
                          </span>
                          <span className="text-base font-black leading-none">{dateObj.getDate()}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-[#0d1a14] truncate text-sm">{ev.name}</p>
                          <p className="text-[10px] text-gray-400 font-medium mt-0.5">
                            {ev.time || '10:00 AM'} · {ev.location || 'Sanctuary'}
                          </p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-gray-400 py-6 text-center">No upcoming events.</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setViewMode('calendar')}
                className="w-full mt-6 py-3 bg-gray-50 text-burgundy font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-gold-cream/50"
              >
                Open calendar
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col xl:flex-row gap-5">
          {/* Calendar */}
          <div className="flex-1 bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
            <div className="px-4 md:px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#faf9f8]/60">
              <h2 className="text-xl font-bold text-[#0d1a14] tracking-tight">
                {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
              </h2>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => shiftMonth(-1)}
                  className="p-2.5 rounded-xl border border-gray-200 text-gray-500 hover:text-burgundy hover:bg-white min-h-[44px] min-w-[44px] flex items-center justify-center"
                  aria-label="Previous month"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  onClick={goToday}
                  className="px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-burgundy hover:bg-white min-h-[44px]"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => shiftMonth(1)}
                  className="p-2.5 rounded-xl border border-gray-200 text-gray-500 hover:text-burgundy hover:bg-white min-h-[44px] min-w-[44px] flex items-center justify-center"
                  aria-label="Next month"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 bg-[#faf9f8] border-b border-gray-100">
              {WEEKDAYS.map((day) => (
                <div
                  key={day}
                  className="py-2.5 text-center text-[10px] md:text-[11px] font-semibold uppercase tracking-wider text-gray-400"
                >
                  <span className="md:hidden">{day.charAt(0)}</span>
                  <span className="hidden md:inline">{day}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 select-none border-l border-t border-gray-100/80">{renderCalendar()}</div>

            <div className="px-4 md:px-6 py-3 border-t border-gray-100 flex flex-wrap gap-x-4 gap-y-2 text-[10px] font-semibold text-gray-400">
              {[
                { label: 'Service', color: 'bg-burgundy' },
                { label: 'Meeting', color: 'bg-amber-500' },
                { label: 'Outreach', color: 'bg-emerald-500' },
                { label: 'Youth', color: 'bg-gold' },
              ].map((t) => (
                <span key={t.label} className="inline-flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${t.color}`} />
                  {t.label}
                </span>
              ))}
            </div>
          </div>

          {/* Day detail */}
          <aside className="w-full xl:w-[19.5rem] shrink-0">
            <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-5 md:p-6 xl:sticky xl:top-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.18em] mb-1">This day</p>
              <h3 className="text-lg font-bold text-[#0d1a14] leading-snug">{selectedLabel}</h3>

              <div className="mt-5 space-y-3 max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
                {events[selectedDate]?.length ? (
                  events[selectedDate].map((ev, i) => (
                    <div
                      key={ev.id}
                      draggable={canApproveEvents || canEditListedEvent(ev)}
                      onDragStart={(e) => handleDragStart(e, selectedDate, i)}
                      onDragEnd={handleDragEnd}
                      className={`rounded-xl border bg-[#faf9f8] hover:border-burgundy/20 transition-colors overflow-hidden ${
                        ev.status === 'pending'
                          ? 'border-amber-200'
                          : 'border-gray-100'
                      } ${canApproveEvents || canEditListedEvent(ev) ? 'cursor-grab active:cursor-grabbing' : ''}`}
                    >
                      {ev.imageUrl && (
                        <img
                          src={ev.imageUrl}
                          alt=""
                          className="w-full h-28 object-cover cursor-zoom-in"
                          onClick={() => setImagePreviewUrl(ev.imageUrl || null)}
                        />
                      )}
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          {!ev.imageUrl && (
                            <div
                              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                                (ev.type || '').toLowerCase().includes('youth')
                                  ? 'bg-burgundy text-gold'
                                  : 'bg-gold-cream text-gold'
                              }`}
                            >
                              {(ev.type || '').toLowerCase().includes('youth') ? (
                                <Mic2 size={16} />
                              ) : (
                                <Clock size={16} />
                              )}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start gap-2 flex-wrap">
                              <p className="font-bold text-[#0d1a14] text-sm leading-snug flex-1">{ev.title}</p>
                              {ev.status === 'pending' && (
                                <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                                  Pending
                                </span>
                              )}
                              {ev.rsvpEnabled && (
                                <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-burgundy/10 text-burgundy">
                                  Signup
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              {ev.time}
                              {ev.endTime ? ` – ${ev.endTime}` : ''}
                            </p>
                            {(ev.department || ev.type) && (
                              <p className="text-[10px] font-bold text-burgundy/70 mt-1 uppercase tracking-wide">
                                {ev.department || ev.type}
                              </p>
                            )}
                            <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                              <MapPin size={11} />
                              {ev.loc}
                            </p>
                            {ev.description && (
                              <p className="text-xs text-gray-500 mt-2 line-clamp-2">{ev.description}</p>
                            )}
                            {ev.rsvpEnabled && (
                              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                                <button
                                  type="button"
                                  onClick={() => navigate(`/events/${ev.id}/rsvp`)}
                                  className="text-xs font-bold text-burgundy hover:underline"
                                >
                                  Open signup page
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await navigator.clipboard.writeText(
                                        publicEventRsvpShareUrl(ev.id)
                                      );
                                      showToast('WhatsApp signup link copied');
                                    } catch {
                                      showToast('Could not copy link', 'info');
                                    }
                                  }}
                                  className="text-xs font-bold text-burgundy/80 hover:underline"
                                >
                                  Copy WhatsApp link
                                </button>
                              </div>
                            )}
                            {ev.status !== 'pending' && ev.status !== 'rejected' ? (
                              <div className="mt-2">
                                <ShareToAwcChat kind="event" id={ev.id} compact />
                              </div>
                            ) : null}
                          </div>
                        </div>
                        {(canEditListedEvent(ev) || (canApproveEvents && ev.status === 'pending')) && (
                          <div className="flex items-center justify-end gap-1 mt-3 pt-3 border-t border-gray-100">
                            {canApproveEvents && ev.status === 'pending' && (
                              <>
                                <button
                                  type="button"
                                  disabled={reviewingId === ev.id}
                                  onClick={() => handleReview(ev.id, 'approve')}
                                  className="px-2.5 py-1.5 text-[10px] font-bold text-burgundy hover:bg-white rounded-lg"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  disabled={reviewingId === ev.id}
                                  onClick={() => handleReview(ev.id, 'reject')}
                                  className="px-2.5 py-1.5 text-[10px] font-bold text-gray-400 hover:text-red-600 hover:bg-white rounded-lg"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            {canEditListedEvent(ev) && (
                              <button
                                type="button"
                                onClick={() => openEditModal(selectedDate, ev, i)}
                                className="p-2 text-gray-400 hover:text-burgundy hover:bg-white rounded-lg"
                                aria-label="Edit"
                              >
                                <Edit3 size={14} />
                              </button>
                            )}
                            {canEditListedEvent(ev) && (
                              <button
                                type="button"
                                onClick={() => handleDeleteEvent(selectedDate, i)}
                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-white rounded-lg"
                                aria-label="Delete"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-10 px-2 text-center rounded-xl border border-dashed border-gray-200 bg-[#faf9f8]/80">
                    <Calendar size={26} className="text-gray-200 mx-auto mb-3" />
                    <p className="text-sm text-gray-500 font-medium">Nothing scheduled</p>
                    {(canApproveEvents || canSubmitEvents) && (
                      <button
                        type="button"
                        onClick={() => openAddModal(selectedDate)}
                        disabled={!canBypassDateLock && isDayLocked(selectedDate)}
                        className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-burgundy hover:underline disabled:opacity-40 disabled:no-underline"
                      >
                        <Plus size={14} />
                        {canApproveEvents ? 'Add an event' : 'Request an event'}
                      </button>
                    )}
                    {!canBypassDateLock && isDayLocked(selectedDate) && (
                      <p className="text-[10px] text-gray-400 mt-3">This day is locked — only a Super Admin can add another event</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}

      {showQRStation && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-burgundy/95 backdrop-blur-2xl animate-in fade-in duration-500 overflow-hidden p-6">
          <button
            onClick={() => setShowQRStation(false)}
            className="absolute top-8 right-8 p-3 text-gold/50 hover:text-gold transition-all"
            aria-label="Close"
          >
            <X size={36} strokeWidth={1.5} />
          </button>

          <div className="text-center space-y-10 max-w-3xl w-full">
            <div>
              <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-3">
                Check-in QR
              </h2>
              <p className="text-gold/70 text-sm font-bold uppercase tracking-widest mb-6">
                {qrMode === 'kids' ? 'Kids check-in' : 'General check-in'}
              </p>
              <div className="flex items-center justify-center gap-3 mb-8">
                <button
                  onClick={() => setQrMode('general')}
                  className={`px-5 py-2.5 rounded-full font-bold text-xs uppercase tracking-wider border ${
                    qrMode === 'general'
                      ? 'bg-gold border-gold text-[#0d1a14]'
                      : 'border-white/20 text-white/50 hover:text-white'
                  }`}
                >
                  General
                </button>
                <button
                  onClick={() => setQrMode('kids')}
                  className={`px-5 py-2.5 rounded-full font-bold text-xs uppercase tracking-wider border ${
                    qrMode === 'kids'
                      ? 'bg-gold border-gold text-[#0d1a14]'
                      : 'border-white/20 text-white/50 hover:text-white'
                  }`}
                >
                  Kids
                </button>
              </div>
            </div>

            <div className="bg-white p-10 md:p-12 rounded-3xl shadow-2xl inline-block mx-auto">
              <QRCode
                value={`${typeof window !== 'undefined' ? window.location.origin : ''}${
                  qrMode === 'kids' ? '/#/events/kids-checkin' : '/#/events/check-in'
                }`}
                size={220}
                style={{ height: 'auto', maxWidth: '100%', width: '100%' }}
                viewBox="0 0 256 256"
                fgColor="#0d1a14"
              />
              <div className="mt-6 flex items-center justify-center gap-2 text-gray-400">
                <ShieldCheck size={16} className="text-gold" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Scan with phone camera</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
              {[
                { icon: Smartphone, title: 'Open camera', sub: 'iPhone or Android' },
                { icon: Maximize2, title: 'Point at code', sub: 'Opens check-in page' },
                { icon: CheckSquare, title: 'Confirm name', sub: 'Done in seconds' },
              ].map((step) => (
                <div key={step.title} className="bg-white/5 p-5 rounded-2xl border border-white/10">
                  <step.icon size={22} className="text-gold mb-3" />
                  <p className="text-white font-bold text-sm">{step.title}</p>
                  <p className="text-white/40 text-xs mt-1">{step.sub}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/45 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-3xl shadow-2xl border border-gray-100 max-h-[92vh] overflow-hidden flex flex-col">
            <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-gray-50 px-5 sm:px-6 py-4 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-xl font-black text-[#0d1a14]">
                  {editingEvent
                    ? 'Edit event'
                    : canApproveEvents
                      ? 'Schedule event'
                      : 'Request event'}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {selectedLabel}
                  {!editingEvent && !canApproveEvents ? ' · needs approval' : ''}
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2.5 text-gray-300 hover:text-burgundy rounded-xl min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Close"
              >
                <X size={22} />
              </button>
            </div>

            <div className="flex flex-col sm:flex-row min-h-0 flex-1 overflow-y-auto">
              {/* Image on the side — click opens picker popup */}
              <div className="sm:w-[240px] md:w-[280px] shrink-0 p-5 sm:p-6 sm:border-r border-gray-50 bg-gray-50/40">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1 mb-2 block">
                  Calendar image
                </label>
                <button
                  type="button"
                  onClick={() => setImagePickerOpen(true)}
                  className="w-full text-left"
                >
                  {formData.imageUrl ? (
                    <div className="relative rounded-2xl overflow-hidden border border-gray-100 aspect-[4/5] sm:min-h-[280px] max-h-[320px] group">
                      <img
                        src={formData.imageUrl}
                        alt="Event cover"
                        className="w-full h-full object-cover absolute inset-0"
                      />
                      <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="px-4 py-2.5 bg-white text-burgundy rounded-xl text-xs font-bold inline-flex items-center gap-2">
                          <Camera size={14} />
                          Change photo
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-2 w-full min-h-[160px] sm:min-h-[280px] rounded-2xl border-2 border-dashed border-gray-200 bg-white hover:border-burgundy/30 hover:bg-burgundy/[0.03] transition-colors px-4 text-center">
                      <div className="w-11 h-11 rounded-xl bg-burgundy/5 text-burgundy flex items-center justify-center">
                        <ImagePlus size={22} />
                      </div>
                      <span className="text-sm font-bold text-[#0d1a14]">Add image</span>
                      <span className="text-xs text-gray-400">Tap to open photo picker</span>
                    </div>
                  )}
                </button>
              </div>

              {/* Fields */}
              <div className="flex-1 p-5 sm:p-6 space-y-4 min-w-0">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1">Event title</label>
                  <input
                    type="text"
                    value={formData.title || ''}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Sunday Morning Worship"
                    className="mt-1.5 w-full px-4 py-3.5 rounded-xl bg-gray-50 border border-transparent focus:bg-white focus:border-burgundy/20 focus:ring-4 focus:ring-burgundy/5 outline-none font-bold text-[#0d1a14]"
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1 flex items-center gap-1">
                      <Clock size={11} /> Start time
                    </label>
                    <input
                      type="text"
                      value={formData.time || ''}
                      onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                      placeholder="10:00 AM"
                      className="mt-1.5 w-full px-4 py-3.5 rounded-xl bg-gray-50 border border-transparent focus:bg-white focus:border-burgundy/20 outline-none font-bold text-[#0d1a14]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1 flex items-center gap-1">
                      <Clock size={11} /> End time
                    </label>
                    <input
                      type="text"
                      value={formData.endTime || ''}
                      onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                      placeholder="12:00 PM"
                      className="mt-1.5 w-full px-4 py-3.5 rounded-xl bg-gray-50 border border-transparent focus:bg-white focus:border-burgundy/20 outline-none font-bold text-[#0d1a14]"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1 flex items-center gap-1">
                    <MapPin size={11} /> Location
                  </label>
                  <input
                    type="text"
                    value={formData.loc || ''}
                    onChange={(e) => setFormData({ ...formData, loc: e.target.value })}
                    placeholder="Main Sanctuary"
                    className="mt-1.5 w-full px-4 py-3.5 rounded-xl bg-gray-50 border border-transparent focus:bg-white focus:border-burgundy/20 outline-none font-bold text-[#0d1a14]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1 flex items-center gap-1">
                    <Tag size={11} /> Type / department
                  </label>
                  <input
                    type="text"
                    value={formData.type || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        type: e.target.value,
                        department: e.target.value,
                      })
                    }
                    placeholder="Service, Youth Ministries, Prayer meeting…"
                    className="mt-1.5 w-full px-4 py-3.5 rounded-xl bg-gray-50 border border-transparent focus:bg-white focus:border-burgundy/20 outline-none font-bold text-[#0d1a14]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1 flex items-center gap-1">
                    <FileText size={11} /> Description
                  </label>
                  <textarea
                    value={formData.description || ''}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="What should people know about this gathering?"
                    rows={3}
                    className="mt-1.5 w-full px-4 py-3.5 rounded-xl bg-gray-50 border border-transparent focus:bg-white focus:border-burgundy/20 outline-none font-medium text-[#0d1a14] resize-none"
                  />
                </div>

                <div className="rounded-2xl border border-burgundy/15 bg-burgundy/[0.03] p-4 space-y-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(formData.rsvpEnabled)}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          rsvpEnabled: e.target.checked,
                          rsvpTemplate: e.target.checked
                            ? formData.rsvpTemplate || 'simple'
                            : formData.rsvpTemplate,
                        })
                      }
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-burgundy focus:ring-burgundy"
                    />
                    <span>
                      <span className="block text-sm font-bold text-[#0d1a14]">Create signup page</span>
                      <span className="block text-xs text-gray-500 mt-0.5">
                        After save, copy the WhatsApp link (/api/share-rsvp) so the flyer shows in chats.
                        Includes food allergies on both templates.
                      </span>
                    </span>
                  </label>
                  {formData.rsvpEnabled && (
                    <div className="space-y-3 pl-7">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <label className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2.5 cursor-pointer">
                          <input
                            type="radio"
                            name="rsvpTemplate"
                            checked={formData.rsvpTemplate === 'simple'}
                            onChange={() => setFormData({ ...formData, rsvpTemplate: 'simple' })}
                          />
                          <span className="text-sm font-semibold text-[#0d1a14]">
                            Simple
                            <span className="block text-[11px] font-medium text-gray-400">
                              Name, contact, headcount, allergies
                            </span>
                          </span>
                        </label>
                        <label className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2.5 cursor-pointer">
                          <input
                            type="radio"
                            name="rsvpTemplate"
                            checked={formData.rsvpTemplate === 'fellowship'}
                            onChange={() => setFormData({ ...formData, rsvpTemplate: 'fellowship' })}
                          />
                          <span className="text-sm font-semibold text-[#0d1a14]">
                            Fellowship meal
                            <span className="block text-[11px] font-medium text-gray-400">
                              Adults/kids/guests, gift, allergies, consents
                            </span>
                          </span>
                        </label>
                      </div>
                      {formData.rsvpTemplate === 'fellowship' && (
                        <div className="rounded-2xl border border-burgundy/20 bg-white p-4 space-y-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-bold text-[#0d1a14]">Payments</p>
                              <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                                Collect contributions through PLCC Tithe. Paid sign-ups update on their own.
                              </p>
                            </div>
                            <label className="flex shrink-0 items-center gap-2 text-xs font-bold text-[#0d1a14] cursor-pointer">
                              <input
                                type="checkbox"
                                checked={payments.enabled}
                                onChange={(e) => setFormData({ ...formData, rsvpPaymentsEnabled: e.target.checked })}
                                className="h-4 w-4 rounded border-gray-300 text-burgundy focus:ring-burgundy"
                              />
                              Collect payments
                            </label>
                          </div>
                          {payments.enabled && (
                            <>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <label className="block">
                                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1">
                                    Minimum per household
                                  </span>
                                  <span className="relative mt-1.5 flex items-center">
                                    <span className="absolute left-3 text-sm font-bold text-gray-400">$</span>
                                    <input
                                      type="number"
                                      inputMode="numeric"
                                      min={1}
                                      max={1000}
                                      value={payments.min}
                                      onChange={(e) =>
                                        setFormData({ ...formData, rsvpGiftMin: Math.max(1, Math.floor(Number(e.target.value) || 1)) })
                                      }
                                      className="w-full pl-7 pr-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100 outline-none font-semibold text-[#0d1a14] text-sm"
                                    />
                                  </span>
                                </label>
                                <div>
                                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1">
                                    Amount buttons members see
                                  </span>
                                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                    {payments.options.map((n) => (
                                      <span
                                        key={n}
                                        className="inline-flex items-center gap-1 rounded-full bg-burgundy/[0.07] pl-3 pr-1 py-1 text-xs font-bold text-[#0d1a14]"
                                      >
                                        ${n}
                                        {payments.options.length > 1 && (
                                          <button
                                            type="button"
                                            aria-label={`Remove $${n}`}
                                            onClick={() =>
                                              setFormData({ ...formData, rsvpGiftOptions: payments.options.filter((x) => x !== n) })
                                            }
                                            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-gray-500 hover:bg-white"
                                          >
                                            ×
                                          </button>
                                        )}
                                      </span>
                                    ))}
                                    {payments.options.length < 4 && (
                                      <span className="inline-flex items-center gap-1">
                                        <input
                                          type="number"
                                          inputMode="numeric"
                                          min={payments.min}
                                          max={1000}
                                          value={newGiftOption}
                                          onChange={(e) => setNewGiftOption(e.target.value)}
                                          placeholder="$"
                                          aria-label="Add an amount button"
                                          className="w-16 px-2 py-1.5 rounded-lg bg-gray-50 border border-gray-100 text-xs font-semibold text-[#0d1a14] outline-none"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const n = Math.round(Number(newGiftOption));
                                            if (!Number.isFinite(n) || n < payments.min || n > 1000) return;
                                            setFormData({ ...formData, rsvpGiftOptions: [...payments.options, n] });
                                            setNewGiftOption('');
                                          }}
                                          className="rounded-lg border border-dashed border-gray-300 px-2.5 py-1.5 text-xs font-bold text-gray-500"
                                        >
                                          Add
                                        </button>
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-gray-400 mt-1 ml-1">Up to 4, plus Other.</p>
                                </div>
                              </div>
                              <label className="flex items-start gap-3 rounded-xl bg-gray-50 px-3 py-2.5 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={payments.allowPledge}
                                  onChange={(e) => setFormData({ ...formData, rsvpAllowPledge: e.target.checked })}
                                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-burgundy focus:ring-burgundy"
                                />
                                <span>
                                  <span className="block text-sm font-semibold text-[#0d1a14]">Allow pledges</span>
                                  <span className="block text-[11px] text-gray-500">
                                    Members can sign up now and pay later or at the event.
                                  </span>
                                </span>
                              </label>
                              <p className="text-[11px] text-gray-500 leading-relaxed">
                                PLCC Tithe fund:{' '}
                                <span className="font-bold text-[#0d1a14]">
                                  {eventFundName(editingEvent?.event.id, formData.title) || 'the event name'}
                                </span>
                                , set up automatically when you save. Members pay by card, bank, Zelle, Cash App or
                                Venmo on Tithe.
                              </p>
                            </>
                          )}
                        </div>
                      )}
                      <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1">
                          Close signups at (optional)
                        </label>
                        <input
                          type="datetime-local"
                          value={
                            formData.rsvpCloseAt
                              ? (() => {
                                  const d = new Date(formData.rsvpCloseAt);
                                  if (!Number.isFinite(d.getTime())) return '';
                                  const pad = (n: number) => String(n).padStart(2, '0');
                                  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                                })()
                              : ''
                          }
                          onChange={(e) => {
                            const v = e.target.value;
                            setFormData({
                              ...formData,
                              rsvpCloseAt: v ? new Date(v).toISOString() : null,
                            });
                          }}
                          className="mt-1.5 w-full px-4 py-3 rounded-xl bg-white border border-gray-100 outline-none font-medium text-[#0d1a14] text-sm"
                        />
                        <p className="text-[11px] text-gray-400 mt-1 ml-1">
                          Leave blank to close at the end of the day before the event
                        </p>
                      </div>
                      {editingEvent?.event.id && formData.rsvpEnabled && (
                        <p className="text-xs text-gray-500 break-all">
                          Link: {typeof window !== 'undefined' ? window.location.origin : ''}
                          {publicEventRsvpPath(editingEvent.event.id)}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2 pb-1 sticky bottom-0 bg-white">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="sm:px-4 py-3.5 text-gray-400 font-bold text-sm hover:text-burgundy min-h-[44px]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSaving || isUploadingImage}
                    onClick={() => handleSaveEvent()}
                    className="flex-1 py-3.5 bg-burgundy text-gold font-bold text-sm rounded-xl disabled:opacity-50 min-h-[44px]"
                  >
                    {isSaving
                      ? 'Saving…'
                      : editingEvent
                        ? 'Save'
                        : canApproveEvents
                          ? 'Publish'
                          : 'Submit request'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Photo picker popup */}
      {imagePickerOpen && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
              <div>
                <h4 className="text-lg font-black text-[#0d1a14]">Event photo</h4>
                <p className="text-xs text-gray-400 mt-0.5">This shows on the calendar</p>
              </div>
              <button
                type="button"
                onClick={() => setImagePickerOpen(false)}
                className="p-2.5 text-gray-300 hover:text-burgundy rounded-xl min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Close"
              >
                <X size={22} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {formData.imageUrl ? (
                <img
                  src={formData.imageUrl}
                  alt="Preview"
                  className="w-full h-56 object-cover rounded-2xl border border-gray-100"
                />
              ) : (
                <div className="w-full h-40 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center">
                  <ImagePlus size={28} className="text-gray-300" />
                </div>
              )}

              <label className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-burgundy text-gold font-bold text-sm cursor-pointer min-h-[44px]">
                <Camera size={16} />
                {isUploadingImage ? 'Uploading…' : formData.imageUrl ? 'Choose another photo' : 'Choose photo'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={isUploadingImage}
                  onChange={(e) => handleImagePick(e.target.files?.[0])}
                />
              </label>

              {formData.imageUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setFormData({ ...formData, imageUrl: '' });
                    showToast('Photo removed');
                  }}
                  className="w-full py-3 text-sm font-bold text-red-600 hover:bg-red-50 rounded-xl min-h-[44px]"
                >
                  Remove photo
                </button>
              )}

              <button
                type="button"
                onClick={() => setImagePickerOpen(false)}
                className="w-full py-3 text-sm font-bold text-gray-400 hover:text-burgundy min-h-[44px]"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-size image preview */}
      {imagePreviewUrl && (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setImagePreviewUrl(null)}
        >
          <button
            type="button"
            onClick={() => setImagePreviewUrl(null)}
            className="absolute top-6 right-6 p-3 text-white/70 hover:text-white rounded-xl"
            aria-label="Close"
          >
            <X size={28} />
          </button>
          <img
            src={imagePreviewUrl}
            alt="Event"
            className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(29, 55, 44, 0.08); border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default EventsOverview;
