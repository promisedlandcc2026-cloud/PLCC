import { Role, Section } from '../types';

/** Roles that can use the simplified everyday menu and its routes. */
export const ALL_APP_ROLES: Role[] = [
  Role.ADMIN,
  Role.SUPER_ADMIN,
  Role.PASTOR,
  Role.FINANCE,
  Role.FIRST_LADY,
  Role.SECRETARY,
  Role.ASST_SECRETARY,
  Role.STAFF,
  Role.ADMIN_STAFF,
  Role.MEMBER,
  Role.YOUTH,
  Role.GUEST,
  Role.VOLUNTEER,
  Role.PARENT,
  Role.TEACHER,
  Role.MINISTRY_LEADER,
  Role.WORSHIP_TEAM,
  Role.MEDIA_TEAM,
  Role.SUNDAY_SCHOOL_TEACHER,
  Role.USER,
];

/** Roles that can see the left-panel Finance (contribution) link. */
const FINANCE_LINK_ROLES: Role[] = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.ADMIN_STAFF,
  Role.PASTOR,
  Role.FIRST_LADY,
  Role.FINANCE,
  Role.SECRETARY,
  Role.ASST_SECRETARY,
];

/**
 * Defines which top-level sections are visible to which roles.
 */
/**
 * Roles that may open the Kids Bucks page. The server and database decide what
 * each person can actually do (SECRETARY / ASST_SECRETARY need kids.bucks.award).
 */
export const KIDS_BUCKS_ROLES: Role[] = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.PASTOR,
  Role.ADMIN_STAFF,
  Role.FIRST_LADY,
  Role.MINISTRY_LEADER,
  Role.SUNDAY_SCHOOL_TEACHER,
  Role.TEACHER,
  Role.SECRETARY,
  Role.ASST_SECRETARY,
];

/** Roles that can open PLCC Ark scores (matches the Ark API's staff roles). */
export const ARK_STAFF_ROLES: Role[] = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.PASTOR,
  Role.ADMIN_STAFF,
  Role.FIRST_LADY,
  Role.MINISTRY_LEADER,
  Role.SUNDAY_SCHOOL_TEACHER,
  Role.TEACHER,
];

/** Roles that can upload/browse kids ministry Sunday plan archives. */
export const KIDS_PLANS_ROLES: Role[] = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.PASTOR,
  Role.ADMIN_STAFF,
  Role.SECRETARY,
  Role.ASST_SECRETARY,
  Role.FIRST_LADY,
  Role.SUNDAY_SCHOOL_TEACHER,
  Role.MINISTRY_LEADER,
  Role.TEACHER,
];

/**
 * Full Vault member roster + contacts (Members / Households CRM).
 * Regular members use Connect opt-in directory + My Family instead.
 * Includes secretaries / admin staff who run the Connect ↔ Vault bridge.
 */
export const PEOPLE_ROSTER_ROLES: Role[] = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.PASTOR,
  Role.MINISTRY_LEADER,
  Role.SECRETARY,
  Role.ASST_SECRETARY,
  Role.STAFF,
  Role.ADMIN_STAFF,
  Role.FIRST_LADY,
];

/** Roles that can manage attendance session lifecycle (Phase 2.7B/C). */
const ATTENDANCE_SESSION_ROLES: Role[] = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.PASTOR,
  Role.ADMIN_STAFF,
  Role.SECRETARY,
  Role.ASST_SECRETARY,
  Role.FIRST_LADY,
];

/**
 * Roles that can run Start check-in / Kids Kiosk check-out (desk),
 * including Children's Ministry (Sunday School Teacher / Teacher / Ministry Leader).
 * Does not grant session create/close by itself.
 */
const ATTENDANCE_CHECKIN_ROLES: Role[] = [
  ...ATTENDANCE_SESSION_ROLES,
  Role.SUNDAY_SCHOOL_TEACHER,
  Role.TEACHER,
  Role.MINISTRY_LEADER,
  Role.KIOSK,
];

/** Paths a shared Kids Desk Kiosk tablet may open (nothing else). */
export const KIOSK_ALLOWED_PATHS: string[] = [
  '/events/kids-kiosk',
  '/events/check-someone-in',
  '/events/kids-checkin',
  '/events/check-in',
  '/events/who-checked-in',
  '/events/kids-checked-in',
  '/attendance/sessions',
  '/auth/farewell',
  '/farewell',
];

