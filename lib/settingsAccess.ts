/**
 * Who sees which section of Settings.
 * Everyone: My Profile, Notifications.
 * Church leaders: Church Profile, Events & Check-In, Integrations.
 * Records: Security Log, Audit Log.
 * Preferences: Super Admin, Admin, Pastor.
 * Super Admin only: Staff & Roles, Vault Repair.
 */

export type SettingsSectionId =
    | 'personal'
    | 'notifications'
    | 'organization'
    | 'events'
    | 'integrations'
    | 'system'
    | 'staff-roles'
    | 'security-log'
    | 'audit';

export const CHURCH_LEADER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'PASTOR', 'FIRST_LADY'];
export const RECORDS_ROLES = ['SUPER_ADMIN', 'ADMIN', 'PASTOR'];
export const PREFERENCES_ROLES = ['SUPER_ADMIN', 'ADMIN', 'PASTOR'];
export const SUPER_ADMIN_ONLY = ['SUPER_ADMIN'];

const SECTION_ROLES: Record<SettingsSectionId, string[] | 'everyone'> = {
    personal: 'everyone',
    notifications: 'everyone',
    organization: CHURCH_LEADER_ROLES,
    events: CHURCH_LEADER_ROLES,
    integrations: CHURCH_LEADER_ROLES,
    system: PREFERENCES_ROLES,
    'staff-roles': SUPER_ADMIN_ONLY,
    'security-log': RECORDS_ROLES,
    audit: RECORDS_ROLES,
};

export function isSettingsSection(id: string | null | undefined): id is SettingsSectionId {
    return !!id && Object.prototype.hasOwnProperty.call(SECTION_ROLES, id);
}

export function canOpenSettingsSection(role: string | null | undefined, id: string | null | undefined): boolean {
    if (!isSettingsSection(id)) return false;
    const allowed = SECTION_ROLES[id];
    if (allowed === 'everyone') return true;
    return allowed.includes(String(role || ''));
}
