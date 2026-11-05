import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Cake,
  Music,
  Video,
  HandHeart,
  ChevronRight,
  ChevronDown,
  Utensils,
  ShieldCheck,
  X,
  Archive,
  RotateCcw,
  FileText,
  QrCode,
  CalendarDays,
} from 'lucide-react';
import { useNav } from '../App';
import MeetingMinutesWidget from '../components/Dashboard/MeetingMinutesWidget';
import HomeHeroBanner, { type HomeNextService } from '../components/Dashboard/HomeHeroBanner';
import HomeQuickActions from '../components/Dashboard/HomeQuickActions';
import HomeEventsCarousel, { type HomeEventCard } from '../components/Dashboard/HomeEventsCarousel';
import HomeWeekList from '../components/Dashboard/HomeWeekList';
import HomeLowerGrid from '../components/Dashboard/HomeLowerGrid';
import HomeHowToVideos, { type HomeHowToVideo } from '../components/Dashboard/HomeHowToVideos';
import VaultNewsCard from '../components/Dashboard/VaultNewsCard';
import SendAlertCard from '../components/Dashboard/SendAlertCard';
import CelebrationsCard from '../components/Dashboard/CelebrationsCard';
import HomeLeaderboard from '../components/Dashboard/HomeLeaderboard';
import WhatsNewCard from '../components/Dashboard/WhatsNewCard';
import { type DailyInspiration } from '../components/Dashboard/DailyWordCard';
import {
  type HappeningAnnouncement,
  type HappeningBirthday,
  type HappeningPrayer,
} from '../components/Dashboard/HappeningStrip';
import { isCookoutRsvpClosed } from '../api/_utils/cookoutRsvpWindow';
import {
  DEFAULT_FELLOWSHIP_EVENT_ID,
  THANKSGIVING_2026_EVENT_ID,
  getFellowshipEventConfig,
  isFellowshipRsvpClosed,
  SHOW_BUILT_IN_EVENTS,
} from '../api/_utils/fellowshipEventConfig';
import {
  dismissHomeItem,
  isDismissed,
  isFellowshipEventPast,
  listDismissals,
  promoDismissalKey,
  restoreHomeItem,
  type DashboardDismissalEntry,
} from '../lib/dashboardHomeDismissals';
import { fetchWithTimeout, getAuthHeaders } from '../lib/api';
import { courtesyGreetingName } from '../lib/courtesyName';
import {
  eventCalendarYmd,
  eventLocalNoon,
  formatEventWhenLabel,
  toEventYmd,
} from '../lib/eventDate';

const COOKOUT_PROMO_KEY = promoDismissalKey(DEFAULT_FELLOWSHIP_EVENT_ID);
const THANKSGIVING_PROMO_KEY = promoDismissalKey(THANKSGIVING_2026_EVENT_ID);

function eventSortMs(e?: { date?: string; start_time?: string; time?: string } | null): number {
  const ymd = eventCalendarYmd(e);
  if (!ymd) return Number.MAX_SAFE_INTEGER;
  return eventLocalNoon(ymd).getTime();
}

function normalizeEvents(raw: any): HomeEventCard[] {
  const list: any[] = Array.isArray(raw?.events)
    ? raw.events
    : Array.isArray(raw)
      ? raw
      : [];
  const now = Date.now() - 12 * 60 * 60 * 1000;
  return list
    .map((e) => ({
      id: e.id,
      title: e.title || e.name || 'Church event',
      start_time: e.start_time || e.starts_at || undefined,
      date: toEventYmd(e.date) || undefined,
      time: e.time ? String(e.time) : undefined,
      location: e.location || e.place || null,
      image_url: e.image_url || e.imageUrl || null,
      type: String(e.type || e.category || ''),
    }))
    .filter((e) => {
      const t = eventSortMs(e);
      return t === Number.MAX_SAFE_INTEGER ? true : t >= now;
    })
    .sort((a, b) => eventSortMs(a) - eventSortMs(b));
}