/**
 * Fundraisers: these roles have access by role. Anyone else (Members, Accountants…) needs the
 * per-person Fundraiser access switch, which the server checks on every request.
 */
export const FUNDRAISER_ROLES: Role[] = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.PASTOR,
  Role.FIRST_LADY,
  Role.SECRETARY,
  Role.ASST_SECRETARY,
  Role.FINANCE,
];

/** The page itself may open for any signed-in person; it shows "no access" unless the server allows it. */
const FUNDRAISER_PAGE_ROLES: Role[] = [...ALL_APP_ROLES, Role.ACCOUNTANT];

/** Paths an Accountant may open (Fundraisers only). */
export const ACCOUNTANT_ALLOWED_PATHS: string[] = ['/fundraisers', '/auth/farewell', '/farewell'];

export const isAccountantRole = (role: Role | string | null | undefined): boolean =>
  String(role || '').toUpperCase() === Role.ACCOUNTANT;

export const accountantHomePath = '/fundraisers';

function pathAllowedForAccountant(path: string): boolean {
  const p = path.split('?')[0];
  return ACCOUNTANT_ALLOWED_PATHS.some((allowed) => p === allowed || p.startsWith(`${allowed}/`));
}

export const isKioskRole = (role: Role | string | null | undefined): boolean =>
  String(role || '').toUpperCase() === Role.KIOSK;

export const kioskHomePath = '/events/kids-kiosk';

function pathAllowedForKiosk(path: string): boolean {
  const p = path.split('?')[0];
  return KIOSK_ALLOWED_PATHS.some(
    (allowed) => p === allowed || p.startsWith(`${allowed}/`)
  );
}

export const SECTION_PERMISSIONS: Record<Section, Role[]> = {
  [Section.Dashboard]: ALL_APP_ROLES,
  [Section.People]: ALL_APP_ROLES,
  [Section.Giving]: ALL_APP_ROLES,
  [Section.Finance]: FINANCE_LINK_ROLES,
  [Section.Tags]: [Role.ADMIN, Role.STAFF],
  // Desk roles need Attendance nav for Today's check-ins + open Sessions (read/check-in)
  [Section.Attendance]: ATTENDANCE_CHECKIN_ROLES,
  // Kiosk uses Events & check-in items only
  [Section.Events]: [...ALL_APP_ROLES, Role.KIOSK],
  [Section.Forms]: ALL_APP_ROLES,
  [Section.FollowUps]: [Role.ADMIN, Role.PASTOR, Role.FIRST_LADY, Role.SECRETARY, Role.ASST_SECRETARY, Role.STAFF, Role.MINISTRY_LEADER],
  [Section.Community]: ALL_APP_ROLES,
  [Section.Communication]: ALL_APP_ROLES,
  [Section.More]: ALL_APP_ROLES,
};

/**
 * Specific path-level permissions for granular control over functional areas.
 * Kept everyday routes are open to ALL_APP_ROLES; advanced tools stay restricted.
 */
