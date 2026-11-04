import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  Plus, 
  X, 
  AlertTriangle, 
  Info, 
  AlertCircle, 
  Trash2, 
  Sparkles, 
  Send,
  Megaphone,
  CheckCircle2,
  Clock,
  Layout
} from 'lucide-react';

interface EventAlert {
  id: string;
  createdAt: number;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
}

const EventsAlerts: React.FC = () => {
  const [alerts, setAlerts] = useState<EventAlert[]>([]);
  const [showModal, setShowModal] = useState(false);
  
  // New Alert State
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState<EventAlert['severity']>('info');

  useEffect(() => {
    const saved = localStorage.getItem('events_alerts');
    if (saved) {
      try {
        setAlerts(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse alerts", e);
      }
    }

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowModal(false);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const saveAlerts = (newAlerts: EventAlert[]) => {
    setAlerts(newAlerts);
    localStorage.setItem('events_alerts', JSON.stringify(newAlerts));
  };

  const handleCreateAlert = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;

    const newAlert: EventAlert = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      title: title.trim(),
      message: message.trim(),
      severity
    };

    saveAlerts([newAlert, ...alerts]);
    setShowModal(false);
    resetForm();
  };

  const resetForm = () => {
    setTitle('');
    setMessage('');
    setSeverity('info');
  };

  const deleteAlert = (id: string) => {
    saveAlerts(alerts.filter(a => a.id !== id));
  };

  const clearAllAlerts = () => {
    if (window.confirm("Are you sure you want to archive all active alerts? This cannot be undone.")) {
      saveAlerts([]);
    }
  };

  const getSeverityIcon = (s: EventAlert['severity']) => {
    switch (s) {
      case 'error': return <AlertCircle size={24} />;
      case 'warning': return <AlertTriangle size={24} />;
      default: return <Info size={24} />;
    }
  };

  const getSeverityStyles = (s: EventAlert['severity']) => {
    switch (s) {
      case 'error': return 'bg-red-50 border-red-100 text-red-500';
      case 'warning': return 'bg-orange-50 border-orange-100 text-orange-500';
      default: return 'bg-gold-cream/30 border-gold/10 text-gold';
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-extrabold text-[#0d1a14] mb-2 tracking-tight">Event Alerts</h1>
          <p className="text-gray-400 font-medium">Broadcast critical updates and system messages across all check-in stations.</p>
        </div>
        <div className="flex items-center gap-3">
          {alerts.length > 0 && (
            <button 
              onClick={clearAllAlerts}
              className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-white border border-gray-100 text-gray-400 font-bold text-xs uppercase tracking-widest hover:text-red-500 hover:bg-red-50 transition-all"
            >
              <Trash2 size={16} />
              Archive All
            </button>
          )}
          <button 
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-burgundy text-gold font-bold text-sm shadow-xl shadow-burgundy/20 hover:bg-burgundy-dark transition-all active:scale-95 border-b-4 border-gold/40"
          >
            <Megaphone size={18} />
            Dispatch Alert
          </button>
        </div>
      </div>

      {/* Alerts Ledger */}
      <div className="grid grid-cols-1 gap-4 max-w-4xl">
        {alerts.length > 0 ? (
          alerts.map(alert => (
            <div 
              key={alert.id} 
              className={`p-6 rounded-[2rem] border-2 flex items-start space-x-6 shadow-sm transition-all group animate-in slide-in-from-right-4 ${
                alert.severity === 'error' ? 'bg-red-50 border-red-100' :
                alert.severity === 'warning' ? 'bg-orange-50 border-orange-100' :
                'bg-gold-cream/30 border-gold/10'
              }`}
            >
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
                alert.severity === 'error' ? 'text-red-500 bg-red-100' :
                alert.severity === 'warning' ? 'text-orange-500 bg-orange-100' :
                'text-gold bg-white border border-gold/10'
              }`}>
                {getSeverityIcon(alert.severity)}
              </div>
              <div className="flex-1 min-w-0 pt-1">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-black text-[#0d1a14] tracking-tight">{alert.title}</h3>
                  <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest bg-white/50 px-3 py-1 rounded-full border border-gray-50 group-hover:bg-white transition-colors">
                    <div className="flex items-center gap-1.5">
                      <Clock size={10} />
                      {new Date(alert.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </span>
                </div>
                <p className="text-[15px] text-gray-600 leading-relaxed font-medium opacity-80 whitespace-pre-wrap">{alert.message}</p>
              </div>
              <button 
                onClick={() => deleteAlert(alert.id)} 
                className="opacity-0 group-hover:opacity-100 p-2.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all self-start"
                title="Archive Alert"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))
        ) : (
          <div className="bg-white p-24 text-center rounded-[3rem] border border-dashed border-gray-100 flex flex-col items-center animate-in fade-in zoom-in-95 duration-700">
            <div className="w-24 h-24 bg-[#fafaf8] rounded-full flex items-center justify-center mb-8 shadow-inner">
               <Bell size={48} className="text-gray-200" strokeWidth={1.5} />
            </div>
            <h4 className="text-2xl font-black text-[#0d1a14] mb-2 tracking-tight">Clear Broadcasts</h4>
            <p className="text-gray-400 font-medium max-w-xs mx-auto leading-relaxed">No active alerts are currently being broadcast. Click "Dispatch Alert" to communicate with the team.</p>
          </div>
        )}
      </div>

      {/* AI Strategy Block */}
      <div className="max-w-4xl p-8 bg-gold-cream/40 rounded-[2.5rem] border border-gold/10 flex items-center gap-6 shadow-sm">
         <Sparkles size={24} className="text-gold shrink-0" />
         <div className="flex-1">
            <p className="text-[14px] font-bold text-[#0d1a14]">AI Communication Strategy</p>
            <p className="text-xs text-gray-400 font-medium leading-relaxed mt-1">
              Data shows that "Warning" level alerts dispatched 15 minutes before peak check-in times reduce lobby congestion by up to 22%.
            </p>
         </div>
      </div>

      {/* DISPATCH MODAL */}
      {showModal && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-burgundy/60 backdrop-blur-md animate-in fade-in duration-300"
          onClick={() => setShowModal(false)}
        >
          <div 
            className="bg-white rounded-[3rem] w-full max-w-3xl shadow-[0_20px_80px_rgba(0,0,0,0.3)] overflow-hidden animate-in zoom-in-95 duration-400 border border-gold/30"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-10 py-8 border-b border-gray-50 flex items-center justify-between bg-gold-cream/10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-burgundy rounded-xl flex items-center justify-center text-gold shadow-lg shadow-burgundy/20">
                  <Megaphone size={24} />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-[#101814] tracking-tight">Dispatch Message</h3>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Live Broadcast Protocol</p>
                </div>
              </div>
              <button 
                onClick={() => setShowModal(false)} 
                className="p-3 text-gray-300 hover:text-burgundy hover:bg-white rounded-2xl transition-all shadow-sm active:scale-90"
              >
                <X size={24} />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 h-full">
              {/* Form Side */}
              <form onSubmit={handleCreateAlert} className="lg:col-span-3 p-10 space-y-8 border-r border-gray-50">
                <div className="space-y-3">
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] ml-2">Headline</label>
                  <input 
                    type="text" 
                    required 
                    autoFocus
                    placeholder="e.g. Service Delay: Tech Issue"
                    value={title} 
                    onChange={e => setTitle(e.target.value)} 
                    className="w-full px-6 py-4 rounded-[1.5rem] bg-gray-50 border border-transparent focus:bg-white focus:border-gold outline-none transition-all font-bold text-lg text-burgundy shadow-inner" 
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] ml-2">Severity Level</label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['info', 'warning', 'error'] as const).map((s) => (
                      <button 
                        key={s}
                        type="button"
                        onClick={() => setSeverity(s)}
                        className={`flex flex-col items-center gap-2 py-4 rounded-2xl border-2 transition-all active:scale-95 ${
                          severity === s 
                            ? (s === 'error' ? 'bg-red-50 border-red-500 text-red-500 shadow-lg shadow-red-100' : 
                               s === 'warning' ? 'bg-orange-50 border-orange-500 text-orange-500 shadow-lg shadow-orange-100' : 
                               'bg-burgundy border-gold text-gold shadow-lg shadow-burgundy/20')
                            : 'bg-white border-gray-100 text-gray-300 hover:border-gray-200'
                        }`}
                      >
                        {s === 'error' ? <AlertCircle size={20} /> : s === 'warning' ? <AlertTriangle size={20} /> : <Info size={20} />}
                        <span className="text-[9px] font-black uppercase tracking-widest">{s}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] ml-2">Broadcast Detail</label>
                  <textarea 
                    rows={4} 
                    required 
                    placeholder="Provide context for staff and volunteers..."
                    value={message} 
                    onChange={e => setMessage(e.target.value)} 
                    className="w-full px-8 py-5 rounded-[1.5rem] bg-gray-50 border border-transparent focus:bg-white focus:border-gold outline-none transition-all resize-none font-medium text-[#4a4a4a] shadow-inner" 
                  />
                </div>

                <div className="flex space-x-5 pt-4">
                  <button 
                    type="button" 
                    onClick={() => setShowModal(false)} 
                    className="flex-1 py-5 text-gray-400 font-extrabold uppercase text-xs tracking-widest hover:text-burgundy hover:bg-gray-50 rounded-2xl transition-all"
                  >
                    Discard
                  </button>
                  <button 
                    type="submit" 
                    className="flex-1 py-5 bg-burgundy text-gold rounded-[1.5rem] font-black uppercase text-xs shadow-2xl shadow-burgundy/40 hover:bg-burgundy-dark transition-all active:scale-95 border-b-4 border-gold/40 tracking-widest flex items-center justify-center gap-3"
                  >
                    Broadcast
                    <Send size={16} fill="currentColor" />
                  </button>
                </div>
              </form>

              {/* Preview Side */}
              <div className="lg:col-span-2 bg-[#fdfdfc] p-10 flex flex-col items-center">
                 <p className="text-[10px] font-black text-gray-300 uppercase tracking-[0.3em] mb-12 flex items-center gap-2">
                   <Layout size={12} />
                   Live Preview
                 </p>
                 
                 <div className="w-full space-y-6">
                    {/* Simulated Component Rendering */}
                    <div className={`p-6 rounded-[2rem] border-2 shadow-xl flex flex-col gap-4 animate-pulse-slow ${getSeverityStyles(severity)}`}>
                       <div className="flex items-center justify-between">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-white shadow-sm border border-black/5`}>
                             {getSeverityIcon(severity)}
                          </div>
                          <div className="text-[9px] font-black uppercase opacity-40">Just Now</div>
                       </div>
                       <div>
                          <h5 className="font-black text-sm uppercase tracking-tight text-[#0d1a14]">{title || "Your Headline Here"}</h5>
                          <p className="text-[11px] font-medium leading-relaxed mt-1 opacity-70 italic line-clamp-4">
                            {message || "The broadcast details will appear here as you type..."}
                          </p>
                       </div>
                    </div>

                    <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm space-y-4">
                       <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Visibility Index</p>
                       <div className="flex items-center gap-3">
                          <div className="flex -space-x-2">
                             {[1,2,3].map(i => (
                                <div key={i} className="w-6 h-6 rounded-full border-2 border-white bg-gray-100" />
                             ))}
                          </div>
                          <p className="text-[10px] font-bold text-gray-400">All stations active</p>
                       </div>
                    </div>
                 </div>

                 <div className="mt-auto pt-8 flex items-center gap-2 opacity-30">
                    <CheckCircle2 size={14} />
                    <span className="text-[9px] font-black uppercase tracking-[0.2em]">Verified Protocol</span>
                 </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(29, 55, 44, 0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(29, 55, 44, 0.1); }
        @keyframes pulse-slow {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.95; transform: scale(0.99); }
        }
        .animate-pulse-slow {
          animation: pulse-slow 4s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default EventsAlerts;