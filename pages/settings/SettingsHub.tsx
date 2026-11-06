import React, { useState, useEffect, useMemo } from 'react';
import {
    User,
    Bell,
    Building2,
    Calendar,
    Share2,
    Settings,
    Shield,
    ShieldCheck,
    ArrowLeft,
    ChevronRight,
    ClipboardList,
    Wrench,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useNav } from '../../App';
import { canOpenSettingsSection, isSettingsSection } from '../../lib/settingsAccess';

import UserSettingsPage from './UserSettings';
import UserNotificationsPage from './UserNotifications';
import OrganizationSettingsPage from '../admin/OrganizationSettings';
import EventsSettings from '../events/Settings';
import GivingIntegrationsPage from '../admin/GivingIntegrations';
import SystemSettingsPage from '../admin/Settings';
import AuditLogPage from '../admin/AuditLog';
import SecurityLogPage from '../admin/SecurityLog';
import StaffRolesPage from '../admin/AdminUsers';
import AskAdminTitleLink from '../../components/common/AskAdminTitleLink';

type SettingsNavItem = {
    id: string;
    label: string;
    icon: React.ComponentType<{ size?: number }>;
    description: string;
    /** When set, leave Settings and open this path instead of a section. */
    href?: string;
};

type SettingsGroup = { id: string; label: string; items: SettingsNavItem[] };

const ALL_ITEMS: Record<string, SettingsNavItem> = {
    personal: { id: 'personal', label: 'My Profile', icon: User, description: 'Your name, password, passkeys and 2-step sign-in' },
    notifications: { id: 'notifications', label: 'Notifications', icon: Bell, description: 'Which emails and alerts you get' },
    organization: { id: 'organization', label: 'Church Profile', icon: Building2, description: 'Church name, address, logo and main contact' },
    events: { id: 'events', label: 'Events & Check-In', icon: Calendar, description: 'Check-in rules and label printer' },
    integrations: { id: 'integrations', label: 'Integrations', icon: Share2, description: 'Stripe, Planning Center and app connections' },
    system: { id: 'system', label: 'Preferences', icon: Settings, description: 'Church-wide look, seasonal theme and feature switches' },
    'staff-roles': { id: 'staff-roles', label: 'Staff & Roles', icon: ShieldCheck, description: "Change a person's role without resetting their password" },
    'security-log': { id: 'security-log', label: 'Security Log', icon: Shield, description: 'Security officer reports and shift activity' },
    audit: { id: 'audit', label: 'Audit Log', icon: ClipboardList, description: 'Who changed what across PLCC Canaan' },
};

const VAULT_REPAIR: SettingsNavItem = {
    id: 'vault-repair',
    label: 'Canaan Repair',
    icon: Wrench,
    description: 'Fix sign-in problems and run safe repairs',
    href: '/admin/vault-repair',
};

