import React, { useEffect, useMemo, useState } from 'react';
import {
  RefreshCw,
  CheckCircle2,
  Loader2,
  LifeBuoy,
  Link2Off,
  Link2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { getAuthHeaders } from '../../lib/api';

type Status = 'Connected' | 'Pending' | 'Disconnected';

type IntegrationDef = {
  id: string;
  name: string;
  provider: string;
  description: string;
  icon: React.ReactNode;
};

const CATALOG: IntegrationDef[] = [
  {
    id: 'stripe',
    name: 'Stripe Payments',
    provider: 'Financial Gateway',
    description: 'Digital tithes and event registration payments.',
    icon: <div className="w-full h-full bg-[#635BFF] flex items-center justify-center text-white font-black italic">S</div>,
  },
  {
    id: 'quickbooks',
    name: 'QuickBooks Online',
    provider: 'Accounting',
    description: 'Sync donation records for tax-ready reconciliation.',
    icon: <div className="w-full h-full bg-[#2CA01C] flex items-center justify-center text-white font-black italic">qb</div>,
  },
  {
    id: 'pco',
    name: 'Planning Center',
    provider: 'ChMS Connection',
    description: 'Link member giving history with congregant profiles.',
    icon: <div className="w-full h-full bg-[#34A853] flex items-center justify-center text-white font-black italic">PC</div>,
  },
  {
    id: 'mailchimp',
    name: 'Mailchimp',
    provider: 'Communication',
    description: 'Segment donors for stewardship emails.',
    icon: <div className="w-full h-full bg-[#FFE01B] flex items-center justify-center text-black font-black italic">M</div>,
  },
  {
    id: 'propresenter',
    name: 'ProPresenter',
    provider: 'Presentation',
    description: 'Display lyrics, scripture, and media on screens.',
    icon: <div className="w-full h-full bg-[#2C2F33] flex items-center justify-center text-white font-black">PP</div>,
  },
  {
    id: 'twilio',
    name: 'Twilio',
    provider: 'SMS Gateway',
    description: 'SMS for alerts, volunteer scheduling, and receipts.',
    icon: <div className="w-full h-full bg-[#F22F46] flex items-center justify-center text-white font-black">Tw</div>,
  },
];

type StoredMap = Record<string, { status: Status; lastSync?: string; notes?: string }>;

const GivingIntegrationsPage: React.FC = () => {
  const [stored, setStored] = useState<StoredMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [rhema, setRhema] = useState<{
    connected: boolean;
    apiKeyLastFour: string | null;
    tokenLastFour: string | null;
    hasToken: boolean;
  } | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [freshToken, setFreshToken] = useState('');
  const [rhemaBusy, setRhemaBusy] = useState<string | null>(null);

  const loadRhema = async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/vault?resource=rhemanotes', { headers });
      const data = await res.json();
      if (data.ok) setRhema(data.rhemanotes);
    } catch (err) {
      console.error(err);
    }
  };

  const load = async () => {
    setIsLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/vault?resource=settings&scope=integrations', { headers });
      const data = await res.json();
      if (data.ok) setStored(data.settings || {});
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadRhema();
  }, []);

  const persist = async (next: StoredMap, id?: string) => {
    setIsSaving(id || 'all');
    setMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/vault?resource=settings&scope=integrations', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ settings: next }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Save failed');
      setStored(data.settings || next);
      setMessage(data.warning || 'Integration settings saved');
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage(err?.message || 'Could not save');
    } finally {
      setIsSaving(null);
    }
  };

  const setStatus = async (id: string, status: Status) => {
    const next = {
      ...stored,
      [id]: {
        ...(stored[id] || {}),
        status,
        lastSync: status === 'Connected' ? new Date().toISOString() : stored[id]?.lastSync,
      },
    };
    await persist(next, id);
  };

  const handleSync = async (id: string) => {
    const current = stored[id]?.status || 'Disconnected';
    if (current !== 'Connected') {
      setMessage('Connect this integration before syncing.');
      setTimeout(() => setMessage(null), 2500);
      return;
    }
    const next = {
      ...stored,
      [id]: { ...(stored[id] || { status: 'Connected' as Status }), lastSync: new Date().toISOString() },
    };
    await persist(next, id);
  };

  const rows = useMemo(
    () =>
      CATALOG.map((item) => {
        const meta = stored[item.id];
        return {
          ...item,
          status: (meta?.status || 'Disconnected') as Status,
          lastSync: meta?.lastSync
            ? new Date(meta.lastSync).toLocaleString()
            : 'Never',
        };
      }),
    [stored]
  );

  return (
    <div className={`space-y-10 animate-in fade-in duration-700 ${isLoading ? 'opacity-70' : ''}`}>
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-1 w-12 bg-burgundy rounded-full" />
            <h2 className="text-[11px] font-black text-burgundy/40 uppercase tracking-[0.5em]">Ecosystem</h2>
          </div>
          <h1 className="text-5xl md:text-6xl font-black text-[#0d1a14] tracking-tighter leading-none">
            Integrations<span className="text-gold">.</span>
          </h1>
          <p className="text-gray-400 font-medium text-base mt-4 max-w-xl leading-relaxed">
            Mark which tools your church uses. Live API keys for Stripe/PCO can be added later —
            status here is saved for your team.
          </p>
        </div>
        {message && (
          <div className="flex items-center gap-2 text-green-700 font-bold text-sm">
            <CheckCircle2 size={16} />
            {message}
          </div>
        )}
      </div>

      <section className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 md:p-8 space-y-4">
        <h2 className="text-xl font-black text-[#0d1a14] tracking-tight">RhemaNotes</h2>
        <p className="text-sm text-gray-400 font-medium leading-relaxed max-w-2xl">
          Paste a key from RhemaNotes Settings → API keys. Sermon Manager can then open a study
          session. Generate an integration token and paste it, with this Canaan URL, into RhemaNotes
          Church CMS to sync members.
        </p>
        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">
          RhemaNotes API key
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="off"
          placeholder={rhema?.apiKeyLastFour ? `Saved ····${rhema.apiKeyLastFour}` : 'rn_live_…'}
          className="w-full min-h-11 px-4 rounded-2xl border border-gray-100 text-sm font-bold text-[#0d1a14]"
        />
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            disabled={rhemaBusy !== null}
            onClick={async () => {
              setRhemaBusy('key');
              setMessage(null);
              try {
                const headers = await getAuthHeaders();
                const res = await fetch('/api/vault?resource=rhemanotes&action=save_key', {
                  method: 'POST',
                  headers: { ...headers, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ apiKey }),
                });
                const data = await res.json();
                if (!res.ok || !data.ok) throw new Error(data.error || 'Save failed');
                setRhema(data.rhemanotes);
                setApiKey('');
                setMessage('RhemaNotes key saved');
              } catch (err: any) {
                setMessage(err?.message || 'Could not save key');
              } finally {
                setRhemaBusy(null);
              }
            }}
            className="min-h-11 px-5 rounded-xl bg-burgundy text-gold text-[10px] font-black uppercase tracking-widest disabled:opacity-60"
          >
            {rhemaBusy === 'key' ? 'Saving…' : 'Save key'}
          </button>
          <button
            type="button"
            disabled={rhemaBusy !== null}
            onClick={async () => {
              setRhemaBusy('token');
              setMessage(null);
              try {
                const headers = await getAuthHeaders();
                const res = await fetch('/api/vault?resource=rhemanotes&action=generate_token', {
                  method: 'POST',
                  headers: { ...headers, 'Content-Type': 'application/json' },
                  body: JSON.stringify({}),
                });
                const data = await res.json();
                if (!res.ok || !data.ok) throw new Error(data.error || 'Could not generate token');
                setFreshToken(data.token || '');
                setRhema(data.rhemanotes);
                setMessage('Integration token created — copy it now');
              } catch (err: any) {
                setMessage(err?.message || 'Could not generate token');
              } finally {
                setRhemaBusy(null);
              }
            }}
            className="min-h-11 px-5 rounded-xl border border-gold/40 text-burgundy text-[10px] font-black uppercase tracking-widest disabled:opacity-60"
          >
            {rhemaBusy === 'token' ? 'Working…' : 'Generate member token'}
          </button>
        </div>
        {rhema?.hasToken && !freshToken ? (
          <p className="text-xs text-gray-400">
            Member token saved{rhema.tokenLastFour ? ` ····${rhema.tokenLastFour}` : ''}. Generate a
            new one to copy it again.
          </p>
        ) : null}
        {freshToken ? (
          <div className="rounded-2xl border border-gold/30 bg-[#F9F9F7] p-4 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-gold">Copy once</p>
            <code className="block break-all text-sm font-bold text-[#0d1a14]">{freshToken}</code>
            <button
              type="button"
              className="min-h-11 px-4 rounded-xl border border-gray-200 text-[10px] font-black uppercase tracking-widest"
              onClick={() => {
                void navigator.clipboard.writeText(freshToken);
                setMessage('Token copied');
              }}
            >
              Copy token
            </button>
          </div>
        ) : null}
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {rows.map((int) => (
          <div
            key={int.id}
            className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 md:p-8 flex flex-col"
          >
            <div className="flex items-start justify-between mb-6 gap-3">
              <div className="w-14 h-14 rounded-2xl overflow-hidden shadow border-4 border-white shrink-0">
                {int.icon}
              </div>
              <span
                className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                  int.status === 'Connected'
                    ? 'bg-green-50 text-green-600 border-green-100'
                    : int.status === 'Pending'
                      ? 'bg-gold-cream text-gold border-gold/20'
                      : 'bg-gray-50 text-gray-400 border-gray-100'
                }`}
              >
                {int.status}
              </span>
            </div>

            <h3 className="text-xl font-black text-[#0d1a14] tracking-tight">{int.name}</h3>
            <p className="text-[10px] font-bold text-gold uppercase tracking-[0.2em] mt-1 mb-3">
              {int.provider}
            </p>
            <p className="text-sm text-gray-400 font-medium leading-relaxed flex-1 mb-6">
              {int.description}
            </p>

            <div className="pt-5 border-t border-gray-50 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[11px] font-bold text-gray-300 uppercase flex items-center gap-2">
                <RefreshCw
                  size={12}
                  className={isSaving === int.id ? 'animate-spin text-gold' : ''}
                />
                Last sync: {int.lastSync}
              </p>
              <div className="flex flex-wrap gap-2">
                {int.status !== 'Connected' ? (
                  <button
                    type="button"
                    disabled={!!isSaving}
                    onClick={() => setStatus(int.id, 'Connected')}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-burgundy text-gold text-xs font-bold min-h-[40px]"
                  >
                    {isSaving === int.id ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                    Connect
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={!!isSaving}
                      onClick={() => handleSync(int.id)}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gray-50 text-burgundy text-xs font-bold min-h-[40px]"
                    >
                      {isSaving === int.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <RefreshCw size={14} />
                      )}
                      Sync
                    </button>
                    <button
                      type="button"
                      disabled={!!isSaving}
                      onClick={() => setStatus(int.id, 'Disconnected')}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gray-50 text-gray-500 text-xs font-bold min-h-[40px]"
                    >
                      <Link2Off size={14} />
                      Disconnect
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-gold-cream/30 rounded-3xl border border-gold/10 p-6 flex items-start gap-4 max-w-3xl">
        <LifeBuoy size={22} className="text-burgundy shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-[#0d1a14] text-sm">Need a live connection?</p>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            Connect / Disconnect here keeps a church record of what you use. For API keys and live
            sync, ask an admin in{' '}
            <Link to="/community/chat" className="text-burgundy font-bold hover:underline">
              Chat
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
};

export default GivingIntegrationsPage;
