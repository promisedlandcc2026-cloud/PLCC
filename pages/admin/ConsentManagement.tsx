import React, { useState, useEffect } from 'react';
import {
    Shield,
    FileText,
    Users,
    AlertTriangle,
    CheckCircle2,
    Clock,
    Download,
    Mail,
    Plus,
    Edit,
    Eye,
    XCircle,
    X,
    Loader2,
    Save,
    Lock,
    RefreshCw,
    Search,
    TrendingUp,
    PenTool,
    ExternalLink
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useNav } from '../../App';
import { Role } from '../../types';
import ConsentModal from '../../components/Consent/ConsentModal';
import ConsentNoticeDocument, { printConsentNotice } from '../../components/Consent/ConsentNoticeDocument';
import AskAdminTitleLink from '../../components/common/AskAdminTitleLink';
import { Link, useSearchParams } from 'react-router-dom';

interface ConsentStats {
    total_children: number;
    complete: number;
    partial: number;
    none: number;
    expiring_soon: number;
}

interface ChildConsentStatus {
    child_id: string;
    parent_id?: string | null;
    child_name: string;
    household_name: string;
    parent_email: string;
    total_forms: number;
    completed_forms: number;
    also_signed_forms?: number;
    expired_forms: number;
    status: 'complete' | 'partial' | 'none' | 'expired';
    oldest_expiration: string | null;
}

interface ConsentForm {
    id: string;
    title: string;
    form_type: string;
    content?: string;
    is_required: boolean;
    is_active: boolean;
    requires_signature?: boolean;
    valid_duration_days: number;
    audience?: 'children' | 'adults' | 'all';
    created_at: string;
}

type AudienceFilter = 'all' | 'children' | 'adults';

const formAudience = (form: ConsentForm): 'children' | 'adults' | 'all' =>
    form.audience === 'adults' || form.audience === 'all' ? form.audience : 'children';