export const PATH_PERMISSIONS: Record<string, Role[]> = {
  // Everyday menu (open to everyone)
  '/dashboard': ALL_APP_ROLES,
  '/launcher': ALL_APP_ROLES,
  '/members': PEOPLE_ROSTER_ROLES,
  '/households': PEOPLE_ROSTER_ROLES,
  '/family': ALL_APP_ROLES,
  '/church-profile': ALL_APP_ROLES,
  '/events/overview': ALL_APP_ROLES,
  '/events/serve': ALL_APP_ROLES,
  '/events/check-someone-in': [...ALL_APP_ROLES, Role.KIOSK],
  '/events/check-in': [...ALL_APP_ROLES, Role.KIOSK],
  '/events/kids-checkin': [...ALL_APP_ROLES, Role.KIOSK],
  '/events/kids-kiosk': [...ALL_APP_ROLES, Role.KIOSK],
  '/events/kids-plans': KIDS_PLANS_ROLES,
  '/events/kids-bucks': KIDS_BUCKS_ROLES,
  '/events/ark': ARK_STAFF_ROLES,
  '/events/flyer-share': [
    Role.ADMIN, Role.SUPER_ADMIN, Role.PASTOR, Role.MINISTRY_LEADER, Role.FINANCE,
    Role.WORSHIP_TEAM, Role.SECRETARY, Role.ASST_SECRETARY, Role.ADMIN_STAFF, Role.FIRST_LADY,
    Role.STAFF,
  ],
  '/events/who-checked-in': [...ALL_APP_ROLES, Role.KIOSK],
  '/events/kids-checked-in': [...ALL_APP_ROLES, Role.KIOSK],
  '/events/attendees': ALL_APP_ROLES,
  // Public Grand Family Celebration signup for everyone; staff RSVP lists Super Admin only
  '/events/cookout-rsvps': [Role.SUPER_ADMIN],
  // Archived RSVPs: read-only for Pastor, First Lady and Finance; Super Admin can restore
  '/events/rsvp-archive': [Role.SUPER_ADMIN, Role.PASTOR, Role.FIRST_LADY, Role.FINANCE],
  '/fellowship-cookout': [Role.SUPER_ADMIN],
  '/thanksgiving-rsvp': ALL_APP_ROLES,
  '/grand-family-celebration-rsvp': ALL_APP_ROLES,
  '/marrieds-dinner-rsvp': ALL_APP_ROLES,
  '/admin/consent-management': ALL_APP_ROLES,
  '/finance/contribution-manager': FINANCE_LINK_ROLES,
  '/community/feed': ALL_APP_ROLES,
  '/community/sermon-notes': ALL_APP_ROLES,
  // Writes what members read on PLCC Connect's Daily page (server checks the role too).
  '/community/daily-devotional': [Role.SUPER_ADMIN, Role.ADMIN, Role.PASTOR, Role.MINISTRY_LEADER],
  '/community/prayer-wall': ALL_APP_ROLES,
  // Page checks the Intercessor Channel membership itself (server-enforced).
  '/community/prayer-watch': ALL_APP_ROLES,
  '/communication/announcements': ALL_APP_ROLES,
  '/communication/minutes': ALL_APP_ROLES,
  '/admin/policies': ALL_APP_ROLES,
  '/help/how-to-videos': ALL_APP_ROLES,
  '/community/chat': ALL_APP_ROLES,
  '/settings': ALL_APP_ROLES,
  '/scan-in': ALL_APP_ROLES,

  // Giving Sub-items (advanced / config)
  '/giving-form': [Role.ADMIN, Role.PASTOR, Role.FINANCE, Role.FIRST_LADY, Role.SECRETARY, Role.STAFF, Role.MEMBER],
  '/giving-form-url': [Role.ADMIN, Role.PASTOR, Role.FINANCE, Role.FIRST_LADY, Role.SECRETARY, Role.STAFF, Role.MEMBER],
  '/text-giving': [Role.ADMIN, Role.PASTOR, Role.FINANCE, Role.FIRST_LADY, Role.SECRETARY, Role.STAFF, Role.MEMBER],

  // Treasury (Finance) Sub-items (Internal Ops — not in everyday menu)
  '/giving/insights': [Role.ADMIN, Role.PASTOR, Role.FINANCE, Role.SECRETARY, Role.ASST_SECRETARY],
  '/finance/ledger': [Role.ADMIN, Role.FINANCE, Role.SECRETARY, Role.ASST_SECRETARY],
  '/finance/counting': [Role.ADMIN, Role.FINANCE, Role.SECRETARY, Role.ASST_SECRETARY],
  '/finance/expenses': [Role.ADMIN, Role.FINANCE, Role.SECRETARY, Role.ASST_SECRETARY],
  '/finance/budgets': [Role.ADMIN, Role.FINANCE, Role.SECRETARY, Role.ASST_SECRETARY],
  '/finance/approvals': [Role.ADMIN, Role.FINANCE, Role.SECRETARY, Role.ASST_SECRETARY],
  '/transactions': [Role.ADMIN, Role.FINANCE, Role.SECRETARY, Role.ASST_SECRETARY],
  '/batch-giving': [Role.ADMIN, Role.FINANCE, Role.SECRETARY, Role.ASST_SECRETARY],
  '/bank-deposits': [Role.ADMIN, Role.FINANCE, Role.SECRETARY, Role.ASST_SECRETARY],
  '/tax-documents': [Role.ADMIN, Role.FINANCE, Role.SECRETARY, Role.ASST_SECRETARY],
  '/fund-management': [Role.ADMIN, Role.FINANCE, Role.SECRETARY, Role.ASST_SECRETARY],
  '/pledge-campaigns': [Role.ADMIN, Role.FINANCE, Role.SECRETARY, Role.ASST_SECRETARY],
  '/fundraisers': FUNDRAISER_PAGE_ROLES,
  '/store/orders': [Role.ADMIN, Role.FINANCE, Role.SECRETARY, Role.ASST_SECRETARY, Role.PASTOR],

  // Attendance — desk roles can open Sessions + Dashboard for check-in; create/close stays server-gated
  '/attendance/sessions': ATTENDANCE_CHECKIN_ROLES,
  '/attendance/dashboard': ATTENDANCE_CHECKIN_ROLES,

  // People Sub-items (advanced)
  '/members/new': [
    Role.SUPER_ADMIN,
    Role.ADMIN,
    Role.PASTOR,
    Role.SECRETARY,
    Role.ASST_SECRETARY,
    Role.STAFF,
  ],
  '/people/card-scanner': [
    Role.SUPER_ADMIN,
    Role.ADMIN,
    Role.PASTOR,
    Role.ADMIN_STAFF,
    Role.SECRETARY,
    Role.ASST_SECRETARY,
    Role.FIRST_LADY,
  ],
  '/people/connect-cards': [Role.ADMIN, Role.SUPER_ADMIN, Role.PASTOR, Role.MINISTRY_LEADER],
  '/people/team-applications': [Role.ADMIN, Role.SUPER_ADMIN, Role.PASTOR, Role.MINISTRY_LEADER],
  '/people/plan-a-visit': [Role.ADMIN, Role.SUPER_ADMIN, Role.PASTOR, Role.MINISTRY_LEADER],
  '/people/import': [Role.ADMIN, Role.PASTOR, Role.FINANCE],

  // Admin (advanced — not everyday Settings)
  '/admin/users': [Role.SUPER_ADMIN],
  '/admin/vault-repair': [Role.SUPER_ADMIN],
  '/admin/organization': [Role.ADMIN, Role.PASTOR],
  '/admin/audit': [Role.ADMIN, Role.PASTOR],
  '/admin/security-log': [Role.ADMIN, Role.SUPER_ADMIN, Role.PASTOR],
  '/integrations': [Role.ADMIN, Role.PASTOR],
  '/imports': [Role.ADMIN, Role.PASTOR, Role.FINANCE],
};

