
import React, { useState } from 'react';
import {
  Settings,
  Bell,
  Lock,
  Smartphone,
  Palette,
  Database,
  ShieldCheck,
  Sparkles,
  LifeBuoy,
  ChevronRight,
  Monitor,
  Mail,
  Zap,
  Globe,
  Loader2,
  CheckCircle2,
  UserCheck,
  ShieldAlert,
  Fingerprint,
  Plus,
  MessageSquare,
  Command,
  Activity,
  Layout,
  // Added RefreshCw to fix the 'Cannot find name' error
  RefreshCw
} from 'lucide-react';
import { getAuthHeaders } from '../../lib/api';
import { writeSeasonPreview } from '../../lib/seasons/applyTheme';
import type { ThemeMode } from '../../lib/seasons';

const SystemSettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('General');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showSuccess, setShowSuccess] = useState(false);

  // Unified State for all settings
  const [settings, setSettings] = useState({
    general: {
      publicSearch: false,
      kioskMode: false,
      language: 'English (US)',
      timezone: 'Eastern Standard Time',
    },
    security: {
      mfaRequired: true,
      sessionTimeout: '2 Hours',
      accountLockout: true,
      auditRetention: '7 Years'
    },
    notifications: {
      stewardshipAlerts: true,
      stewardshipThreshold: '1000',
      volunteerShortage: true,
      memberOnboarding: false,
    },
    branding: {
      primaryColor: '#1d372c',
      accentColor: '#C9A35A',
      customDomain: 'portal.grace-awc.org',
      compactMode: false
    },
    seasonal: {
      mode: 'automatic',
      effects: true,
      anniversaryMonth: null as number | null,
      anniversaryDay: null as number | null,
    }
  });
  const [previewMode, setPreviewMode] = useState('automatic');
  const [previewDate, setPreviewDate] = useState('');
  const [previewNote, setPreviewNote] = useState('');

  React.useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/vault?resource=settings&scope=system', { headers });
        const data = await res.json();
        if (data.ok && data.settings) {
          setSettings((prev) => ({
            ...prev,
            ...data.settings,
            general: { ...prev.general, ...(data.settings.general || {}) },
            security: { ...prev.security, ...(data.settings.security || {}) },
            notifications: { ...prev.notifications, ...(data.settings.notifications || {}) },
            branding: { ...prev.branding, ...(data.settings.branding || {}) },
            seasonal: { ...prev.seasonal, ...(data.settings.seasonal || {}) },
          }));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const tabs = [
    { id: 'General', icon: <Settings size={20} />, sub: 'System Defaults' },
    { id: 'Security', icon: <ShieldCheck size={20} />, sub: 'Access & Logic' },
    { id: 'Notifications', icon: <Bell size={20} />, sub: 'Alert Triggers' },
    { id: 'Branding', icon: <Palette size={20} />, sub: 'Visual Identity' },
  ];

  const handleToggle = (section: string, key: string) => {
    setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section as keyof typeof prev] as any,
        [key]: !(prev[section as keyof typeof prev] as any)[key]
      }
    }));
  };

  const handleInputChange = (section: string, key: string, value: string) => {
    setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section as keyof typeof prev] as any,
        [key]: value
      }
    }));
  };

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/vault?resource=settings&scope=system', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ settings }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Save failed');
      if (data.settings) setSettings((prev) => ({ ...prev, ...data.settings }));
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err: any) {
      alert(err?.message || 'Could not save system settings');
    } finally {
      setIsSaving(false);
    }
  };

  const SettingToggle = ({ label, sub, icon: Icon, section, stateKey }: any) => (
    <div className="flex items-center justify-between group/opt p-6 rounded-[2rem] hover:bg-gray-50/50 transition-all border border-transparent hover:border-gray-100">
      <div className="flex items-center gap-6">
        <div className="w-14 h-14 rounded-2xl bg-white text-gray-400 flex items-center justify-center group-hover/opt:bg-gold-cream group-hover/opt:text-gold transition-all shadow-sm border border-gray-100 group-hover/opt:border-gold/20">
          <Icon size={24} strokeWidth={1.5} />
        </div>
        <div>
          <p className="text-[16px] font-black text-[#0d1a14] tracking-tight">{label}</p>
          <p className="text-[13px] text-gray-400 font-medium mt-1 leading-relaxed max-w-md">{sub}</p>
        </div>
      </div>
      <label className="relative inline-flex items-center cursor-pointer ml-4">
        <input
          type="checkbox"
          className="sr-only peer"
          checked={(settings[section as keyof typeof settings] as any)[stateKey]}
          onChange={() => handleToggle(section, stateKey)}
        />
        <div className="w-16 h-8 bg-gray-100 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-7 after:transition-all peer-checked:bg-burgundy border border-gray-100 shadow-inner group-hover:shadow-md"></div>
      </label>
    </div>
  );

  return (
    <div className="space-y-12 animate-in fade-in duration-700">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-b border-gray-100 pb-10">
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="h-1 w-12 bg-burgundy rounded-full" />
            <h2 className="text-[11px] font-black text-burgundy/40 uppercase tracking-[0.5em]">System Core</h2>
          </div>
          <h1 className="text-6xl font-black text-[#0d1a14] tracking-tighter leading-none">Settings<span className="text-gold">.</span></h1>
          <p className="text-gray-400 font-medium text-lg mt-4 max-w-xl">Configure your ministry's digital infrastructure and automated workflows.</p>
        </div>
        <div className="flex items-center gap-4">
          {showSuccess && (
            <div className="flex items-center gap-2 text-green-600 font-black text-sm animate-in fade-in slide-in-from-right-4 uppercase tracking-widest">
              <CheckCircle2 size={18} />
              Synced
            </div>
          )}
          <button
            onClick={saveSettings}
            disabled={isSaving}
            className="min-w-[240px] px-10 py-5 bg-burgundy text-gold font-black text-xs uppercase tracking-widest rounded-2xl shadow-2xl shadow-burgundy/20 hover:bg-burgundy-dark transition-all active:scale-95 border-b-4 border-gold/30 flex items-center justify-center gap-3 disabled:opacity-70 group"
          >
            {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Database size={18} className="group-hover:scale-110 transition-transform" />}
            {isSaving ? 'Processing...' : 'Commit System Changes'}
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-12">
        {/* Navigation Sidebar - Chat Style */}
        <div className="w-full lg:w-80 shrink-0 space-y-3">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] ml-4 mb-4">Control Panels</p>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-5 p-5 rounded-[2rem] transition-all group border ${activeTab === tab.id
                ? 'bg-burgundy text-gold shadow-2xl shadow-burgundy/20 border-gold/20'
                : 'bg-white text-gray-500 border-transparent hover:border-gray-100 hover:bg-gray-50'
                }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-inner transition-transform group-hover:scale-110 ${activeTab === tab.id ? 'bg-white/10 text-gold' : 'bg-gray-50 text-gray-300'}`}>
                {tab.icon}
              </div>
              <div className="text-left min-w-0">
                <span className="block text-[15px] font-black uppercase tracking-tight">{tab.id}</span>
                <span className={`block text-[10px] font-bold uppercase tracking-widest mt-0.5 ${activeTab === tab.id ? 'text-gold/60' : 'text-gray-300'}`}>{tab.sub}</span>
              </div>
            </button>
          ))}

          <div className="mt-12 p-8 bg-gold-cream/40 rounded-[2.5rem] border border-gold/10 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-5 text-gold group-hover:scale-150 transition-transform duration-1000">
              <Command size={80} />
            </div>
            <div className="flex items-center gap-3 mb-4 relative z-10">
              <div className="w-8 h-8 rounded-lg bg-gold text-white flex items-center justify-center shadow-sm">
                <Zap size={16} />
              </div>
              <h4 className="text-[11px] font-black text-[#0d1a14] uppercase tracking-widest">Automation Hub</h4>
            </div>
            <p className="text-[11px] text-gray-400 font-bold leading-relaxed relative z-10">System is currently running at <span className="text-burgundy">100% capacity</span>. No bottlenecks detected in the last 24 hours.</p>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 space-y-10">
          <div className="bg-white rounded-[4rem] border border-gray-100 shadow-[0_30px_90px_rgba(0,0,0,0.03)] overflow-hidden flex flex-col group min-h-[600px] hover:shadow-xl transition-all duration-700">
            <div className="p-10 border-b border-gray-50 bg-gold-cream/5 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-black text-[#0d1a14] tracking-tight">{activeTab} Panel</h3>
                <div className="flex items-center gap-2 mt-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e] animate-pulse" />
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.3em]">Module Authenticated & Online</p>
                </div>
              </div>
              <button className="p-3 bg-white border border-gray-100 text-gray-300 hover:text-burgundy rounded-2xl transition-all shadow-sm">
                <Plus size={20} />
              </button>
            </div>

            <div className="p-12 space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {activeTab === 'General' && (
                <div className="space-y-6">
                  <SettingToggle
                    label="Public Directory Index"
                    sub="Toggle search engine indexing for the public portal. Privacy controls remain enforced for individual members."
                    icon={Globe}
                    section="general"
                    stateKey="publicSearch"
                  />
                  <SettingToggle
                    label="Kiosk Logic: Maintenance"
                    sub="Temporarily disable physical check-in kiosks for database rebuilding or Sunday morning setup."
                    icon={Monitor}
                    section="general"
                    stateKey="kioskMode"
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-10 border-t border-gray-50">
                    <div className="space-y-4">
                      <label className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Administrative Language</label>
                      <div className="relative">
                        <select
                          value={settings.general.language}
                          onChange={(e) => handleInputChange('general', 'language', e.target.value)}
                          className="w-full px-8 py-5 rounded-[2rem] bg-gray-50 border border-transparent focus:bg-white focus:border-gold outline-none transition-all font-bold text-[#0d1a14] cursor-pointer appearance-none shadow-inner"
                        >
                          <option>English (US)</option>
                          <option>Spanish (LatAm)</option>
                          <option>French</option>
                        </select>
                        <ChevronRight size={18} className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-300 rotate-90" />
                      </div>
                    </div>
                    <div className="space-y-4">
                      <label className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Global Timezone</label>
                      <div className="relative">
                        <select
                          value={settings.general.timezone}
                          onChange={(e) => handleInputChange('general', 'timezone', e.target.value)}
                          className="w-full px-8 py-5 rounded-[2rem] bg-gray-50 border border-transparent focus:bg-white focus:border-gold outline-none transition-all font-bold text-[#0d1a14] cursor-pointer appearance-none shadow-inner"
                        >
                          <option>Eastern Standard Time</option>
                          <option>Pacific Standard Time</option>
                          <option>UTC +0</option>
                        </select>
                        <ChevronRight size={18} className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-300 rotate-90" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'Security' && (
                <div className="space-y-6">
                  <SettingToggle
                    label="Force MFA Strategy"
                    sub="Enforce multi-factor authentication across all accounts with administrative permissions."
                    icon={Fingerprint}
                    section="security"
                    stateKey="mfaRequired"
                  />
                  <SettingToggle
                    label="Adaptive Lockout Logic"
                    sub="Intelligently block IP addresses exhibiting malicious login patterns after 5 failed attempts."
                    icon={ShieldAlert}
                    section="security"
                    stateKey="accountLockout"
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-10 border-t border-gray-50">
                    <div className="space-y-4">
                      <label className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Session Integrity Timeout</label>
                      <select
                        value={settings.security.sessionTimeout}
                        onChange={(e) => handleInputChange('security', 'sessionTimeout', e.target.value)}
                        className="w-full px-8 py-5 rounded-[2rem] bg-gray-50 border border-transparent focus:bg-white focus:border-gold outline-none transition-all font-bold text-[#0d1a14] cursor-pointer shadow-inner appearance-none"
                      >
                        <option>30 Minutes</option>
                        <option>1 Hour</option>
                        <option>2 Hours</option>
                        <option>8 Hours (Full Shift)</option>
                      </select>
                    </div>
                    <div className="space-y-4">
                      <label className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Audit Ledger Retention</label>
                      <select
                        value={settings.security.auditRetention}
                        onChange={(e) => handleInputChange('security', 'auditRetention', e.target.value)}
                        className="w-full px-8 py-5 rounded-[2rem] bg-gray-50 border border-transparent focus:bg-white focus:border-gold outline-none transition-all font-bold text-[#0d1a14] cursor-pointer shadow-inner appearance-none"
                      >
                        <option>1 Year</option>
                        <option>3 Years</option>
                        <option>7 Years</option>
                        <option>Infinite</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'Notifications' && (
                <div className="space-y-6">
                  <div className="bg-gold-cream/30 border border-gold/10 p-8 rounded-[2.5rem] mb-6 flex items-start gap-5">
                    <div className="w-10 h-10 rounded-xl bg-gold text-white flex items-center justify-center shrink-0 shadow-md">
                      <Bell size={20} />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-black text-[#0d1a14] uppercase tracking-widest">Notification Thresholds</h4>
                      <p className="text-xs text-gray-400 mt-1">Configure when system alerts should be triggered for your role.</p>
                    </div>
                  </div>
                  <SettingToggle
                    label="Stewardship Alerts"
                    sub="Receive real-time notifications for contributions that exceed established thresholds."
                    icon={Zap}
                    section="notifications"
                    stateKey="stewardshipAlerts"
                  />
                  <SettingToggle
                    label="Volunteer Shortage"
                    sub="Automatically notify team leads when event rosters are below minimum safe staffing levels."
                    icon={UserCheck}
                    section="notifications"
                    stateKey="volunteerShortage"
                  />
                </div>
              )}

              {activeTab === 'Branding' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <label className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Primary Accent Color</label>
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl shadow-inner border border-gray-100" style={{ backgroundColor: settings.branding.primaryColor }} />
                        <input
                          type="text"
                          value={settings.branding.primaryColor}
                          onChange={(e) => handleInputChange('branding', 'primaryColor', e.target.value)}
                          className="flex-1 px-6 py-4 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-gold outline-none transition-all font-mono font-bold text-[#0d1a14]"
                        />
                      </div>
                    </div>
                    <div className="space-y-4">
                      <label className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Custom Portal Host</label>
                      <div className="relative">
                        <Globe size={18} className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-300" />
                        <input
                          type="text"
                          value={settings.branding.customDomain}
                          onChange={(e) => handleInputChange('branding', 'customDomain', e.target.value)}
                          className="w-full pl-14 pr-8 py-5 rounded-[2rem] bg-gray-50 border border-transparent focus:bg-white focus:border-gold outline-none transition-all font-bold text-[#0d1a14] shadow-inner"
                        />
                      </div>
                    </div>
                  </div>
                  <SettingToggle
                    label="Compact Interface"
                    sub="Optimize layout density for high-throughput administrative workflows."
                    icon={Layout}
                    section="branding"
                    stateKey="compactMode"
                  />
                  <div className="pt-10 border-t border-gray-50 space-y-6">
                    <div>
                      <h4 className="text-sm font-black text-[#0d1a14] uppercase tracking-widest">Seasonal theme</h4>
                      <p className="text-xs text-gray-500 mt-1">Maroon and gold stay. This only changes the Home greeting and a light effect.</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <label className="space-y-4 block">
                        <span className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Theme mode</span>
                        <select
                          value={settings.seasonal.mode}
                          onChange={(e) => setSettings((prev) => ({
                            ...prev,
                            seasonal: { ...prev.seasonal, mode: e.target.value },
                          }))}
                          className="w-full px-8 py-5 rounded-[2rem] bg-gray-50 border border-transparent focus:bg-white focus:border-gold outline-none font-bold text-[#0d1a14]"
                        >
                          <option value="automatic">Automatic</option>
                          <option value="off">Off — base brand only</option>
                          <option value="fall">Fall</option>
                          <option value="winter">Winter</option>
                          <option value="spring">Spring</option>
                          <option value="summer">Summer</option>
                          <option value="thanksgiving">Thanksgiving</option>
                          <option value="christmas">Christmas</option>
                          <option value="new_year">New Year</option>
                          <option value="easter">Easter</option>
                          <option value="anniversary">Church anniversary</option>
                        </select>
                      </label>
                      <label className="space-y-4 block">
                        <span className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Church anniversary</span>
                        <input
                          type="date"
                          value={
                            settings.seasonal.anniversaryMonth && settings.seasonal.anniversaryDay
                              ? `2000-${String(settings.seasonal.anniversaryMonth).padStart(2, '0')}-${String(settings.seasonal.anniversaryDay).padStart(2, '0')}`
                              : ''
                          }
                          onChange={(e) => {
                            const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(e.target.value);
                            setSettings((prev) => ({
                              ...prev,
                              seasonal: {
                                ...prev.seasonal,
                                anniversaryMonth: match ? Number(match[2]) : null,
                                anniversaryDay: match ? Number(match[3]) : null,
                              },
                            }));
                          }}
                          className="w-full px-8 py-5 rounded-[2rem] bg-gray-50 border border-transparent focus:bg-white focus:border-gold outline-none font-bold text-[#0d1a14]"
                        />
                      </label>
                    </div>
                    <SettingToggle
                      label="Seasonal effects"
                      sub="Leaves, snow, petals, or sparkles on the Home header. Members can still turn this off for themselves."
                      icon={Sparkles}
                      section="seasonal"
                      stateKey="effects"
                    />
                    <div className="rounded-[2rem] border border-gray-100 bg-gray-50/70 p-6 space-y-4">
                      <p className="text-sm font-black text-[#0d1a14]">Preview on this browser</p>
                      <p className="text-xs text-gray-500">Other members keep the saved theme. Save the form above when the church should change.</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <select
                          value={previewMode}
                          onChange={(e) => setPreviewMode(e.target.value)}
                          className="w-full px-6 py-4 rounded-2xl bg-white border border-gray-100 font-bold text-[#0d1a14]"
                        >
                          <option value="automatic">Automatic for the date</option>
                          <option value="off">Off</option>
                          <option value="fall">Fall</option>
                          <option value="winter">Winter</option>
                          <option value="spring">Spring</option>
                          <option value="summer">Summer</option>
                          <option value="thanksgiving">Thanksgiving</option>
                          <option value="christmas">Christmas</option>
                          <option value="new_year">New Year</option>
                          <option value="easter">Easter</option>
                          <option value="anniversary">Church anniversary</option>
                        </select>
                        <input
                          type="date"
                          value={previewDate}
                          onChange={(e) => setPreviewDate(e.target.value)}
                          className="w-full px-6 py-4 rounded-2xl bg-white border border-gray-100 font-bold text-[#0d1a14]"
                        />
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            writeSeasonPreview({ mode: previewMode as ThemeMode, date: previewDate || null });
                            setPreviewNote('Preview is on for this browser. Open Home to see it.');
                          }}
                          className="min-h-[44px] px-4 rounded-xl bg-burgundy text-gold text-[10px] font-black uppercase tracking-widest"
                        >
                          Preview
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            writeSeasonPreview(null);
                            setPreviewNote('Preview cleared. Home follows the saved church theme.');
                          }}
                          className="min-h-[44px] px-4 rounded-xl border border-gray-200 text-[10px] font-black uppercase tracking-widest text-gray-500"
                        >
                          Clear preview
                        </button>
                      </div>
                      {previewNote ? <p className="text-xs font-medium text-gray-500">{previewNote}</p> : null}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl border border-green-100">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-white rounded-lg shadow-sm">
                  <Globe size={20} className="text-green-600" />
                </div>
                <div>
                  <p className="font-bold text-[#0d1a14] text-sm">Primary Domain</p>
                  <p className="text-xs text-green-600 font-medium">plcc-opal.vercel.app • Active</p>
                </div>
              </div>
              <button className="text-xs font-bold text-gray-400 hover:text-burgundy">Manage DNS</button>
            </div>

            <div className="mt-auto p-10 bg-gray-50/30 border-t border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-gray-300 shadow-sm border border-gray-100">
                  <Activity size={18} />
                </div>
                <p className="text-[11px] text-gray-400 font-medium">Last modification detected: 2 hours ago</p>
              </div>
              <button className="flex items-center gap-2 text-[10px] font-black text-burgundy uppercase tracking-widest hover:underline">
                <RefreshCw size={12} />
                Revert Changes
              </button>
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-center justify-center gap-12 pt-4">
            <div className="flex items-center gap-4 group cursor-pointer">
              <div className="w-12 h-12 rounded-2xl bg-gold-cream text-gold flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform border border-gold/10">
                <Sparkles size={22} />
              </div>
              <div className="text-left">
                <h4 className="text-sm font-bold text-[#0d1a14]">System Advice</h4>
                <p className="text-xs text-gray-400 font-medium leading-relaxed">Ask <button className="text-burgundy font-bold hover:underline">PLCC AI</button> for security optimization tips.</p>
              </div>
            </div>
            <div className="flex items-center gap-4 group cursor-pointer">
              <div className="w-12 h-12 rounded-2xl bg-burgundy/5 text-burgundy flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform border border-burgundy/10">
                <LifeBuoy size={22} />
              </div>
              <div className="text-left">
                <h4 className="text-sm font-bold text-[#0d1a14]">Technical Support</h4>
                <p className="text-xs text-gray-400 font-medium leading-relaxed">Having DNS or SSL issues? <button className="text-burgundy font-bold hover:underline">Contact Tech Squad</button></p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemSettingsPage;
