import React from 'react';
import {
  Gamepad2,
  LayoutDashboard,
  User,
  Users,
  Home,
  Calendar,
  Baby,
  Image,
  Shield,
  Landmark,
  Heart,
  HeartHandshake,
  Megaphone,
  ClipboardList,
  MessageSquare,
  Users2,
  Settings,
  ListChecks,
  ScanLine,
  ClipboardCheck,
  BookOpen,
  FileEdit,
  BarChart3,
  Clapperboard,
  Coins,
  HandCoins, HandHeart, Archive, Bell } from 'lucide-react';
import { NavItem, Section } from '../types';
import {
  DEFAULT_FELLOWSHIP_EVENT_ID,
} from '../api/_utils/fellowshipEventConfig';

/** PLCC Tithe — the church's online giving site. Gifts made there are recorded in the DCB. */
export const TITHE_URL = 'https://plcc-tithe.vercel.app/';

export type SimpleNavLink = NavItem & {
  section?: Section;
  children?: SimpleNavLink[];
};

export type SimpleNavGroup = {
  id: string;
  label: string;
  /** When true, group starts collapsed unless the current route is inside it. */
  collapsible?: boolean;
  items: SimpleNavLink[];
};

/** Everyday menu — grouped for a cleaner left panel. */
export const SIMPLE_NAV_GROUPS: SimpleNavGroup[] = [
  {
    id: 'main',
    label: 'Main',
    items: [
      { label: 'Home', path: '/dashboard', icon: <LayoutDashboard size={18} />, section: Section.Dashboard },
      { label: 'Members', path: '/members', icon: <Users size={18} />, section: Section.People },
      { label: 'My Family', path: '/family', icon: <Heart size={18} />, section: Section.People },
      { label: 'My Profile', path: '/church-profile', icon: <User size={18} />, section: Section.People },
      { label: 'Households', path: '/households', icon: <Home size={18} />, section: Section.People },
    ],
  },
  {
    id: 'attendance',
    label: 'Attendance',
    items: [
      {
        label: 'Sessions',
        path: '/attendance/sessions',
        icon: <ClipboardList size={18} />,
        section: Section.Attendance,
      },
      {
        label: 'Dashboard',
        path: '/attendance/dashboard',
        icon: <BarChart3 size={18} />,
        section: Section.Attendance,
      },
      {
        label: "Today's check-ins",
        path: '/events/who-checked-in',
        icon: <ListChecks size={18} />,
        section: Section.Attendance,
      },
    ],
  },
  {
    id: 'events',
    label: 'Events & check-in',
    collapsible: true,
    items: [
      { label: 'Overview', path: '/events/overview', icon: <Calendar size={18} />, section: Section.Events },
      { label: 'Serve opportunities', path: '/events/serve', icon: <HeartHandshake size={18} />, section: Section.Events },
      {
        // One entry for every event with an RSVP on; pick the event on the page.
        label: 'Event RSVPs',
        path: '/events/cookout-rsvps',
        icon: <ClipboardCheck size={18} />,
        section: Section.Events,
      },
      {
        label: 'RSVP Archive',
        path: '/events/rsvp-archive',
        icon: <Archive size={18} />,
        section: Section.Events,
      },
      {
        label: 'Start check-in',
        path: '/events/check-someone-in',
        icon: <ScanLine size={18} />,
        section: Section.Events,
      },
      {
        label: 'Kids Kiosk',
        path: '/events/kids-kiosk',
        icon: <Baby size={18} />,
        section: Section.Events,
      },
      {
        label: 'Kids Plans',
        path: '/events/kids-plans',
        icon: <Image size={18} />,
        section: Section.Events,
      },
      {
        label: 'Kids Bucks',
        path: '/events/kids-bucks',
        icon: <Coins size={18} />,
        section: Section.Events,
      },
      {
        label: 'PLCC Ark',
        path: '/events/ark',
        icon: <Gamepad2 size={18} />,
        section: Section.Events,
      },
      {
        label: 'Flyer share',
        path: '/events/flyer-share',
        icon: <Megaphone size={18} />,
        section: Section.Events,
      },
      // Moved here from the account menu ("System Alerts")
      { label: 'Event alerts', path: '/events/alerts', icon: <Bell size={18} />, section: Section.Events },
      { label: 'Consent', path: '/admin/consent-management', icon: <Shield size={18} />, section: Section.Events },
    ],
  },
  {
    id: 'giving',
    label: 'Giving',
    items: [
      { label: 'Give', path: '/giving', icon: <HandCoins size={18} />, section: Section.Giving },
      { label: 'Fundraisers', path: '/fundraisers', icon: <Coins size={18} />, section: Section.Giving },
      {
        label: 'Finance',
        path: '/finance/ledger',
        icon: <Landmark size={18} />,
        section: Section.Finance,
      },
    ],
  },
  {
    id: 'connect',
    label: 'Connect',
    items: [
      { label: 'Community', path: '/community/feed', icon: <Users2 size={18} />, section: Section.Community },
      { label: 'Sermon Notes', path: '/community/sermon-notes', icon: <BookOpen size={18} />, section: Section.Community },
      { label: 'Sermon Manager', path: '/community/sermons', icon: <FileEdit size={18} />, section: Section.Community },
      { label: 'Daily Devotional', path: '/community/daily-devotional', icon: <BookOpen size={18} />, section: Section.Community },
      { label: 'Prayer', path: '/community/prayer-wall', icon: <Heart size={18} />, section: Section.Community },
      { label: 'Prayer Watch', path: '/community/prayer-watch', icon: <HandHeart size={18} />, section: Section.Community },
      { label: 'Announcements', path: '/communication/announcements', icon: <Megaphone size={18} />, section: Section.Communication },
      { label: 'Minutes', path: '/communication/minutes', icon: <ClipboardList size={18} />, section: Section.Communication },
      { label: 'Policies', path: '/admin/policies', icon: <BookOpen size={18} />, section: Section.More },
      { label: 'How To Videos', path: '/help/how-to-videos', icon: <Clapperboard size={18} />, section: Section.Community },
      { label: 'Chat', path: '/community/chat', icon: <MessageSquare size={18} />, section: Section.Community },
    ],
  },
  {
    id: 'account',
    label: 'Account',
    items: [
      { label: 'Settings', path: '/settings', icon: <Settings size={18} />, section: Section.More },
    ],
  },
];

/** Flat list kept for any callers that still expect a single array. */
export const SIMPLE_NAV: SimpleNavLink[] = SIMPLE_NAV_GROUPS.flatMap((g) =>
  g.items.flatMap((item) => (item.children?.length ? [item, ...item.children] : [item]))
);

/** Staff path for a fellowship RSVP event (Cookout uses default query-less URL). */
/** Staff RSVP list for one event. Always names the event (no id = next upcoming event). */
export function fellowshipRsvpStaffPath(eventId: string): string {
  return `/events/cookout-rsvps?eventId=${encodeURIComponent(eventId || DEFAULT_FELLOWSHIP_EVENT_ID)}`;
}
