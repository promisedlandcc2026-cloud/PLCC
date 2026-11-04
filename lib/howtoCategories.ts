import { Role } from '../types';

/** Stable keys stored on howto_videos.category */
export const HOWTO_CATEGORY_KEYS = ['vault', 'connect', 'dcb', 'tithe'] as const;
export type HowToCategoryKey = (typeof HOWTO_CATEGORY_KEYS)[number];

export type HowToCategoryMeta = {
  key: HowToCategoryKey;
  /** Section heading shown in the library */
  label: string;
  /** Short line under the heading */
  blurb: string;
  /** When true, only finance-adjacent roles see this section */
  financeOnly?: boolean;
};

export const HOWTO_CATEGORIES: HowToCategoryMeta[] = [
  {
    key: 'vault',
    label: 'PLCC Vault',
    blurb: 'Church operating system walkthroughs',
  },
  {
    key: 'connect',
    label: 'PLCC Connect (The APP)',
    blurb: 'Mobile app guides for everyday members',
  },
  {
    key: 'dcb',
    label: 'PLCC-DCB',
    blurb: 'Digital Contribution Book — finance team',
    financeOnly: true,
  },
  {
    key: 'tithe',
    label: 'PLCC Tithe',
    blurb: 'Giving and tithe walkthroughs',
  },
];

export const DEFAULT_HOWTO_CATEGORY: HowToCategoryKey = 'vault';

/** Same circle that already sees the Finance / DCB link in nav. */
export const HOWTO_DCB_ROLES: Role[] = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.ADMIN_STAFF,
  Role.PASTOR,
  Role.FIRST_LADY,
  Role.FINANCE,
  Role.SECRETARY,
  Role.ASST_SECRETARY,
];

export function isHowToCategoryKey(value: unknown): value is HowToCategoryKey {
  return typeof value === 'string' && (HOWTO_CATEGORY_KEYS as readonly string[]).includes(value);
}

export function normalizeHowToCategory(value: unknown): HowToCategoryKey {
  return isHowToCategoryKey(value) ? value : DEFAULT_HOWTO_CATEGORY;
}

export function canViewHowToDcb(role: string | Role | null | undefined): boolean {
  if (!role) return false;
  return HOWTO_DCB_ROLES.includes(role as Role);
}

export function howToCategoryMeta(key: HowToCategoryKey): HowToCategoryMeta {
  return HOWTO_CATEGORIES.find((c) => c.key === key) || HOWTO_CATEGORIES[0];
}