export const hasPermission = (role: Role, section?: Section, path?: string): boolean => {
  // Accountant: Fundraisers only
  if (role === Role.ACCOUNTANT) {
    if (path) return pathAllowedForAccountant(path);
    return section === Section.Giving;
  }

  // Shared kids-desk tablet: only check-in / kiosk routes
  if (role === Role.KIOSK) {
    if (path) return pathAllowedForKiosk(path);
    if (section === Section.Events || section === Section.Attendance) return true;
    return false;
  }

  // Paths limited to Super Admin must not be opened by the general ADMIN/PASTOR bypass
  if (path && PATH_PERMISSIONS[path]?.length === 1 && PATH_PERMISSIONS[path][0] === Role.SUPER_ADMIN) {
    return role === Role.SUPER_ADMIN;
  }

  if (role === Role.ADMIN || role === Role.SUPER_ADMIN || role === Role.PASTOR) return true;

  if (path) {
    if (PATH_PERMISSIONS[path]) {
      return PATH_PERMISSIONS[path].includes(role);
    }
    const parentPaths = Object.keys(PATH_PERMISSIONS);
    for (const parent of parentPaths) {
      if (path.startsWith(parent) && !PATH_PERMISSIONS[parent].includes(role)) {
        return false;
      }
    }
  }

  if (section && SECTION_PERMISSIONS[section]) {
    return SECTION_PERMISSIONS[section].includes(role);
  }

  return true;
};

/* --- Capability-Based Permissions (Granular Actions) --- */

export type Action =
  | 'people.view_roster'
  | 'people.create'
  | 'people.edit'
  | 'people.delete'
  | 'household.create'
  | 'household.edit'
  | 'household.delete'
  | 'team.create'
  | 'team.edit'
  | 'team.delete'
  | 'finance.edit'
  | 'finance.admin'
  | 'worship.edit'
  | 'event.submit'
  | 'event.approve'
  | 'event.edit'
  | 'event.delete'
  | 'video.manage'
  | 'prayer.manage'
  | 'gallery.manage'
  | 'attendance.session.manage'
  | 'attendance.checkin';