function pickNextService(events: HomeEventCard[]): HomeNextService | null {
  if (!events.length) return null;
  const scored = [...events].sort((a, b) => {
    const score = (e: HomeEventCard & { type?: string }) => {
      const t = `${e.title} ${e.type || ''}`.toLowerCase();
      if (/sunday|worship|service/.test(t)) return 0;
      return 1;
    };
    return score(a as any) - score(b as any);
  });
  const e = scored[0];
  const dateYmd = eventCalendarYmd(e) || undefined;
  const whenLabel = formatEventWhenLabel({
    date: e.date,
    start_time: e.start_time,
    time: e.time,
    includeWeekdayLong: true,
  });
  return { id: e.id, title: e.title, whenLabel, dateYmd };
}

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { isBirthdayToday, userName, userId } = useNav();
  const [dismissalRevision, setDismissalRevision] = useState(0);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);

  const [homeLoading, setHomeLoading] = useState(true);
  const [inspiration, setInspiration] = useState<DailyInspiration | null>(null);
  const [announcement, setAnnouncement] = useState<HappeningAnnouncement | null>(null);
  const [prayer, setPrayer] = useState<HappeningPrayer | null>(null);
  const [birthdays, setBirthdays] = useState<HappeningBirthday[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<HomeEventCard[]>([]);
  const [sermon, setSermon] = useState<{
    id?: string;
    title: string;
    speaker?: string | null;
    date?: string | null;
  } | null>(null);
  const [howToVideos, setHowToVideos] = useState<HomeHowToVideo[]>([]);
  const [pendingSignatureCount, setPendingSignatureCount] = useState(0);

  const fellowship = useMemo(() => getFellowshipEventConfig(), []);
  const thanksgiving = useMemo(
    () => getFellowshipEventConfig(THANKSGIVING_2026_EVENT_ID),
    []
  );
  const cookoutPast = useMemo(
    () => isFellowshipEventPast(fellowship.date),
    [fellowship.date]
  );
  const thanksgivingPast = useMemo(
    () => isFellowshipEventPast(thanksgiving.date),
    [thanksgiving.date]
  );

  const bumpDismissals = useCallback(() => {
    setDismissalRevision((n) => n + 1);
  }, []);

  const archivedItems = useMemo(() => {
    return listDismissals(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, dismissalRevision]);

  const cookoutDismissed = useMemo(() => {
    return isDismissed(userId, COOKOUT_PROMO_KEY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, dismissalRevision]);

  const thanksgivingDismissed = useMemo(() => {
    return isDismissed(userId, THANKSGIVING_PROMO_KEY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, dismissalRevision]);

  const showCookoutPromo = SHOW_BUILT_IN_EVENTS && !cookoutPast && !cookoutDismissed;
  const showThanksgivingPromo = SHOW_BUILT_IN_EVENTS && !thanksgivingPast && !thanksgivingDismissed;

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const accountFirst = (userName || 'Friend').trim().split(/\s+/)[0] || 'Friend';
  const [heroName, setHeroName] = useState(accountFirst);

  useEffect(() => {
    setHeroName(accountFirst);
  }, [accountFirst]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const loadGreetingName = async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetchWithTimeout(
          '/api/vault?resource=people&subResource=member-self',
          { headers },
          20_000
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled || !res.ok || !data?.ok || !data.linked) return;
        let addressAs = data.addressAs;
        if (addressAs !== 'brother' && addressAs !== 'sister') {
          try {
            const saved = JSON.parse(localStorage.getItem('awc_vault_member_address_as_v1') || '{}');
            const local = String(saved?.[data.memberId] || '').trim().toLowerCase();
            if (local === 'brother' || local === 'sister') addressAs = local;
          } catch {
            /* The church record still decides the greeting when it has the choice. */
          }
        }
        const next = courtesyGreetingName({
          firstName: data.firstName,
          lastName: data.lastName,
          preferredName: data.preferredName,
          addressAs,
          birthday: data.birthday,
          fallback: accountFirst,
        });
        if (!cancelled && next) setHeroName(next);
      } catch {
        /* Keep the account first name if the church profile cannot be read. */
      }
    };
    void loadGreetingName();
    return () => {
      cancelled = true;
    };
  }, [userId, accountFirst]);

  const nextService = useMemo(() => pickNextService(upcomingEvents), [upcomingEvents]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const headers = await getAuthHeaders();
        const [
          eventsRes,
          wordRes,
          annRes,
          prayerRes,
          bdayRes,
          sermonsRes,
          howToRes,
          minutesRes,
          ackRes,
        ] = await Promise.all([
          fetchWithTimeout('/api/vault?resource=events', { headers }, 45_000),
          fetchWithTimeout(
            '/api/vault?resource=community&subResource=inspiration&today=1',
            { headers },
            45_000
          ),
          fetchWithTimeout(
            '/api/vault?resource=communication&subResource=announcements',
            { headers },
            45_000
          ),
          fetchWithTimeout(
            '/api/vault?resource=community&subResource=prayer&status=Published&limit=5',
            { headers },
            45_000
          ),
          fetchWithTimeout(
            '/api/vault?resource=organization&subResource=birthdays-week&days=7',
            { headers },
            45_000
          ),
          fetchWithTimeout(
            '/api/vault?resource=community&subResource=sermons',
            { headers },
            45_000
          ),
          fetchWithTimeout('/api/vault?resource=howto-videos', { headers }, 45_000),
          userId
            ? fetchWithTimeout('/api/minutes?resource=minutes', { headers }, 45_000)
            : Promise.resolve(null),
          userId
            ? fetchWithTimeout(
                `/api/minutes?resource=minutes&subResource=acknowledgements&userId=${userId}`,
                { headers },
                45_000
              )
            : Promise.resolve(null),
        ]);

        const [
          eventsData,
          wordData,
          annData,
          prayerData,
          bdayData,
          sermonsData,
          howToData,
          minutesData,
          ackData,
        ] = await Promise.all([
          eventsRes.json().catch(() => null),
          wordRes.json().catch(() => null),
          annRes.json().catch(() => null),
          prayerRes.json().catch(() => null),
          bdayRes.json().catch(() => null),
          sermonsRes.json().catch(() => null),
          howToRes.json().catch(() => null),
          minutesRes ? minutesRes.json().catch(() => null) : null,
          ackRes ? ackRes.json().catch(() => null) : null,
        ]);

        if (cancelled) return;

        setUpcomingEvents(normalizeEvents(eventsData));

        if (wordData?.ok) {
          setInspiration(wordData.inspiration || null);
        }

        const anns = Array.isArray(annData?.announcements) ? annData.announcements : [];
        setAnnouncement(anns[0] || null);

        const prayers = Array.isArray(prayerData)
          ? prayerData
          : Array.isArray(prayerData?.requests)
            ? prayerData.requests
            : [];
        setPrayer(prayers[0] || null);

        setBirthdays(Array.isArray(bdayData?.birthdays) ? bdayData.birthdays : []);

        const sermons = Array.isArray(sermonsData?.sermons) ? sermonsData.sermons : [];
        if (sermons[0]) {
          setSermon({
            id: sermons[0].id,
            title: sermons[0].title,
            speaker: sermons[0].speaker,
            date: sermons[0].date,
          });
        }

        const videos = Array.isArray(howToData?.videos) ? howToData.videos : [];
        const mapped = videos.map((v: any) => ({
          id: String(v.id),
          title: String(v.title || 'How-to video'),
          description: v.description ?? null,
          video_url: v.video_url,
          thumbnail_url: v.thumbnail_url ?? null,
          category: String(v.category || 'vault'),
        }));
        // Home strip highlights PLCC Vault first; fall back to any visible videos.
        const vaultFirst = [
          ...mapped.filter((v) => v.category === 'vault'),
          ...mapped.filter((v) => v.category !== 'vault'),
        ];
        setHowToVideos(vaultFirst);

        if (minutesData?.ok && ackData?.ok && userId) {
          const docs = (minutesData.documents || []).filter((d: any) => d.require_signature);
          const signed = new Set(
            (ackData.acknowledgements || []).map((a: any) => a.document_id)
          );
          setPendingSignatureCount(docs.filter((d: any) => !signed.has(d.id)).length);
        }
      } catch {
        /* keep defaults */
      } finally {
        if (!cancelled) setHomeLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const toolActions = [
    {
      label: 'Upcoming events',
      detail: 'Full calendar',
      icon: CalendarDays,
      path: '/events/overview',
    },
    {
      label: 'Care & follow-ups',
      detail: 'People waiting for a call or visit',
      icon: HandHeart,
      path: '/follow-ups',
    },
    {
      label: 'Consent & food allergy forms',
      detail: 'Open and sign church forms',
      icon: ShieldCheck,
      path: '/admin/consent-management?tab=forms',
    },
    {
      label: 'Worship Arts',
      detail: 'Setlists & tech specs',
      icon: Music,
      path: '/community/worship-tools',
    },
    {
      label: 'Broadcast',
      detail: 'Live streaming archive',
      icon: Video,
      path: '/community/video',
    },
    {
      label: 'Check someone in',
      detail: 'Adult or kids check-in',
      icon: QrCode,
      path: '/events/check-someone-in',
    },
  ];

  const handleDismissCookout = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!userId) return;
    dismissHomeItem(userId, COOKOUT_PROMO_KEY, {
      title: fellowship.name || 'Fellowship Cookout',
      kind: 'promo',
    });
    bumpDismissals();
  };

  const handleDismissThanksgiving = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!userId) return;
    dismissHomeItem(userId, THANKSGIVING_PROMO_KEY, {
      title: thanksgiving.name || 'Grand Family Celebration',
      kind: 'promo',
    });
    bumpDismissals();
  };

  const handleRestore = (key: string) => {
    if (!userId) return;
    restoreHomeItem(userId, key);
    bumpDismissals();
  };

  const kindLabel = (entry: DashboardDismissalEntry) =>
    entry.kind === 'minutes' ? 'Pending signature' : 'Home promo';

  const archiveRows = useMemo(() => {
    const rows = [...archivedItems];
    if (SHOW_BUILT_IN_EVENTS && thanksgivingPast && !archivedItems.some((r) => r.key === THANKSGIVING_PROMO_KEY)) {
      rows.push({
        key: THANKSGIVING_PROMO_KEY,
        entry: {
          at: thanksgiving.date,
          title: thanksgiving.name || 'Grand Family Celebration',
          kind: 'promo',
        },
      });
    }
    return rows;
  }, [
    archivedItems,
    cookoutPast,
    fellowship.date,
    fellowship.name,
    thanksgivingPast,
    thanksgiving.date,
    thanksgiving.name,
  ]);

  return (
    <div className="w-full pb-8 md:pb-12 animate-in fade-in duration-500 flex flex-col">
      {/* Full-bleed hero: sidebar edge → right edge of main */}
      <HomeHeroBanner
        greeting={greeting}
        userName={heroName}
        verseText={inspiration?.text}
        verseReference={inspiration?.reference}
        nextService={nextService}
      />

      <div className="w-full max-w-6xl mx-auto px-4 md:px-8 pt-5 md:pt-8 flex flex-col gap-6 md:gap-8">
      {isBirthdayToday && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-burgundy px-4 py-3.5 sm:px-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-gold text-burgundy flex items-center justify-center shrink-0">
              <Cake size={18} strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-black text-white tracking-tight">Happy birthday!</p>
              <p className="text-xs text-gold/90 font-medium">Celebrating you today</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/settings?tab=personal')}
            className="px-4 py-2.5 bg-gold text-burgundy font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-white transition-colors shrink-0"
          >
            View profile
          </button>
        </div>
      )}

      <HomeQuickActions />

      <WhatsNewCard />

      <HomeLeaderboard />

      <VaultNewsCard />

      <CelebrationsCard />

      <SendAlertCard />

      <div
        className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-start"
        data-home-events-section="true"
      >
        <div className="lg:col-span-7 min-w-0">
          <HomeEventsCarousel events={upcomingEvents} loading={homeLoading} />
        </div>
        <div className="lg:col-span-5 min-w-0">
          <HomeWeekList events={upcomingEvents} loading={homeLoading} />
        </div>
      </div>

      <HomeHowToVideos videos={howToVideos} loading={homeLoading} />

      <HomeLowerGrid
        announcement={announcement}
        prayer={prayer}
        birthdays={birthdays}
        pendingSignatureCount={pendingSignatureCount}
        sermon={sermon}
        inspiration={inspiration}
        loading={homeLoading}
      />

      <MeetingMinutesWidget
        userId={userId}
        dismissalRevision={dismissalRevision}
        onDismissed={bumpDismissals}
      />

      {showThanksgivingPromo && (
        <div className="relative">
          <button
            type="button"
            onClick={() => navigate('/thanksgiving-rsvp')}
            className="w-full text-left rounded-2xl border border-burgundy/15 bg-burgundy/5 hover:bg-burgundy/[0.08] p-4 sm:p-5 transition-colors group"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pr-8">
              <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-burgundy text-gold flex items-center justify-center shrink-0">
                  <Utensils size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#8A6A2E] mb-0.5">
                    Coming up · Dec 6 · 12–7 PM
                  </p>
                  <h2 className="text-base font-black text-[#0d1a14] tracking-tight">
                    {thanksgiving.shortName}
                  </h2>
                  <p className="text-xs text-gray-600 font-medium mt-1 leading-snug max-w-xl">
                    {isFellowshipRsvpClosed(thanksgiving)
                      ? 'Online RSVPs are closed. Event details for Sunday, December 6.'
                      : 'Sign up your family — dinner seats, guests, and any food allergies.'}
                  </p>
                </div>
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={handleDismissThanksgiving}
            className="absolute top-3 right-3 p-2 rounded-xl text-gray-400 hover:text-burgundy hover:bg-white/80"
            title="Hide from Home"
            aria-label="Hide Grand Family Celebration RSVP from Home"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {showCookoutPromo && (
        <div className="relative">
          <button
            type="button"
            onClick={() => navigate('/fellowship-cookout')}
            className="w-full text-left rounded-2xl border border-burgundy/15 bg-burgundy/5 hover:bg-burgundy/[0.08] p-4 sm:p-5 transition-colors group"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pr-8">
              <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-burgundy text-gold flex items-center justify-center shrink-0">
                  <Utensils size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#8A6A2E] mb-0.5">
                    Coming up · Sept 20 · 2–6 PM
                  </p>
                  <h2 className="text-base font-black text-[#0d1a14] tracking-tight">
                    {fellowship.name}
                  </h2>
                  <p className="text-xs text-gray-600 font-medium mt-1 leading-snug max-w-xl">
                    {isCookoutRsvpClosed()
                      ? 'Online RSVPs are closed. Event details for Sunday, September 20, 2:00–6:00 PM.'
                      : 'Sign up your family — how many are coming and any food allergies.'}
                  </p>
                </div>
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={handleDismissCookout}
            className="absolute top-3 right-3 p-2 rounded-xl text-gray-400 hover:text-burgundy hover:bg-white/80"
            title="Hide from Home"
            aria-label="Hide Fellowship Cookout from Home"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <section>
        <button
          type="button"
          onClick={() => setToolsOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3.5 shadow-sm hover:border-burgundy/15 transition-colors"
          aria-expanded={toolsOpen}
        >
          <div className="text-left min-w-0">
            <h2 className="text-sm font-black text-[#0d1a14] tracking-tight">More tools</h2>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mt-0.5">
              Events, check-in, worship, care
            </p>
          </div>
          <ChevronDown
            size={18}
            className={`text-gray-400 shrink-0 transition-transform ${toolsOpen ? 'rotate-180' : ''}`}
          />
        </button>
        {toolsOpen && (
          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {toolActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.path}
                  type="button"
                  onClick={() => navigate(action.path)}
                  className="flex items-center gap-3 text-left rounded-xl border border-gray-100 bg-gray-50/80 hover:bg-white hover:border-burgundy/20 px-3.5 py-3 transition-all group"
                >
                  <div className="w-9 h-9 rounded-lg bg-burgundy/5 text-burgundy flex items-center justify-center shrink-0 group-hover:bg-burgundy group-hover:text-gold transition-colors">
                    <Icon size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-[#0d1a14] tracking-tight truncate">
                      {action.label}
                    </p>
                    <p className="text-xs text-gray-600 font-medium truncate mt-0.5">{action.detail}</p>
                  </div>
                  <ChevronRight size={16} className="text-gray-400 group-hover:text-burgundy shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </section>

      {archiveRows.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setArchiveOpen((o) => !o)}
            className="w-full flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3.5 shadow-sm hover:border-burgundy/15 transition-colors"
            aria-expanded={archiveOpen}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-gray-50 text-gray-500 flex items-center justify-center shrink-0">
                <Archive size={18} />
              </div>
              <div className="text-left min-w-0">
                <h2 className="text-sm font-black text-[#0d1a14] tracking-tight">
                  Archived on Home
                </h2>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  {archiveRows.length} hidden item{archiveRows.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>
            <ChevronDown
              size={18}
              className={`text-gray-400 shrink-0 transition-transform ${archiveOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {archiveOpen && (
            <div className="mt-2 rounded-2xl border border-gray-100 bg-white divide-y divide-gray-50 overflow-hidden">
              {archiveRows.map(({ key, entry }) => {
                const isPastPromo =
                  (key === COOKOUT_PROMO_KEY && cookoutPast) ||
                  (key === THANKSGIVING_PROMO_KEY && thanksgivingPast);
                return (
                  <div key={key} className="flex items-center gap-3 px-4 py-3.5">
                    <div className="w-9 h-9 rounded-lg bg-burgundy/5 text-burgundy flex items-center justify-center shrink-0">
                      {entry.kind === 'minutes' ? <FileText size={16} /> : <Utensils size={16} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-[#0d1a14] truncate">{entry.title}</p>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mt-0.5">
                        {isPastPromo ? 'Ended event' : kindLabel(entry)}
                      </p>
                    </div>
                    {isPastPromo ? (
                      <span className="text-[10px] font-black uppercase tracking-widest text-gray-300 shrink-0">
                        Past
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleRestore(key)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-burgundy hover:bg-burgundy/5 shrink-0"
                      >
                        <RotateCcw size={12} />
                        Restore
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
      </div>
    </div>
  );
};

export default DashboardPage;
