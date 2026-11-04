import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Shield,
  Bell,
  Smartphone,
  Printer,
  Lock,
  Sparkles,
  LifeBuoy,
  ScanLine,
  ArrowRight,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { getAuthHeaders } from '../../lib/api';

type EventSettingsState = {
  automaticCheckIn: boolean;
  labelPrinting: boolean;
  smsReminders: boolean;
  secureMode: boolean;
};

const defaultSettings: EventSettingsState = {
  automaticCheckIn: true,
  labelPrinting: false,
  smsReminders: true,
  secureMode: false,
};

const Toggle = ({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) => (
  <label className="relative inline-flex items-center cursor-pointer">
    <input type="checkbox" className="sr-only peer" checked={checked} onChange={onChange} />
    <div className="w-14 h-7 bg-gray-100 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-6 after:transition-all peer-checked:bg-burgundy border border-gray-100 shadow-inner" />
  </label>
);

const EventsSettings: React.FC = () => {
  const [settings, setSettings] = useState<EventSettingsState>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/vault?resource=settings&scope=events', { headers });
        const data = await res.json();
        if (data.ok && data.settings) {
          setSettings({ ...defaultSettings, ...data.settings });
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const toggle = (key: keyof EventSettingsState) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/vault?resource=settings&scope=events', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ settings }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Save failed');
      if (data.settings) setSettings({ ...defaultSettings, ...data.settings });
      setMessage(data.warning || 'Event settings saved');
      setTimeout(() => setMessage(null), 3500);
    } catch (err: any) {
      setMessage(err?.message || 'Could not save settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-extrabold text-[#0d1a14] mb-2 tracking-tight">Event Settings</h1>
          <p className="text-gray-400 font-medium">
            Configure check-in stations, reminders, and kiosk access for church gatherings.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {message && (
            <span className="text-sm font-bold text-green-700 flex items-center gap-1.5">
              <CheckCircle2 size={16} />
              {message}
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className="inline-flex items-center gap-2 px-8 py-3 rounded-2xl bg-burgundy text-gold font-bold text-sm shadow-xl shadow-burgundy/20 hover:bg-burgundy-dark transition-all active:scale-95 border-b-4 border-gold/30 disabled:opacity-60"
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : null}
            {isSaving ? 'Saving…' : 'Save All Changes'}
          </button>
        </div>
      </div>

      <Link
        to="/events/kids-kiosk"
        className="block max-w-5xl bg-burgundy rounded-[2rem] p-6 md:p-8 text-white shadow-xl shadow-burgundy/20 hover:opacity-95 transition-opacity"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-gold/20 text-gold flex items-center justify-center shrink-0">
              <ScanLine size={24} />
            </div>
            <div>
              <p className="text-gold text-[10px] font-bold uppercase tracking-widest mb-1">
                Youth &amp; kids ministry
              </p>
              <h3 className="text-xl font-black tracking-tight">Open Kids Kiosk scanner</h3>
              <p className="text-white/70 text-sm mt-1 leading-relaxed max-w-xl">
                Tablet station for youth leaders: scan a parent QR or type their 4-digit code to check
                children in and out.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-2 self-start sm:self-center px-5 py-3 rounded-xl bg-gold text-burgundy font-bold text-sm shrink-0">
            Open kiosk
            <ArrowRight size={16} />
          </span>
        </div>
      </Link>

      <div className={`grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl ${isLoading ? 'opacity-60' : ''}`}>
        <div className="bg-white rounded-[3rem] border border-gray-50 shadow-sm overflow-hidden flex flex-col">
          <div className="p-10 border-b border-gray-50 flex items-center gap-4 bg-gold-cream/10">
            <div className="w-12 h-12 rounded-xl bg-burgundy/5 text-burgundy flex items-center justify-center shadow-inner">
              <Shield size={22} />
            </div>
            <h3 className="text-xl font-black text-[#0d1a14] tracking-tight">Check-In Rules</h3>
          </div>
          <div className="p-10 space-y-10">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-gray-50 text-gray-300 flex items-center justify-center shrink-0">
                  <Smartphone size={18} />
                </div>
                <div>
                  <p className="text-[15px] font-black text-[#0d1a14]">Automatic Check-in</p>
                  <p className="text-xs text-gray-400 font-medium mt-0.5">
                    Enable one-tap check-in for registered members.
                  </p>
                </div>
              </div>
              <Toggle checked={settings.automaticCheckIn} onChange={() => toggle('automaticCheckIn')} />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-gray-50 text-gray-300 flex items-center justify-center shrink-0">
                  <Printer size={18} />
                </div>
                <div>
                  <p className="text-[15px] font-black text-[#0d1a14]">Label Printing</p>
                  <p className="text-xs text-gray-400 font-medium mt-0.5">
                    Print name tags automatically on check-in.
                  </p>
                </div>
              </div>
              <Toggle checked={settings.labelPrinting} onChange={() => toggle('labelPrinting')} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[3rem] border border-gray-50 shadow-sm overflow-hidden flex flex-col">
          <div className="p-10 border-b border-gray-50 flex items-center gap-4 bg-gold-cream/10">
            <div className="w-12 h-12 rounded-xl bg-gold/10 text-gold flex items-center justify-center shadow-inner">
              <Bell size={22} />
            </div>
            <h3 className="text-xl font-black text-[#0d1a14] tracking-tight">Notifications</h3>
          </div>
          <div className="p-10 space-y-10">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-gray-50 text-gray-300 flex items-center justify-center shrink-0">
                  <Bell size={18} />
                </div>
                <div>
                  <p className="text-[15px] font-black text-[#0d1a14]">SMS Reminders</p>
                  <p className="text-xs text-gray-400 font-medium mt-0.5">
                    Send SMS 2 hours before event start.
                  </p>
                </div>
              </div>
              <Toggle checked={settings.smsReminders} onChange={() => toggle('smsReminders')} />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-gray-50 text-gray-300 flex items-center justify-center shrink-0">
                  <Lock size={18} />
                </div>
                <div>
                  <p className="text-[15px] font-black text-[#0d1a14]">Secure Mode</p>
                  <p className="text-xs text-gray-400 font-medium mt-0.5">
                    Require sign-in for all check-in and kiosk access.
                  </p>
                </div>
              </div>
              <Toggle checked={settings.secureMode} onChange={() => toggle('secureMode')} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl">
        <div className="bg-gold-cream/30 p-8 rounded-[2rem] border border-gold/10 flex items-center gap-6 shadow-sm">
          <Sparkles size={24} className="text-gold shrink-0" />
          <div className="flex-1">
            <p className="text-[14px] font-bold text-[#0d1a14]">Tip</p>
            <p className="text-xs text-gray-400 font-medium leading-relaxed mt-1">
              Keep SMS Reminders on for Sunday services, and use Kids Kiosk on a dedicated tablet.
            </p>
          </div>
        </div>
        <div className="bg-white p-8 rounded-[2rem] border border-gray-100 flex items-center gap-6 shadow-sm">
          <LifeBuoy size={24} className="text-burgundy shrink-0" />
          <div className="flex-1">
            <p className="text-[14px] font-bold text-[#0d1a14]">Need help?</p>
            <p className="text-xs text-gray-400 font-medium leading-relaxed mt-1">
              Ask in Chat, or open{' '}
              <Link to="/events/kids-kiosk" className="text-burgundy font-bold hover:underline">
                Kids Kiosk
              </Link>{' '}
              to practice scanning.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EventsSettings;