export const ACTION_PERMISSIONS: Record<Action, Role[]> = {
  'people.view_roster': PEOPLE_ROSTER_ROLES,
  'people.create': [Role.ADMIN, Role.SUPER_ADMIN, Role.PASTOR, Role.SECRETARY, Role.ASST_SECRETARY, Role.STAFF],
  'people.edit': [Role.ADMIN, Role.SUPER_ADMIN, Role.PASTOR, Role.SECRETARY, Role.ASST_SECRETARY, Role.STAFF, Role.MINISTRY_LEADER],
  'people.delete': [Role.ADMIN, Role.SUPER_ADMIN, Role.PASTOR],

  'household.create': [Role.ADMIN, Role.SUPER_ADMIN, Role.PASTOR, Role.SECRETARY, Role.ASST_SECRETARY, Role.STAFF, Role.FINANCE],
  'household.edit': [Role.ADMIN, Role.SUPER_ADMIN, Role.PASTOR, Role.SECRETARY, Role.ASST_SECRETARY, Role.STAFF, Role.FINANCE],
  'household.delete': [Role.ADMIN, Role.SUPER_ADMIN, Role.PASTOR],

  'team.create': [Role.ADMIN, Role.SUPER_ADMIN, Role.PASTOR, Role.MINISTRY_LEADER],
  'team.edit': [Role.ADMIN, Role.SUPER_ADMIN, Role.PASTOR, Role.MINISTRY_LEADER],
  'team.delete': [Role.ADMIN, Role.SUPER_ADMIN, Role.PASTOR, Role.MINISTRY_LEADER],

  'finance.edit': [Role.ADMIN, Role.SUPER_ADMIN, Role.PASTOR, Role.FINANCE, Role.SECRETARY, Role.ASST_SECRETARY],
  'finance.admin': [Role.ADMIN, Role.SUPER_ADMIN, Role.PASTOR, Role.FINANCE],
  'worship.edit': [Role.ADMIN, Role.SUPER_ADMIN, Role.PASTOR, Role.WORSHIP_TEAM],

  // Ministry / staff request a dated event (pending until approved)
  'event.submit': [
    Role.ADMIN, Role.SUPER_ADMIN, Role.PASTOR, Role.MINISTRY_LEADER, Role.FINANCE,
    Role.WORSHIP_TEAM, Role.SECRETARY, Role.ASST_SECRETARY, Role.ADMIN_STAFF, Role.FIRST_LADY,
    Role.STAFF,
  ],
  // Publish + approve/reject (locked-day add remains Super Admin only on the server)
  'event.approve': [Role.ADMIN, Role.SUPER_ADMIN, Role.PASTOR, Role.MINISTRY_LEADER],
  'event.edit': [Role.ADMIN, Role.SUPER_ADMIN, Role.PASTOR, Role.MINISTRY_LEADER],
  'event.delete': [Role.ADMIN, Role.SUPER_ADMIN, Role.PASTOR, Role.MINISTRY_LEADER],
  'video.manage': [
    Role.ADMIN, Role.SUPER_ADMIN, Role.PASTOR, Role.FIRST_LADY, Role.SECRETARY,
    Role.STAFF, Role.MEDIA_TEAM, Role.ADMIN_STAFF
  ],
  'prayer.manage': [
    Role.ADMIN, Role.SUPER_ADMIN, Role.PASTOR, Role.FIRST_LADY, Role.SECRETARY,
    Role.STAFF, Role.MINISTRY_LEADER
  ],
  'gallery.manage': [
    Role.ADMIN, Role.SUPER_ADMIN, Role.PASTOR, Role.FIRST_LADY, Role.SECRETARY,
    Role.STAFF, Role.MEDIA_TEAM, Role.ADMIN_STAFF
  ],

  // Phase 2.7B — session lifecycle only (create / open / close)
  'attendance.session.manage': ATTENDANCE_SESSION_ROLES,

  // Desk check-in + Kids Kiosk check-out (Children's Ministry included)
  'attendance.checkin': ATTENDANCE_CHECKIN_ROLES,
};

export const canPerform = (role: Role, action: Action): boolean => {
  if (role === Role.ADMIN || role === Role.SUPER_ADMIN || role === Role.PASTOR) return true;
  return ACTION_PERMISSIONS[action]?.includes(role) || false;
};