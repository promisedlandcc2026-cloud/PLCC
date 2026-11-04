import React, { useEffect, useState } from 'react';
import {
  MessageSquare,
  Sparkles,
  ShieldCheck,
  ChevronRight,
  Zap,
  Activity,
  LifeBuoy,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { getAuthHeaders } from '../../lib/api';

type NotifCat = {
  email: boolean;
  push: boolean;
  freq: string;
};

type NotifState = {
  financial: NotifCat;
  membership: NotifCat;
  system: NotifCat;
  smartGroup: boolean;
  insightAccepted: boolean;
};

const defaults: NotifState = {
  financial: { email: true, push: true, freq: 'Immediate' },
  membership: { email: true, push: false, freq: 'Daily Summary' },
  system: { email: false, push: true, freq: 'Immediate' },
  smartGroup: true,
  insightAccepted: false,
};

const UserNotificationsPage: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [notifs, setNotifs] = useState<NotifState>(defaults);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/vault?resource=settings&scope=notifications', { headers });
        const data = await res.json();
        if (data.ok && data.settings) {
          setNotifs({ ...defaults, ...data.settings });
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const handleToggle = (cat: 'financial' | 'membership' | 'system', type: 'email' | 'push') => {
    setNotifs((prev) => ({
      ...prev,
      [cat]: {
        ...prev[cat],
        [type]: !prev[cat][type],
      },
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/vault?resource=settings&scope=notifications', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ settings: notifs }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Save failed');
      if (data.settings) setNotifs({ ...defaults, ...data.settings });
      setShowSuccess(true);
      setMessage(data.warning || null);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err: any) {
      setMessage(err?.message || 'Could not save preferences');
    } finally {
      setIsSaving(false);
    }
  };

  const NotifRow = ({
    label,
    sub,
    cat,
    icon: Icon,
  }: {
    label: string;
    sub: string;
    cat: 'financial' | 'membership' | 'system';
    icon: any;
  }) => (
    <div className="flex flex-col md:flex-row md:items-center justify-between p-8 rounded-[2.5rem] bg-white border border-gray-50 shadow-sm hover:shadow-xl transition-all group gap-8">
      <div className="flex items-center gap-6">
        <div className="w-14 h-14 rounded-2xl bg-gold-cream text-gold flex items-center justify-center shadow-inner group-hover:rotate-3 transition-transform border border-gold/10">
          <Icon size={28} />
        </div>
        <div>
          <p className="text-[17px] font-black text-[#0d1a14] tracking-tight">{label}</p>
          <p className="text-[13px] text-gray-400 font-medium mt-1 leading-relaxed max-w-sm">{sub}</p>
        </div>
      </div>

      <div className="flex items-center gap-10 bg-gray-50/50 p-4 rounded-3xl border border-gray-100">
        <div className="flex flex-col items-center gap-2">
          <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Email</p>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={notifs[cat].email}
              onChange={() => handleToggle(cat, 'email')}
            />
            <div className="w-12 h-6 bg-white peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-gray-100 after:border-gray-200 after:border after:rounded-full after:h-4 after:w-5 after:transition-all peer-checked:bg-burgundy border border-gray-100" />
          </label>
        </div>
        <div className="w-px h-10 bg-gray-200" />
        <div className="flex flex-col items-center gap-2">
          <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Push</p>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={notifs[cat].push}
              onChange={() => handleToggle(cat, 'push')}
            />
            <div className="w-12 h-6 bg-white peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-gray-100 after:border-gray-200 after:border after:rounded-full after:h-4 after:w-5 after:transition-all peer-checked:bg-burgundy border border-gray-100" />
          </label>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`space-y-12 animate-in fade-in duration-700 ${isLoading ? 'opacity-70' : ''}`}>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-b border-gray-100 pb-10">
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="h-1 w-12 bg-burgundy rounded-full" />
            <h2 className="text-[11px] font-black text-burgundy/40 uppercase tracking-[0.5em]">
              Alert Strategies
            </h2>
          </div>
          <h1 className="text-6xl font-black text-[#0d1a14] tracking-tighter leading-none">
            Notifications<span className="text-gold">.</span>
          </h1>
          <p className="text-gray-400 font-medium text-lg mt-4 max-w-xl leading-relaxed">
            Choose which alerts you want by email and push.
          </p>
        </div>
        <div className="flex flex-col items-stretch sm:items-end gap-3">
          {(showSuccess || message) && (
            <div className="flex items-center gap-2 text-green-600 font-black text-sm uppercase tracking-widest">
              <CheckCircle2 size={18} />
              {message || 'Alerts Updated'}
            </div>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className="min-w-[220px] px-10 py-5 bg-burgundy text-gold font-black text-xs uppercase tracking-widest rounded-2xl shadow-2xl shadow-burgundy/20 hover:bg-burgundy-dark transition-all active:scale-95 border-b-4 border-gold/30 flex items-center justify-center gap-3 disabled:opacity-70"
          >
            {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Activity size={18} />}
            {isSaving ? 'Saving…' : 'Save Preferences'}
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-12">
        <div className="flex-1 space-y-6">
          <NotifRow
            label="Financial Signals"
            sub="Alerts for large contributions, pledge milestones, and failed donor transactions."
            cat="financial"
            icon={Zap}
          />
          <NotifRow
            label="Membership Events"
            sub="Notified when new visitors register, baptism requests are filed, or households merge."
            cat="membership"
            icon={MessageSquare}
          />
          <NotifRow
            label="System Audit Log"
            sub="Critical alerts for security changes and permission updates."
            cat="system"
            icon={ShieldCheck}
          />

          <div className="bg-gold-cream/30 p-10 rounded-[3rem] border border-gold/10 flex flex-col md:flex-row items-center justify-between gap-10 group mt-10">
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 rounded-[1.5rem] bg-white text-gold flex items-center justify-center shadow-lg border border-gold/10">
                <Sparkles size={32} />
              </div>
              <div>
                <h4 className="text-xl font-black text-[#0d1a14] tracking-tight">AI Smart Grouping</h4>
                <p className="text-sm text-gray-400 font-medium leading-relaxed max-w-sm mt-1">
                  Group similar alerts into one summary to reduce noise.
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={notifs.smartGroup}
                onChange={() => setNotifs((prev) => ({ ...prev, smartGroup: !prev.smartGroup }))}
              />
              <div className="w-16 h-8 bg-gray-100 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-gray-200 after:border after:rounded-full after:h-6 after:w-7 after:transition-all peer-checked:bg-burgundy border border-gray-100 shadow-inner" />
            </label>
          </div>
        </div>

        <div className="w-full lg:w-80 shrink-0 space-y-6">
          <div className="bg-white rounded-[3rem] border border-gray-100 p-8 shadow-sm h-full flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <p className="text-[10px] font-black text-gold uppercase tracking-[0.3em]">
                Suggestion
              </p>
              <Activity size={16} className="text-burgundy" />
            </div>

            <div className="flex-1 space-y-8">
              <div className="bg-gold-cream/40 p-6 rounded-[2rem] rounded-tl-none border border-gold/10">
                <p className="text-[13px] text-[#0d1a14] font-bold leading-relaxed">
                  {notifs.insightAccepted
                    ? 'Sunday 8 PM financial summary is saved in your preferences.'
                    : 'Would you like a Sunday evening financial summary email before Monday reports?'}
                </p>
              </div>

              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() =>
                    setNotifs((prev) => ({
                      ...prev,
                      insightAccepted: true,
                      financial: { ...prev.financial, email: true, freq: 'Weekly Summary' },
                    }))
                  }
                  className="w-full py-4 px-6 bg-white border border-gray-100 rounded-2xl text-[11px] font-black text-burgundy uppercase tracking-widest hover:border-gold/30 hover:shadow-md transition-all active:scale-95 text-center"
                >
                  {notifs.insightAccepted ? 'Accepted' : 'Accept Schedule'}
                </button>
                <button
                  type="button"
                  onClick={() => setNotifs((prev) => ({ ...prev, insightAccepted: false }))}
                  className="w-full py-4 px-6 bg-gray-50 text-gray-400 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-gray-100 transition-all text-center"
                >
                  Ignore Suggestion
                </button>
              </div>
            </div>

            <div className="mt-12 pt-8 border-t border-gray-50">
              <Link
                to="/community/chat"
                className="flex items-center gap-3 text-burgundy font-black text-xs uppercase tracking-widest hover:underline"
              >
                <LifeBuoy size={16} />
                Get help in Chat
                <ChevronRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserNotificationsPage;