const SettingsHub: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { userRole, authReady } = useNav();
    const role = String(userRole || '');
    const isSuperAdmin = role === 'SUPER_ADMIN';
    const roleKnown = !!authReady && role !== '' && role !== 'PENDING';

    const [repairUnlocked, setRepairUnlocked] = useState(() => {
        try {
            return typeof sessionStorage !== 'undefined' && sessionStorage.getItem('awc_vault_repair_unlocked') === '1';
        } catch {
            return false;
        }
    });

    const params = new URLSearchParams(location.search);
    const requestedTab = params.get('tab');
    const activeTab = requestedTab && canOpenSettingsSection(role, requestedTab) ? requestedTab : null;

    const groups = useMemo<SettingsGroup[]>(() => {
        const pick = (ids: string[]) => ids.filter((id) => canOpenSettingsSection(role, id)).map((id) => ALL_ITEMS[id]);
        const peopleItems = pick(['staff-roles']);
        if (isSuperAdmin && repairUnlocked) peopleItems.push(VAULT_REPAIR);
        return [
            { id: 'you', label: 'Your account', items: pick(['personal', 'notifications']) },
            { id: 'church', label: 'Church', items: pick(['organization', 'events', 'integrations', 'system']) },
            { id: 'people', label: 'People & access', items: peopleItems },
            { id: 'records', label: 'Records', items: pick(['security-log', 'audit']) },
        ].filter((g) => g.items.length > 0);
    }, [role, isSuperAdmin, repairUnlocked]);

    useEffect(() => {
        // Hidden Super Admin unlock: /settings?repair=1
        if (isSuperAdmin && params.get('repair') === '1') {
            try {
                sessionStorage.setItem('awc_vault_repair_unlocked', '1');
            } catch {
                /* ignore */
            }
            setRepairUnlocked(true);
            navigate('/admin/vault-repair', { replace: true });
            return;
        }
        // A section this person can't use (or a mistyped one) goes back to the Settings list
        if (requestedTab && roleKnown && !canOpenSettingsSection(role, requestedTab)) {
            navigate('/settings', { replace: true });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.search, isSuperAdmin, roleKnown, role, navigate]);

    useEffect(() => {
        window.scrollTo?.(0, 0);
    }, [activeTab]);

    const openItem = (item: SettingsNavItem) => {
        if (item.href) {
            navigate(item.href);
            return;
        }
        navigate(`/settings?tab=${item.id}`);
    };

    const renderContent = (tab: string) => {
        switch (tab) {
            case 'personal': return <UserSettingsPage />;
            case 'notifications': return <UserNotificationsPage />;
            case 'organization': return <OrganizationSettingsPage />;
            case 'staff-roles': return <StaffRolesPage embedded />;
            case 'events': return <EventsSettings />;
            case 'integrations': return <GivingIntegrationsPage />;
            case 'system': return <SystemSettingsPage />;
            case 'security-log': return <SecurityLogPage />;
            case 'audit': return <AuditLogPage />;
            default: return <UserSettingsPage />;
        }
    };

    // ---------- One section, full width ----------
    if (activeTab && isSettingsSection(activeTab)) {
        return (
            <div className="min-h-[100dvh] bg-[#F9F9F7] animate-in fade-in duration-300 overflow-x-hidden">
                <div className="max-w-5xl mx-auto w-full px-4 sm:px-8 lg:px-10 py-5 sm:py-8">
                    <button
                        type="button"
                        onClick={() => navigate('/settings')}
                        className="flex items-center gap-2 text-burgundy font-bold text-xs uppercase tracking-widest mb-6 bg-burgundy/5 px-4 py-2.5 rounded-xl border border-burgundy/10 hover:bg-burgundy/10 transition-colors"
                    >
                        <ArrowLeft size={14} />
                        Settings
                    </button>
                    {renderContent(activeTab)}
                </div>
            </div>
        );
    }

    // ---------- The Settings list ----------
    return (
        <div className="min-h-[100dvh] bg-[#F9F9F7] animate-in fade-in duration-300 overflow-x-hidden">
            <div className="max-w-4xl mx-auto w-full px-4 sm:px-8 lg:px-10 py-6 sm:py-10">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h1 className="text-2xl sm:text-3xl font-black text-[#0d1a14] tracking-tight">Settings</h1>
                    <AskAdminTitleLink />
                </div>
                <p className="text-sm text-gray-600 font-medium mb-8">
                    {groups.length > 1 ? 'Your account and church tools' : 'Your account'}
                </p>

                <div className="space-y-8">
                    {groups.map((group) => (
                        <section key={group.id}>
                            <h2 className="text-[11px] font-black text-gray-600 uppercase tracking-[0.2em] mb-3 px-1">
                                {group.label}
                            </h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {group.items.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => openItem(item)}
                                        className="w-full text-left bg-white rounded-2xl border border-gray-100 px-4 py-4 flex items-center gap-3 hover:border-burgundy/20 hover:shadow-sm transition-all group"
                                    >
                                        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-burgundy/5 text-burgundy group-hover:bg-burgundy group-hover:text-gold transition-colors">
                                            <item.icon size={19} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-bold text-[#0d1a14]">{item.label}</p>
                                            <p className="text-xs text-gray-600 font-medium leading-snug">{item.description}</p>
                                        </div>
                                        <ChevronRight size={16} className="text-gray-400 shrink-0 group-hover:text-burgundy transition-colors" />
                                    </button>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default SettingsHub;
