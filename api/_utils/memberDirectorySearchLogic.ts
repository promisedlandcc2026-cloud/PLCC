/**
 * Member-to-member directory search.
 * Name and household only — never phone, email, birthday, or access codes.
 */

import { courtesyName } from '../../lib/courtesyName.js';

export type DirectoryMemberRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  preferred_name?: string | null;
  household_name?: string | null;
  avatar_url?: string | null;
  status?: string | null;
  address_as?: string | null;
  birthday?: string | null;
  minor?: boolean;
};

export type DirectoryMemberCard = {
  id: string;
  displayName: string;
  preferredName: string | null;
  householdName: string | null;
  avatarUrl: string | null;
};

const INACTIVE = new Set(['inactive', 'archived', 'deleted', 'former', 'removed']);

export function sanitizeDirectoryQuery(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .slice(0, 80)
    .replace(/[%(),]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function directorySearchTokens(query: string): string[] {
  return sanitizeDirectoryQuery(query).toLowerCase().split(' ').filter(Boolean).slice(0, 4);
}

export function isInactiveMemberStatus(status: unknown): boolean {
  return INACTIVE.has(String(status || '').trim().toLowerCase());
}

export function memberDirectoryHaystack(row: DirectoryMemberRow): string {
  return [row.first_name, row.last_name, row.preferred_name, row.household_name]
    .join(' ')
    .toLowerCase();
}

export function rowMatchesDirectoryQuery(row: DirectoryMemberRow, query: string): boolean {
  if (isInactiveMemberStatus(row.status)) return false;
  const tokens = directorySearchTokens(query);
  if (tokens.length === 0) return false;
  const hay = memberDirectoryHaystack(row);
  return tokens.every((token) => hay.includes(token));
}

export function toDirectoryMemberCard(row: DirectoryMemberRow): DirectoryMemberCard | null {
  const id = String(row.id || '').trim();
  if (!id) return null;
  const first = String(row.first_name || '').trim();
  const last = String(row.last_name || '').trim();
  const legal = [first, last].filter(Boolean).join(' ');
  const preferred = String(row.preferred_name || '').trim();
  const displayName = courtesyName({
    firstName: first,
    lastName: last,
    preferredName: preferred,
    addressAs: row.address_as,
    birthday: row.birthday,
    minor: row.minor,
  });
  const preferredName =
    preferred && preferred.toLowerCase() !== (legal || displayName).toLowerCase() ? preferred : null;
  const household = String(row.household_name || '').trim();
  const avatar = String(row.avatar_url || '').trim();
  return {
    id,
    displayName,
    preferredName,
    householdName: household || null,
    avatarUrl: avatar || null,
  };
}

export function listDirectoryMembers(
  rows: DirectoryMemberRow[],
  limit = 50
): { members: DirectoryMemberCard[]; truncated: boolean } {
  const cards = rows
    .filter((row) => !isInactiveMemberStatus(row.status))
    .map(toDirectoryMemberCard)
    .filter((card): card is DirectoryMemberCard => Boolean(card))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));
  return {
    members: cards.slice(0, limit),
    truncated: cards.length > limit,
  };
}

export function rankDirectoryMembers(
  rows: DirectoryMemberRow[],
  query: string,
  limit = 50
): { members: DirectoryMemberCard[]; truncated: boolean } {
  const cards = rows
    .filter((row) => rowMatchesDirectoryQuery(row, query))
    .map(toDirectoryMemberCard)
    .filter((card): card is DirectoryMemberCard => Boolean(card))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));
  return {
    members: cards.slice(0, limit),
    truncated: cards.length > limit,
  };
}