const ConsentManagement: React.FC = () => {
    const { userRole, userId, userName } = useNav();
    const [searchParams, setSearchParams] = useSearchParams();

    const ALLOWED_ROLES: Role[] = [
        Role.SUPER_ADMIN, Role.ADMIN, Role.PASTOR, Role.FIRST_LADY,
        Role.SECRETARY, Role.ASST_SECRETARY, Role.MINISTRY_LEADER, Role.TEACHER
    ];
    const isStaff = ALLOWED_ROLES.includes(userRole as Role);
    const tabFromUrl = searchParams.get('tab');
    const formFromUrl = searchParams.get('form');
    const audienceFromUrl = searchParams.get('audience');
    const initialTab =
        tabFromUrl === 'forms' || tabFromUrl === 'children' || tabFromUrl === 'dashboard' || tabFromUrl === 'reminders'
            ? tabFromUrl
            : isStaff
              ? 'dashboard'
              : 'forms';
    const initialAudience: AudienceFilter =
        audienceFromUrl === 'children' || audienceFromUrl === 'adults' || audienceFromUrl === 'all'
            ? audienceFromUrl
            : 'all';
    const [activeTab, setActiveTab] = useState<'dashboard' | 'children' | 'forms' | 'reminders'>(initialTab);
    const [audienceFilter, setAudienceFilter] = useState<AudienceFilter>(initialAudience);
    const [highlightFormTitle, setHighlightFormTitle] = useState<string | null>(formFromUrl);
    const [stats, setStats] = useState<ConsentStats>({
        total_children: 0,
        complete: 0,
        partial: 0,
        none: 0,
        expiring_soon: 0
    });
    const [children, setChildren] = useState<ChildConsentStatus[]>([]);
    const [forms, setForms] = useState<ConsentForm[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'complete' | 'partial' | 'none' | 'expired'>('all');
    const [selectedChildren, setSelectedChildren] = useState<Set<string>>(new Set());
    const [isFormBuilderOpen, setIsFormBuilderOpen] = useState(false);
    const [editingForm, setEditingForm] = useState<ConsentForm | null>(null);
    const [previewForm, setPreviewForm] = useState<ConsentForm | null>(null);
    const [isSavingForm, setIsSavingForm] = useState(false);
    const [collectingChild, setCollectingChild] = useState<ChildConsentStatus | null>(null);
    const [missingConsents, setMissingConsents] = useState<any[]>([]);
    const [isCollecting, setIsCollecting] = useState(false);
    const [isSeeding, setIsSeeding] = useState(false);
    /** Self-serve: form selected, waiting for child pick */
    const [signingForm, setSigningForm] = useState<ConsentForm | null>(null);
    const [childPickerOpen, setChildPickerOpen] = useState(false);
    const [childPickerQuery, setChildPickerQuery] = useState('');
    const [consentModalMode, setConsentModalMode] = useState<'collect' | 'selfserve'>('collect');
    const [newForm, setNewForm] = useState({
        title: '',
        form_type: 'custom',
        content: '',
        is_required: true,
        requires_signature: true,
        valid_duration_days: 365,
        audience: 'children' as 'children' | 'adults' | 'all',
    });

    useEffect(() => {
        loadData();
    }, []);

    // Ask Admin deep links: ?tab=forms&form=...&audience=children
    useEffect(() => {
        const t = searchParams.get('tab');
        if (t === 'forms' || t === 'children' || t === 'dashboard' || t === 'reminders') {
            setActiveTab(t);
        }
        const f = searchParams.get('form');
        setHighlightFormTitle(f);
        const a = searchParams.get('audience');
        if (a === 'children' || a === 'adults' || a === 'all') {
            setAudienceFilter(a);
        }
    }, [searchParams]);

    useEffect(() => {
        if (!highlightFormTitle || activeTab !== 'forms' || forms.length === 0) return;
        const id = `consent-form-${encodeURIComponent(highlightFormTitle.toLowerCase())}`;
        const el = document.getElementById(id);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [highlightFormTitle, activeTab, forms]);

    const authHeaders = async () => {
        const session = supabase ? (await supabase.auth.getSession()).data.session : null;
        return {
            Authorization: `Bearer ${session?.access_token || localStorage.getItem('awc_auth_token') || ''}`,
        };
    };

    const handleSeedDefaults = async () => {
        setIsSeeding(true);
        try {
            const response = await fetch('/api/vault?resource=consent&action=seed_defaults', {
                method: 'POST',
                headers: await authHeaders(),
            });
            const result = await response.json();
            if (!result.ok) {
                alert(result.error || 'Failed to install default forms');
                return;
            }
            setForms(result.forms || []);
            await loadData();
            setActiveTab('forms');
            alert(
                `E-Sign templates ready.\nAdded: ${result.inserted || 0}\nReactivated: ${result.reactivated || 0}\nAlready present: ${result.skipped || 0}\n\nNext: open Children → Collect E-Sign, or use Kids Check-In.`
            );
        } catch (err: any) {
            alert(err.message || 'Failed to install default forms');
        } finally {
            setIsSeeding(false);
        }
    };

    const loadData = async () => {
        setIsLoading(true);
        try {
            await Promise.all([
                loadStats(),
                loadChildren(),
                loadForms()
            ]);
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const loadForms = async () => {
        try {
            console.log('=== Loading forms via API (service role) ===');
            const session = supabase ? (await supabase.auth.getSession()).data.session : null;
            const response = await fetch('/api/vault?resource=consent&action=list_forms', {
                headers: { 'Authorization': `Bearer ${session?.access_token || ''}` }
            });
            const result = await response.json();
            console.log('Forms loaded:', result.forms?.length, result.error || '');
            if (result.ok) setForms(result.forms || []);
        } catch (error) {
            console.error('Error loading forms:', error);
        }
    };

    const loadStats = async () => {
        try {
            const session = supabase ? (await supabase.auth.getSession()).data.session : null;
            const response = await fetch('/api/vault?resource=consent&action=stats', {
                headers: { 'Authorization': `Bearer ${session?.access_token || ''}` }
            });
            const result = await response.json();
            if (result.ok) setStats(result.stats);
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    };

    const loadChildren = async () => {
        try {
            const session = supabase ? (await supabase.auth.getSession()).data.session : null;
            const response = await fetch('/api/vault?resource=consent&action=children_status', {
                headers: { 'Authorization': `Bearer ${session?.access_token || ''}` }
            });
            const result = await response.json();
            if (result.ok) setChildren(result.children);
        } catch (error) {
            console.error('Error loading children:', error);
        }
    };

    const handleExport = async (format: 'csv' | 'pdf') => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const response = await fetch(`/api/vault?resource=consent&action=export&format=${format}`, {
                headers: {
                    'Authorization': `Bearer ${session?.access_token}`
                }
            });
            const result = await response.json();
            
            if (result.ok) {
                // Download file
                const blob = new Blob([result.data], { type: format === 'csv' ? 'text/csv' : 'application/pdf' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `consent_records_${new Date().toISOString().split('T')[0]}.${format}`;
                a.click();
                window.URL.revokeObjectURL(url);
            }
        } catch (error) {
            console.error('Error exporting:', error);
            alert('Export failed');
        }
    };

    const handleSendReminders = async () => {
        if (selectedChildren.size === 0) {
            alert('Please select children to send reminders to');
            return;
        }

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const response = await fetch('/api/vault?resource=consent&action=send_reminders', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({
                    child_ids: Array.from(selectedChildren)
                })
            });
            const result = await response.json();
            
            if (result.ok) {
                alert(`Reminders sent to ${result.sent_count} parents`);
                setSelectedChildren(new Set());
            } else {
                alert('Failed to send reminders: ' + result.error);
            }
        } catch (error) {
            console.error('Error sending reminders:', error);
            alert('Failed to send reminders');
        }
    };

    const filteredChildren = children.filter(child => {
        const matchesSearch = child.child_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            child.household_name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFilter = statusFilter === 'all' || child.status === statusFilter;
        return matchesSearch && matchesFilter;
    });

    const toggleChildSelection = (childId: string) => {
        const newSelection = new Set(selectedChildren);
        if (newSelection.has(childId)) {
            newSelection.delete(childId);
        } else {
            newSelection.add(childId);
        }
        setSelectedChildren(newSelection);
    };

    const selectAll = () => {
        if (selectedChildren.size === filteredChildren.length) {
            setSelectedChildren(new Set());
        } else {
            setSelectedChildren(new Set(filteredChildren.map(c => c.child_id)));
        }
    };

    const normalizeMissingConsents = (rows: any[]) =>
        (rows || []).map((r) => ({
            form_id: r.form_id || r.id,
            form_title: r.form_title || r.title,
            form_type: r.form_type || r.type || 'custom',
            form_content: r.form_content || r.content || '',
            requires_signature: r.requires_signature !== false,
        }));

    const handleCollectESign = async (child: ChildConsentStatus) => {
        setIsCollecting(true);
        try {
            const session = supabase ? (await supabase.auth.getSession()).data.session : null;
            const res = await fetch(
                `/api/vault?resource=consent&action=check&child_id=${encodeURIComponent(child.child_id)}&parent_id=${encodeURIComponent(child.parent_id || '')}&child_name=${encodeURIComponent(child.child_name || '')}`,
                { headers: { Authorization: `Bearer ${session?.access_token || localStorage.getItem('awc_auth_token') || ''}` } }
            );
            const data = await res.json();
            if (!data.ok) {
                alert(data.error || 'Failed to load missing e-sign forms');
                return;
            }
            const missing = normalizeMissingConsents(data.missing_consents || []);
            if (missing.length === 0) {
                alert(`${child.child_name} already has all required e-sign forms completed.`);
                return;
            }
            setConsentModalMode('collect');
            setMissingConsents(missing);
            setCollectingChild(child);
        } catch (err: any) {
            alert(err.message || 'Failed to start e-sign collection');
        } finally {
            setIsCollecting(false);
        }
    };

    /** Member self-serve: tap a form → (children: pick child) → sign */
    const handleStartSelfServeSign = (form: ConsentForm) => {
        if (!form.is_active) {
            alert('This form is inactive.');
            return;
        }
        if (!userId) {
            alert('Please sign in again to e-sign forms.');
            return;
        }
        const audience = formAudience(form);
        if (audience === 'adults') {
            // Self-sign: store against the logged-in member (no child picker)
            setConsentModalMode('selfserve');
            setMissingConsents([
                {
                    form_id: form.id,
                    form_title: form.title,
                    form_type: form.form_type,
                    form_content: form.content || '',
                    requires_signature: form.requires_signature !== false,
                },
            ]);
            setCollectingChild({
                child_id: userId,
                parent_id: userId,
                child_name: userName || 'You',
                household_name: 'Self',
                parent_email: '',
                total_forms: 0,
                completed_forms: 0,
                expired_forms: 0,
                status: 'none',
                oldest_expiration: null,
            });
            return;
        }
        setSigningForm(form);
        setChildPickerQuery('');
        setChildPickerOpen(true);
    };

    const signableChildren = (() => {
        if (isStaff) return children;
        const mine = children.filter((c) => c.parent_id && userId && c.parent_id === userId);
        return mine.length > 0 ? mine : children;
    })();

    const pickerChildren = signableChildren.filter((c) => {
        const q = childPickerQuery.trim().toLowerCase();
        if (!q) return true;
        return (
            c.child_name.toLowerCase().includes(q) ||
            (c.household_name || '').toLowerCase().includes(q)
        );
    });

    const formsForList = forms.filter((f) => {
        if (!isStaff && !f.is_active) return false;
        const a = formAudience(f);
        if (audienceFilter === 'all') return true;
        if (audienceFilter === 'children') return a === 'children' || a === 'all';
        return a === 'adults' || a === 'all';
    });

    const sectionChildren = audienceFilter === 'all'
        ? formsForList.filter((f) => formAudience(f) === 'children' || formAudience(f) === 'all')
        : audienceFilter === 'children'
          ? formsForList
          : [];
    const sectionAdults = audienceFilter === 'all'
        ? formsForList.filter((f) => formAudience(f) === 'adults' || formAudience(f) === 'all')
        : audienceFilter === 'adults'
          ? formsForList
          : [];

    const handlePickChildForSign = (child: ChildConsentStatus) => {
        if (!signingForm) return;
        setChildPickerOpen(false);
        setConsentModalMode('selfserve');
        setMissingConsents([
            {
                form_id: signingForm.id,
                form_title: signingForm.title,
                form_type: signingForm.form_type,
                form_content: signingForm.content || '',
                requires_signature: signingForm.requires_signature !== false,
            },
        ]);
        setCollectingChild(child);
        setSigningForm(null);
    };

    const handleUpdateForm = async () => {
        if (!editingForm) return;
        setIsSavingForm(true);
        try {
            const session = supabase ? (await supabase.auth.getSession()).data.session : null;
            const response = await fetch('/api/vault?resource=consent&action=update_form', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token || ''}` },
                body: JSON.stringify(editingForm)
            });
            const result = await response.json();
            if (result.ok) {
                setEditingForm(null);
                await loadForms();
            } else {
                alert('Failed to update: ' + result.error);
            }
        } catch (err) {
            alert('Error: ' + err);
        } finally {
            setIsSavingForm(false);
        }
    };

    const handleCreateForm = async () => {
        console.log('=== CREATE FORM STARTED ===');
        if (!newForm.title.trim()) { alert('Please enter a form title'); return; }
        if (!newForm.content.trim()) { alert('Please enter form content'); return; }

        setIsSavingForm(true);
        try {
            // Use API (service role) to bypass RLS
            const { data: { session } } = await supabase!.auth.getSession();
            const response = await fetch('/api/vault?resource=consent&action=create_form', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
                body: JSON.stringify(newForm)
            });
            const result = await response.json();
            console.log('Create form result:', result);
            if (result.ok) {
                setIsFormBuilderOpen(false);
                setNewForm({ title: '', form_type: 'custom', content: '', is_required: true, requires_signature: true, valid_duration_days: 365, audience: 'children' });
                await loadForms();
            } else {
                alert('Failed to create form: ' + result.error);
            }
        } catch (error) {
            console.error('Error creating form:', error);
            alert('Error: ' + error);
        } finally {
            setIsSavingForm(false);
        }
    };

    if (!userId) {
        return (
            <div className="min-h-screen bg-[#FDFDFB] flex flex-col items-center justify-center gap-6 p-8">
                <div className="w-20 h-20 rounded-[2rem] bg-red-50 border border-red-200 flex items-center justify-center">
                    <Lock className="text-red-400" size={36} />
                </div>
                <div className="text-center">
                    <h2 className="text-2xl font-black text-[#0d1a14] mb-2">Sign in required</h2>
                    <p className="text-gray-400 text-sm max-w-sm">
                        Log in to view and e-sign Children&apos;s Ministry consent forms.
                    </p>
                </div>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#FDFDFB] flex items-center justify-center">
                <RefreshCw className="animate-spin text-burgundy" size={48} />
            </div>
        );
    }

    return (
        <>
        <div className="min-h-screen bg-[#FDFDFB] pb-32">
            {/* Header */}
            <div className="bg-white border-b border-gray-100 px-4 md:px-6 py-6 md:py-8">
                <div className="max-w-7xl mx-auto">
                    <div className="flex items-center gap-3 mb-2">
                        <Shield className="text-burgundy" size={24} />
                        <h2 className="text-[10px] font-black text-gold uppercase tracking-[0.4em]">Children's Ministry</h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h1 className="text-3xl md:text-4xl font-black text-[#0d1a14] tracking-tighter leading-none">
                          Consent / E-Sign<span className="text-gold">.</span>
                      </h1>
                      <AskAdminTitleLink />
                    </div>
                    <p className="text-gray-400 font-medium text-sm">
                        {isStaff
                            ? 'Any form can be opened, read, acknowledged, and e-signed. Check-in reuses what is already on file.'
                            : 'Tap any form → choose who it is for → read, acknowledge, type or draw. Saved on file.'}
                    </p>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 md:px-6 mt-6 md:mt-10">
                {/* Stats - staff only */}
                {isStaff && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4 mb-6 md:mb-8">
                    {[
                        { label: 'Total', value: stats.total_children, sub: 'Children', icon: Users, color: 'text-blue-500' },
                        { label: 'Complete', value: stats.complete, sub: 'All Signed', icon: CheckCircle2, color: 'text-green-500' },
                        { label: 'Partial', value: stats.partial, sub: 'Some Signed', icon: Clock, color: 'text-yellow-500' },
                        { label: 'None', value: stats.none, sub: 'Not Signed', icon: XCircle, color: 'text-red-500' },
                        { label: 'Expiring', value: stats.expiring_soon, sub: '30 Days', icon: AlertTriangle, color: 'text-orange-500' },
                    ].map((s, i) => (
                        <div key={i} className="bg-white rounded-[1.5rem] border border-gray-100 p-4 md:p-6">
                            <div className="flex items-center gap-2 mb-2">
                                <s.icon className={s.color} size={16} />
                                <h3 className="font-black text-[10px] text-burgundy uppercase">{s.label}</h3>
                            </div>
                            <p className="text-2xl md:text-3xl font-black text-[#0d1a14]">{s.value}</p>
                            <p className="text-[10px] text-gray-400 uppercase tracking-widest mt-1">{s.sub}</p>
                        </div>
                    ))}
                </div>
                )}

                {/* Tabs - scrollable on mobile */}
                <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
                    {(isStaff
                        ? [
                              { id: 'dashboard', label: 'Dashboard', icon: TrendingUp },
                              { id: 'children', label: 'Children', icon: Users },
                              { id: 'forms', label: 'Forms', icon: FileText },
                              { id: 'reminders', label: 'Reminders', icon: Mail },
                          ]
                        : [{ id: 'forms', label: 'Forms', icon: FileText }]
                    ).map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
                            className={`flex items-center gap-2 px-4 md:px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-burgundy text-gold' : 'bg-white text-gray-400 hover:bg-gray-50'}`}>
                            <tab.icon size={14} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Dashboard Tab */}
                {isStaff && activeTab === 'dashboard' && (
                    <div className="bg-white rounded-[2rem] border border-gray-100 p-5 md:p-8 space-y-6">
                        {forms.length === 0 && (
                            <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                                <div className="flex-1">
                                    <h4 className="font-black text-red-800 text-sm mb-1">No e-sign templates installed</h4>
                                    <p className="text-xs text-red-700 leading-relaxed">
                                        That is why you and parents see nothing to sign. Install the PLCC Children&apos;s Ministry defaults, then collect signatures at the desk.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    disabled={isSeeding}
                                    onClick={handleSeedDefaults}
                                    className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-burgundy text-gold text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all disabled:opacity-50 shrink-0"
                                >
                                    {isSeeding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                                    Install Default Forms
                                </button>
                            </div>
                        )}

                        <div className="bg-burgundy/5 border border-burgundy/10 rounded-2xl p-5 flex items-start gap-3">
                            <PenTool className="text-burgundy shrink-0 mt-0.5" size={20} />
                            <div>
                                <h4 className="font-black text-burgundy text-sm mb-1">How e-sign works</h4>
                                <ol className="text-xs text-gray-600 leading-relaxed list-decimal pl-4 space-y-1">
                                    <li>Open <strong>Forms</strong> → tap <strong>any</strong> form (not only check-in related).</li>
                                    <li>Choose <strong>who it is for</strong> (consent is stored per child).</li>
                                    <li>In the modal: <strong>scroll &amp; read</strong> → <strong>acknowledge</strong> → <strong>type name or draw</strong> with a finger.</li>
                                    <li>Saved on file. Kids Check-In later skips forms already signed.</li>
                                    <li>Staff backup: <strong>Children → Collect E-Sign</strong> or the check-in desk tablet.</li>
                                </ol>
                            </div>
                        </div>

                        <div className="bg-gold/10 border border-gold/30 rounded-2xl p-5">
                            <h4 className="font-black text-burgundy text-sm mb-2">What to tell parents / members</h4>
                            <p className="text-xs text-gray-700 leading-relaxed italic">
                                &ldquo;Go to Forms → Consent / E-Sign → Forms. Tap any form you need, choose who it is for,
                                then scroll, acknowledge, and type or draw your signature. It saves on file.
                                You can also sign at the Kids Check-In desk if something is still missing.&rdquo;
                            </p>
                        </div>

                        <h3 className="text-xl font-black text-[#0d1a14]">Quick Actions</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <button onClick={() => handleExport('csv')} className="p-5 bg-blue-50 rounded-2xl border border-blue-200 hover:bg-blue-100 transition-all text-left group">
                                <Download className="text-blue-600 mb-3 group-hover:scale-110 transition-transform" size={22} />
                                <h4 className="font-black text-burgundy mb-1">Export CSV</h4>
                                <p className="text-xs text-gray-600">Download all consent records</p>
                            </button>
                            <button onClick={() => setActiveTab('forms')} className="p-5 bg-purple-50 rounded-2xl border border-purple-200 hover:bg-purple-100 transition-all text-left group">
                                <FileText className="text-purple-600 mb-3 group-hover:scale-110 transition-transform" size={22} />
                                <h4 className="font-black text-burgundy mb-1">E-Sign Templates</h4>
                                <p className="text-xs text-gray-600">View and create consent e-sign forms</p>
                            </button>
                            <button onClick={() => setActiveTab('children')} className="p-5 bg-gold/10 rounded-2xl border border-gold/30 hover:bg-gold/20 transition-all text-left group">
                                <PenTool className="text-burgundy mb-3 group-hover:scale-110 transition-transform" size={22} />
                                <h4 className="font-black text-burgundy mb-1">Collect E-Sign</h4>
                                <p className="text-xs text-gray-600">Open signature pad for a child at the desk</p>
                            </button>
                            <Link to="/events/kids-checkin" className="p-5 bg-green-50 rounded-2xl border border-green-200 hover:bg-green-100 transition-all text-left group md:col-span-3">
                                <ExternalLink className="text-green-600 mb-3 group-hover:scale-110 transition-transform" size={22} />
                                <h4 className="font-black text-burgundy mb-1">Kids Check-In (auto e-sign gate)</h4>
                                <p className="text-xs text-gray-600">Parents are prompted to e-sign missing required forms before a child can check in</p>
                            </Link>
                        </div>
                    </div>
                )}

                {/* Children Status Tab */}
                {isStaff && activeTab === 'children' && (
                    <div className="bg-white rounded-[2rem] border border-gray-100 p-4 md:p-8">
                        <div className="bg-burgundy/5 border border-burgundy/10 rounded-2xl p-4 mb-5 flex items-start gap-3">
                            <PenTool className="text-burgundy shrink-0 mt-0.5" size={18} />
                            <div>
                                <h4 className="font-black text-burgundy text-sm mb-1">Desk collection (tablet / phone)</h4>
                                <p className="text-xs text-gray-600 leading-relaxed">
                                    Find the child → tap <strong>Collect E-Sign</strong> → hand the device to the parent.
                                    They type or draw for each required form. Kids Check-In also opens the same pad when forms are missing.
                                </p>
                            </div>
                        </div>
                        {forms.length === 0 && (
                            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-5 flex flex-col sm:flex-row sm:items-center gap-3">
                                <p className="text-xs text-red-700 flex-1">
                                    No templates installed — Collect E-Sign will have nothing to prompt. Install defaults first.
                                </p>
                                <button
                                    type="button"
                                    disabled={isSeeding}
                                    onClick={handleSeedDefaults}
                                    className="px-4 py-2 rounded-xl bg-burgundy text-gold text-[10px] font-black uppercase tracking-widest disabled:opacity-50 shrink-0"
                                >
                                    {isSeeding ? 'Installing…' : 'Install Defaults'}
                                </button>
                            </div>
                        )}
                        <div className="flex flex-col md:flex-row gap-3 mb-5">
                            <div className="flex-1 relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by name..." className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:border-burgundy text-sm" />
                            </div>
                            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="px-4 py-3 rounded-xl border border-gray-200 font-bold text-sm">
                                <option value="all">All Status</option>
                                <option value="complete">Complete</option>
                                <option value="partial">Partial</option>
                                <option value="none">None</option>
                                <option value="expired">Expired</option>
                            </select>
                        </div>
                        {selectedChildren.size > 0 && (
                            <div className="mb-4 p-4 bg-burgundy/5 rounded-xl border border-burgundy/20 flex items-center justify-between">
                                <p className="text-sm font-bold text-burgundy">{selectedChildren.size} selected</p>
                                <button onClick={handleSendReminders} className="px-4 py-2 bg-burgundy text-gold rounded-lg font-black text-xs uppercase">Send Reminders</button>
                            </div>
                        )}
                        {filteredChildren.length === 0 ? (
                            <div className="text-center py-16 text-gray-400">
                                <Users size={40} className="mx-auto mb-4 opacity-30" />
                                <p className="font-bold text-sm">No children listed yet</p>
                                <p className="text-xs mt-1">Add children under People → Households, or complete an e-sign during Kids Check-In</p>
                            </div>
                        ) : filteredChildren.map(child => (
                            <div key={child.child_id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-all mb-2">
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <input type="checkbox" checked={selectedChildren.has(child.child_id)} onChange={() => toggleChildSelection(child.child_id)} className="w-5 h-5 rounded border-2 border-burgundy text-burgundy shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-black text-burgundy text-sm truncate">{child.child_name}</h4>
                                        <p className="text-xs text-gray-500 truncate">{child.household_name}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-sm font-black text-burgundy">{child.completed_forms}/{child.total_forms}</p>
                                        {(child.also_signed_forms || 0) > 0 && (
                                            <p className="text-[10px] font-bold text-gray-400">+{child.also_signed_forms} other signed</p>
                                        )}
                                    </div>
                                    <div className={`px-2 py-1 rounded-lg font-black text-[10px] uppercase shrink-0 ${child.status === 'complete' ? 'bg-green-100 text-green-700' : child.status === 'partial' ? 'bg-yellow-100 text-yellow-700' : child.status === 'expired' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>{child.status}</div>
                                </div>
                                {child.status !== 'complete' && (
                                    <button
                                        type="button"
                                        disabled={isCollecting || forms.length === 0}
                                        onClick={() => handleCollectESign(child)}
                                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-burgundy text-gold text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all disabled:opacity-50 shrink-0"
                                    >
                                        <PenTool size={14} />
                                        Collect E-Sign
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Forms Tab */}
                {activeTab === 'forms' && (
                    <div className="bg-white rounded-[2rem] border border-gray-100 p-4 md:p-8">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                            <div>
                                <h3 className="text-xl font-black text-[#0d1a14]">E-Sign Forms</h3>
                                <p className="text-xs text-gray-500 mt-1">
                                    Children forms: pick a child. Adult forms: sign for yourself. Scroll, acknowledge, type or draw.
                                </p>
                            </div>
                            {isStaff && (
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    disabled={isSeeding}
                                    onClick={handleSeedDefaults}
                                    className="flex items-center gap-2 px-4 py-3 bg-white border border-burgundy/20 text-burgundy rounded-xl font-black text-xs uppercase tracking-widest hover:bg-burgundy/5 transition-all disabled:opacity-50"
                                >
                                    {isSeeding ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                                    {forms.length === 0 ? 'Install Defaults' : 'Sync Defaults'}
                                </button>
                                <button
                                    onClick={() => { setIsFormBuilderOpen(true); }}
                                    className="flex items-center gap-2 px-4 md:px-6 py-3 bg-burgundy text-gold rounded-xl font-black text-xs uppercase tracking-widest hover:scale-105 transition-all"
                                >
                                    <Plus size={16} />
                                    Create E-Sign Form
                                </button>
                            </div>
                            )}
                        </div>

                        <div className="flex flex-wrap gap-2 mb-6">
                            {([
                                { id: 'all' as const, label: 'All' },
                                { id: 'children' as const, label: 'Children' },
                                { id: 'adults' as const, label: 'Adults' },
                            ]).map((chip) => (
                                <button
                                    key={chip.id}
                                    type="button"
                                    onClick={() => {
                                        setAudienceFilter(chip.id);
                                        const next = new URLSearchParams(searchParams);
                                        if (!next.get('tab')) next.set('tab', 'forms');
                                        if (chip.id === 'all') next.delete('audience');
                                        else next.set('audience', chip.id);
                                        setSearchParams(next, { replace: true });
                                    }}
                                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                        audienceFilter === chip.id
                                            ? 'bg-burgundy text-gold'
                                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                    }`}
                                >
                                    {chip.label}
                                </button>
                            ))}
                        </div>

                        {forms.length === 0 ? (
                            <div className="text-center py-16 text-gray-400">
                                <FileText size={40} className="mx-auto mb-4 opacity-30" />
                                <p className="font-bold text-sm">No e-sign forms yet</p>
                                <p className="text-xs mt-2 max-w-md mx-auto">
                                    {isStaff
                                        ? <>Click <strong>Install Defaults</strong> above, then run the audience SQL if Sync fails.</>
                                        : 'Ask a staff member to install the consent form templates.'}
                                </p>
                            </div>
                        ) : formsForList.length === 0 ? (
                            <div className="text-center py-12 text-gray-400">
                                <p className="font-bold text-sm">No forms in this category</p>
                                <p className="text-xs mt-1">Try All, or ask staff to create an Adults form.</p>
                            </div>
                        ) : (
                            <div className="space-y-8">
                                {([
                                    { key: 'children', title: 'Children', rows: sectionChildren },
                                    { key: 'adults', title: 'Adults', rows: sectionAdults },
                                ] as const).filter((s) => s.rows.length > 0).map((section) => (
                                    <div key={section.key}>
                                        {audienceFilter === 'all' && (
                                            <h4 className="text-xs font-black text-burgundy uppercase tracking-widest mb-3">
                                                {section.title}
                                            </h4>
                                        )}
                                        <div className="space-y-3">
                                            {section.rows.map((form) => {
                                                const isHighlighted =
                                                    !!highlightFormTitle &&
                                                    form.title.toLowerCase() === highlightFormTitle.toLowerCase();
                                                const aud = formAudience(form);
                                                return (
                                                    <div
                                                        key={form.id}
                                                        id={`consent-form-${encodeURIComponent(form.title.toLowerCase())}`}
                                                        className={`p-4 md:p-5 rounded-2xl border transition-all ${
                                                            isHighlighted
                                                                ? 'bg-gold/15 border-gold ring-2 ring-gold/40'
                                                                : 'bg-gray-50 border-gray-200 hover:border-burgundy/30'
                                                        } ${!form.is_active ? 'opacity-50' : ''}`}
                                                    >
                                                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleStartSelfServeSign(form)}
                                                                disabled={!form.is_active}
                                                                className="flex-1 min-w-0 text-left disabled:opacity-50"
                                                            >
                                                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                                                    <h4 className="font-black text-burgundy text-sm">{form.title}</h4>
                                                                    <span className="px-2 py-0.5 bg-burgundy/10 text-burgundy rounded text-[10px] font-black uppercase">
                                                                        {aud === 'adults' ? 'Adults' : aud === 'all' ? 'All ages' : 'Children'}
                                                                    </span>
                                                                    {isHighlighted && (
                                                                        <span className="px-2 py-0.5 bg-burgundy text-gold rounded text-[10px] font-black uppercase">
                                                                            Ask Admin
                                                                        </span>
                                                                    )}
                                                                    {(form.requires_signature !== false) && (
                                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gold/20 text-burgundy rounded text-[10px] font-black uppercase">
                                                                            <PenTool size={10} /> E-Sign
                                                                        </span>
                                                                    )}
                                                                    {form.is_required && <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-black uppercase">Required</span>}
                                                                    {!form.is_active && isStaff && <span className="px-2 py-0.5 bg-gray-200 text-gray-600 rounded text-[10px] font-black uppercase">Inactive</span>}
                                                                </div>
                                                                <p className="text-xs text-gray-500">{form.form_type} · {form.valid_duration_days} days</p>
                                                            </button>
                                                            <div className="flex gap-2 shrink-0">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleStartSelfServeSign(form)}
                                                                    disabled={!form.is_active}
                                                                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-burgundy text-gold text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all disabled:opacity-50"
                                                                >
                                                                    <PenTool size={14} />
                                                                    Sign
                                                                </button>
                                                                {isStaff && (
                                                                    <>
                                                                        <button type="button" onClick={() => setEditingForm(form)} className="p-2 bg-blue-100 text-blue-600 rounded-xl hover:bg-blue-200 transition-all"><Edit size={14} /></button>
                                                                        <button type="button" onClick={() => setPreviewForm(form)} className="p-2 bg-gray-200 text-gray-600 rounded-xl hover:bg-gray-300 transition-all"><Eye size={14} /></button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Reminders Tab */}
                {isStaff && activeTab === 'reminders' && (
                    <div className="bg-white rounded-[2rem] border border-gray-100 p-4 md:p-8">
                        <h3 className="text-xl font-black text-[#0d1a14] mb-5">Send Consent Reminders</h3>
                        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-5 mb-5">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="text-yellow-600 shrink-0 mt-0.5" size={18} />
                                <p className="text-sm text-yellow-700">Select children from the <strong>Children</strong> tab, then come back here to send reminders.</p>
                            </div>
                        </div>
                        <button onClick={() => setActiveTab('children')} className="w-full py-4 bg-burgundy text-gold rounded-xl font-black text-sm uppercase tracking-widest hover:scale-105 transition-all">
                            Go to Children Status
                        </button>
                    </div>
                )}
            </div>

            {/* ===== CREATE FORM MODAL ===== */}
            {isStaff && isFormBuilderOpen && (
                <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center animate-in fade-in duration-200">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsFormBuilderOpen(false)} />
                    <div className="relative bg-white w-full md:max-w-2xl max-h-[95vh] rounded-t-[2.5rem] md:rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300">
                        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between shrink-0">
                            <div>
                                <p className="text-[10px] font-black text-gold uppercase tracking-widest">New Consent Form</p>
                                <h3 className="text-xl font-black text-burgundy">Create Form</h3>
                            </div>
                            <button onClick={() => setIsFormBuilderOpen(false)} className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 hover:text-burgundy transition-all">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-black text-burgundy uppercase tracking-widest mb-2">Form Title *</label>
                                <input type="text" value={newForm.title} onChange={(e) => setNewForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Field Trip Permission" className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-burgundy text-sm font-bold" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-black text-burgundy uppercase tracking-widest mb-2">Type</label>
                                    <select value={newForm.form_type} onChange={(e) => setNewForm(f => ({ ...f, form_type: e.target.value }))} className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-burgundy text-sm font-bold">
                                        <option value="custom">Custom</option>
                                        <option value="photo_release">Photo Release</option>
                                        <option value="medical">Medical</option>
                                        <option value="general_liability">Liability</option>
                                        <option value="field_trip">Field Trip</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-burgundy uppercase tracking-widest mb-2">Valid (Days)</label>
                                    <input type="number" value={newForm.valid_duration_days} onChange={(e) => setNewForm(f => ({ ...f, valid_duration_days: parseInt(e.target.value) || 365 }))} className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-burgundy text-sm font-bold" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-black text-burgundy uppercase tracking-widest mb-2">Audience</label>
                                <select
                                    value={newForm.audience}
                                    onChange={(e) => setNewForm(f => ({ ...f, audience: e.target.value as 'children' | 'adults' | 'all' }))}
                                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-burgundy text-sm font-bold"
                                >
                                    <option value="children">Children — pick a child to sign</option>
                                    <option value="adults">Adults — signer signs for themselves</option>
                                    <option value="all">All ages — listed in both; signing uses child picker</option>
                                </select>
                            </div>
                            <div className="flex gap-3">
                                <label className="flex items-center gap-2 cursor-pointer flex-1 p-3 bg-gray-50 rounded-xl border border-gray-200">
                                    <input type="checkbox" checked={newForm.is_required} onChange={(e) => setNewForm(f => ({ ...f, is_required: e.target.checked }))} className="w-4 h-4 rounded border-2 border-burgundy text-burgundy" />
                                    <span className="text-sm font-bold text-gray-700">Required</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer flex-1 p-3 bg-gray-50 rounded-xl border border-gray-200">
                                    <input type="checkbox" checked={newForm.requires_signature} onChange={(e) => setNewForm(f => ({ ...f, requires_signature: e.target.checked }))} className="w-4 h-4 rounded border-2 border-burgundy text-burgundy" />
                                    <span className="text-sm font-bold text-gray-700">Needs Signature</span>
                                </label>
                            </div>
                            <div>
                                <label className="block text-xs font-black text-burgundy uppercase tracking-widest mb-2">Form Content *</label>
                                <textarea value={newForm.content} onChange={(e) => setNewForm(f => ({ ...f, content: e.target.value }))} placeholder="Type the full consent form text here..." rows={7} className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-burgundy text-sm resize-none" />
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
                            <button onClick={() => setIsFormBuilderOpen(false)} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-black text-sm uppercase tracking-widest">Cancel</button>
                            <button onClick={handleCreateForm} disabled={isSavingForm} className="flex-1 py-3 bg-burgundy text-gold rounded-xl font-black text-sm uppercase tracking-widest hover:scale-105 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                                {isSavingForm ? <><Loader2 className="animate-spin" size={16} />Saving...</> : <><Save size={16} />Save Form</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>

        {/* ===== EDIT FORM MODAL ===== */}
        {isStaff && editingForm && (
            <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center animate-in fade-in duration-200">
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEditingForm(null)} />
                <div className="relative bg-white w-full md:max-w-2xl max-h-[95vh] rounded-t-[2.5rem] md:rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300">
                    <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between shrink-0">
                        <div>
                            <p className="text-[10px] font-black text-gold uppercase tracking-widest">Editing Form</p>
                            <h3 className="text-xl font-black text-burgundy">{editingForm.title}</h3>
                        </div>
                        <button onClick={() => setEditingForm(null)} className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 hover:text-burgundy transition-all">
                            <X size={20} />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 space-y-4">
                        <div>
                            <label className="block text-xs font-black text-burgundy uppercase tracking-widest mb-2">Form Title</label>
                            <input type="text" value={editingForm.title} onChange={(e) => setEditingForm(f => f ? { ...f, title: e.target.value } : f)} className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-burgundy text-sm font-bold" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-black text-burgundy uppercase tracking-widest mb-2">Type</label>
                                <select value={editingForm.form_type} onChange={(e) => setEditingForm(f => f ? { ...f, form_type: e.target.value } : f)} className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-burgundy text-sm font-bold">
                                    <option value="custom">Custom</option>
                                    <option value="photo_release">Photo Release</option>
                                    <option value="medical">Medical</option>
                                    <option value="general_liability">Liability</option>
                                    <option value="field_trip">Field Trip</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-black text-burgundy uppercase tracking-widest mb-2">Valid (Days)</label>
                                <input type="number" value={editingForm.valid_duration_days} onChange={(e) => setEditingForm(f => f ? { ...f, valid_duration_days: parseInt(e.target.value) || 365 } : f)} className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-burgundy text-sm font-bold" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-black text-burgundy uppercase tracking-widest mb-2">Audience</label>
                            <select
                                value={editingForm.audience === 'adults' || editingForm.audience === 'all' ? editingForm.audience : 'children'}
                                onChange={(e) => setEditingForm(f => f ? { ...f, audience: e.target.value as 'children' | 'adults' | 'all' } : f)}
                                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-burgundy text-sm font-bold"
                            >
                                <option value="children">Children — pick a child to sign</option>
                                <option value="adults">Adults — signer signs for themselves</option>
                                <option value="all">All ages — listed in both; signing uses child picker</option>
                            </select>
                        </div>
                        <div className="flex gap-3">
                            <label className="flex items-center gap-2 cursor-pointer flex-1 p-3 bg-gray-50 rounded-xl border border-gray-200">
                                <input type="checkbox" checked={editingForm.is_required} onChange={(e) => setEditingForm(f => f ? { ...f, is_required: e.target.checked } : f)} className="w-4 h-4 rounded border-2 border-burgundy text-burgundy" />
                                <span className="text-sm font-bold text-gray-700">Required</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer flex-1 p-3 bg-gray-50 rounded-xl border border-gray-200">
                                <input type="checkbox" checked={editingForm.is_active} onChange={(e) => setEditingForm(f => f ? { ...f, is_active: e.target.checked } : f)} className="w-4 h-4 rounded border-2 border-burgundy text-burgundy" />
                                <span className="text-sm font-bold text-gray-700">Active</span>
                            </label>
                        </div>
                        <div>
                            <label className="block text-xs font-black text-burgundy uppercase tracking-widest mb-2">Form Content</label>
                            <textarea value={(editingForm as any).content || ''} onChange={(e) => setEditingForm(f => f ? { ...f, content: e.target.value } as any : f)} rows={8} className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-burgundy text-sm resize-none" />
                        </div>
                    </div>
                    <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
                        <button onClick={() => setEditingForm(null)} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-black text-sm uppercase tracking-widest">Cancel</button>
                        <button onClick={handleUpdateForm} disabled={isSavingForm} className="flex-1 py-3 bg-burgundy text-gold rounded-xl font-black text-sm uppercase tracking-widest hover:scale-105 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                            {isSavingForm ? <><Loader2 className="animate-spin" size={16} />Saving...</> : <><Save size={16} />Save Changes</>}
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* ===== PREVIEW FORM MODAL ===== */}
        {previewForm && (
            <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center animate-in fade-in duration-200">
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm print:hidden" onClick={() => setPreviewForm(null)} />
                <div className="relative bg-white w-full md:max-w-3xl max-h-[95vh] rounded-t-[2.5rem] md:rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300 print:max-w-none print:max-h-none print:rounded-none print:shadow-none print:h-auto">
                    <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between shrink-0 bg-burgundy/5 print:hidden">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <p className="text-[10px] font-black text-gold uppercase tracking-widest">{previewForm.form_type.replace('_', ' ')}</p>
                                {previewForm.is_required && <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-black uppercase">Required</span>}
                                {!previewForm.is_active && <span className="px-2 py-0.5 bg-gray-200 text-gray-500 rounded text-[10px] font-black uppercase">Inactive</span>}
                            </div>
                            <h3 className="text-xl font-black text-burgundy">{previewForm.title}</h3>
                            <p className="text-xs text-gray-400 mt-0.5">Valid {previewForm.valid_duration_days} days · {previewForm.requires_signature ? 'Signature required' : 'No signature'}</p>
                        </div>
                        <button onClick={() => setPreviewForm(null)} className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:text-burgundy transition-all">
                            <X size={20} />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 sm:p-6 print:overflow-visible print:p-0 consent-preview-root">
                        <ConsentNoticeDocument title={previewForm.title} content={previewForm.content || ''} />
                    </div>
                    <div className="px-6 py-4 border-t border-gray-100 flex flex-wrap gap-3 shrink-0 print:hidden">
                        <button
                            type="button"
                            onClick={() => {
                                const el = document.querySelector('.consent-preview-root .consent-notice-doc') as HTMLElement | null;
                                printConsentNotice(el);
                            }}
                            className="flex-1 min-w-[120px] py-3 bg-white text-burgundy border border-burgundy/20 rounded-xl font-black text-sm uppercase tracking-widest hover:bg-burgundy/5 transition-all"
                        >
                            Print
                        </button>
                        <button onClick={() => { setPreviewForm(null); setEditingForm(previewForm); }} className="flex-1 min-w-[120px] py-3 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl font-black text-sm uppercase tracking-widest hover:bg-blue-100 transition-all flex items-center justify-center gap-2">
                            <Edit size={16} /> Edit
                        </button>
                        <button onClick={() => setPreviewForm(null)} className="flex-1 min-w-[120px] py-3 bg-burgundy text-gold rounded-xl font-black text-sm uppercase tracking-widest hover:scale-105 transition-all">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        )}

        {collectingChild && missingConsents.length > 0 && (
            <ConsentModal
                isOpen={!!collectingChild}
                mode={consentModalMode}
                onClose={() => {
                    setCollectingChild(null);
                    setMissingConsents([]);
                    setConsentModalMode('collect');
                }}
                childName={collectingChild.child_name}
                childId={collectingChild.child_id}
                parentId={
                    consentModalMode === 'selfserve'
                        ? userId || collectingChild.parent_id || ''
                        : collectingChild.parent_id || userId || ''
                }
                missingConsents={missingConsents}
                onConsentsCompleted={() => {
                    const name = collectingChild.child_name;
                    const wasSelfServe = consentModalMode === 'selfserve';
                    setCollectingChild(null);
                    setMissingConsents([]);
                    setConsentModalMode('collect');
                    loadData();
                    if (wasSelfServe) {
                        alert(`Saved for ${name}. The form is on file — you can close this.`);
                    }
                }}
            />
        )}

        {/* Self-serve: choose which child this form is for */}
        {childPickerOpen && signingForm && (
            <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center animate-in fade-in duration-200">
                <div
                    className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                    onClick={() => {
                        setChildPickerOpen(false);
                        setSigningForm(null);
                    }}
                />
                <div className="relative bg-white w-full md:max-w-lg max-h-[90vh] rounded-t-[2.5rem] md:rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300">
                    <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between shrink-0">
                        <div>
                            <p className="text-[10px] font-black text-gold uppercase tracking-widest">E-Sign</p>
                            <h3 className="text-lg font-black text-burgundy">Who is this form for?</h3>
                            <p className="text-xs text-gray-500 mt-1 truncate max-w-[260px]">{signingForm.title}</p>
                            <p className="text-[11px] text-gray-400 mt-2">Consent is saved under that person — not a check-in step.</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setChildPickerOpen(false);
                                setSigningForm(null);
                            }}
                            className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 hover:text-burgundy transition-all"
                        >
                            <X size={20} />
                        </button>
                    </div>
                    <div className="px-6 py-3 border-b border-gray-50">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                            <input
                                type="text"
                                value={childPickerQuery}
                                onChange={(e) => setChildPickerQuery(e.target.value)}
                                placeholder="Search child or household..."
                                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:border-burgundy text-sm"
                            />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        {pickerChildren.length === 0 ? (
                            <div className="text-center py-12 text-gray-400">
                                <Users size={36} className="mx-auto mb-3 opacity-30" />
                                <p className="font-bold text-sm">No children found</p>
                                <p className="text-xs mt-1 px-4">
                                    Add your child under People → Households first, then come back to e-sign.
                                </p>
                            </div>
                        ) : (
                            pickerChildren.map((child) => (
                                <button
                                    key={child.child_id}
                                    type="button"
                                    onClick={() => handlePickChildForSign(child)}
                                    className="w-full text-left p-4 rounded-xl bg-gray-50 border border-gray-200 hover:border-burgundy hover:bg-burgundy/5 transition-all"
                                >
                                    <p className="font-black text-burgundy text-sm">{child.child_name}</p>
                                    <p className="text-xs text-gray-500">{child.household_name}</p>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </div>
        )}
        </>
    );

};

export default ConsentManagement;
