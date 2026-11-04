import React from 'react';

export enum Role {
  // Admin / Staff
  SUPER_ADMIN = 'SUPER_ADMIN',
  PASTOR = 'PASTOR',
  MINISTRY_LEADER = 'MINISTRY_LEADER',
  FINANCE = 'FINANCE',
  MEDIA_TEAM = 'MEDIA_TEAM',
  ADMIN_STAFF = 'ADMIN_STAFF',
  STAFF = 'STAFF',
  SECRETARY = 'SECRETARY',
  ASST_SECRETARY = 'ASST_SECRETARY',
  FIRST_LADY = 'FIRST_LADY',
  WORSHIP_TEAM = 'WORSHIP_TEAM',
  SUNDAY_SCHOOL_TEACHER = 'SUNDAY_SCHOOL_TEACHER',
  VOLUNTEER = 'VOLUNTEER',
  /** Shared kids-desk tablet — check-in / check-out only */
  KIOSK = 'KIOSK',
  /** Fundraisers only — nothing else in the Vault */
  ACCOUNTANT = 'ACCOUNTANT',

  // Public / User
  GUEST = 'GUEST',
  MEMBER = 'MEMBER',
  PARENT = 'PARENT',
  TEACHER = 'TEACHER',
  YOUTH = 'YOUTH',
  PENDING = 'PENDING',

  // Legacy fallback
  ADMIN = 'ADMIN',
  USER = 'USER'
}

export enum Section {
  Dashboard = 'dashboard',
  People = 'people',
  Giving = 'giving',
  Finance = 'finance',
  Tags = 'tags',
  Attendance = 'attendance',
  Events = 'events',
  Forms = 'forms',
  FollowUps = 'follow-ups',
  Communication = 'communication',
  More = 'more',
  Community = 'community'
}

export enum FollowUpStatus {
  Pending = 'Pending',
  InProgress = 'In Progress',
  Completed = 'Completed',
  Archived = 'Archived'
}

export enum FollowUpPriority {
  Low = 'Low',
  Medium = 'Medium',
  High = 'High',
  Urgent = 'Urgent'
}

export enum FollowUpType {
  NewVisitor = 'New Visitor',
  PastoralCare = 'Pastoral Care',
  PrayerRequest = 'Prayer Request',
  MissedService = 'Missed Service',
  General = 'General',
  Discipleship = 'Discipleship'
}

export interface FollowUp {
  id: string;
  member_id: string;
  assigned_to_id?: string;
  status: FollowUpStatus;
  priority: FollowUpPriority;
  type: FollowUpType;
  notes?: string;
  due_date?: string;
  created_at: string;
  updated_at: string;
  member?: { first_name: string; last_name: string; avatar_url?: string };
  assigned_to?: { first_name: string; last_name: string; avatar_url?: string };
}

export interface Child {
  id?: string;
  name: string;
  age: string;
  notes?: string;
  needsPromote?: boolean;
  structured?: boolean;
  legacyIndex?: number;
  /** Linked by the church office; shown, but only the office can remove. */
  guardianOnly?: boolean;
}

export interface NavItem {
  label: string;
  path?: string;
  href?: string;
  icon?: React.ReactNode;
  children?: NavItem[];
  requiredRole?: Role[];
}

export interface SectionConfig {
  id: Section;
  label: string;
  icon: React.ReactNode;
  isMore?: boolean;
  requiredRole?: Role[];
}

export type TagCategory = 'Spiritual' | 'Service' | 'Demographic' | 'Event' | 'Other';

export interface Tag {
  id: string;
  name: string;
  category: TagCategory;
  color: string;
  count?: number; // For UI display
}

export type ReportCategory = 'Finance' | 'People' | 'Attendance' | 'Other';

export interface Report {
  id: string;
  name: string;
  description?: string;
  category: ReportCategory;
  query_config: Record<string, any>;
  created_by?: string;
  created_at?: string;
}

export interface FollowUpTemplate {
  id: string;
  name: string;
  type: 'Email' | 'SMS' | 'Script' | 'Task';
  subject?: string;
  content: string;
  created_at: string;
}

export interface FollowUpWorkflow {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  steps?: FollowUpWorkflowStep[];
}

export interface FollowUpWorkflowStep {
  id: string;
  workflow_id: string;
  step_order: number;
  name: string;
  type: 'Email' | 'SMS' | 'Task' | 'Wait';
  delay_days: number;
  template_id?: string;
  template?: FollowUpTemplate;
}

export type AnnouncementType = 'MESSAGE' | 'UPDATE' | 'EVENT' | 'ANNOUNCEMENT' | 'PRAYER_REQUEST';

export interface Announcement {
  id: string;
  title: string;
  content: string;
  type: AnnouncementType;
  created_by?: string;
  created_at: string;
  image_url?: string;
  event_date?: string;
}

export interface GalleryItem {
  id: string;
  title: string;
  type: 'image' | 'video';
  url: string;
  thumbnail?: string;
  description?: string;
  category?: string;
  created_at: string;
}

export interface MeetingMinutes {
  id: string;
  title: string;
  meeting_date: string;
  department: string;
  summary?: string;
  content?: string;
  file_url?: string;
  require_signature: boolean;
  deadline?: string;
  created_by?: string;
  version: number;
  parent_id?: string;
  is_latest: boolean;
  created_at: string;
  updated_at: string;
  audio_url?: string | null;
  transcript?: string | null;
  typed_signature?: string | null;
  secretary_signature?: string | null;
}

export interface MinuteAcknowledgement {
  id: string;
  document_id: string;
  user_id: string;
  status: string;
  ip_address?: string;
  user_agent?: string;
  signed_at: string;
  signature_data?: string;
  typed_name?: string | null;
  user?: {
    name: string;
    role: string;
  };
}