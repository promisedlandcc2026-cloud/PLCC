import React from 'react';
import {
  LayoutDashboard,
  Users,
  HeartHandshake,
  Tag,
  Calendar,
  FileText,
  CheckSquare,
  MoreHorizontal,
  BarChart,
  ShieldCheck,
  Database,
  ClipboardList,
  Link,
  Settings,
  Users2,
  Landmark,
  Building2,
  Megaphone
} from 'lucide-react';
import { Section } from '../types';

export const SECTIONS = [
  { id: Section.Dashboard, label: 'Dashboard', icon: React.createElement(LayoutDashboard, { size: 18 }) },
  { id: Section.People, label: 'People', icon: React.createElement(Users, { size: 18 }) },
  { id: Section.Community, label: 'Community', icon: React.createElement(Users2, { size: 18 }) },
  { id: Section.Giving, label: 'Giving', icon: React.createElement(HeartHandshake, { size: 18 }) },
  { id: Section.Finance, label: 'Treasury', icon: React.createElement(Landmark, { size: 18 }) },
  { id: Section.Tags, label: 'Tags', icon: React.createElement(Tag, { size: 18 }) },
  { id: Section.Attendance, label: 'Attendance', icon: React.createElement(ClipboardList, { size: 18 }) },
  { id: Section.Events, label: 'Events', icon: React.createElement(Calendar, { size: 18 }) },
  { id: Section.Forms, label: 'Forms', icon: React.createElement(FileText, { size: 18 }) },
  { id: Section.FollowUps, label: 'Follow Ups', icon: React.createElement(CheckSquare, { size: 18 }) },
  { id: Section.Communication, label: 'Communication', icon: React.createElement(Megaphone, { size: 18 }) },
  { id: Section.More, label: 'More', icon: React.createElement(MoreHorizontal, { size: 18 }), isMore: true },
];

export const MORE_ITEMS = [
  { label: 'Settings Hub', path: '/settings', icon: React.createElement(Settings, { size: 16 }) },
  { label: 'Staff & Roles', path: '/admin/users', icon: React.createElement(ShieldCheck, { size: 16 }) },
  { label: 'Organization', path: '/settings?tab=organization', icon: React.createElement(Building2, { size: 16 }) },
  { label: 'Audit Log', path: '/settings?tab=audit', icon: React.createElement(ClipboardList, { size: 16 }) },
  { label: 'Reports & Insights', path: '/reports', icon: React.createElement(BarChart, { size: 16 }) },
];