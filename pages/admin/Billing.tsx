
import React, { useState } from 'react';
import { 
  CreditCard, 
  Download, 
  Zap, 
  ShieldCheck, 
  ArrowUpRight, 
  Sparkles, 
  LifeBuoy, 
  ChevronRight, 
  Clock, 
  CheckCircle2, 
  Users, 
  Database,
  TrendingUp,
  Plus,
  MessageSquare,
  Lock,
  ArrowRight
} from 'lucide-react';

const BillingPage: React.FC = () => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly');

  const usageStats = [
    { label: 'Member Capacity', current: 2410, limit: 5000, icon: <Users size={18} />, color: 'bg-burgundy' },
    { label: 'Digital Storage', current: 42, limit: 100, icon: <Database size={18} />, color: 'bg-gold' },
    { label: 'Transaction Volume', current: 142500, limit: 500000, icon: <TrendingUp size={18} />, color: 'bg-[#1a2e35]' },
  ];

  const invoices = [
    { id: 'INV-2024-10', date: 'Oct 01, 2024', amount: 249.00, status: 'Paid', method: 'Visa •••• 4242' },
    { id: 'INV-2024-09', date: 'Sep 01, 2024', amount: 249.00, status: 'Paid', method: 'Visa •••• 4242' },
    { id: 'INV-2024-08', date: 'Aug 01, 2024', amount: 249.00, status: 'Paid', method: 'Visa •••• 4242' },
  ];

  return (
    <div className="max-w-[1400px] mx-auto space-y-12 animate-in fade-in duration-700 pb-20 pt-4">
      {/* Premium Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-10">
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="h-1 w-12 bg-burgundy rounded-full" />
            <h2 className="text-[11px] font-black text-burgundy/40 uppercase tracking-[0.5em]">Financial Hub</h2>
          </div>
          <h1 className="text-6xl font-black text-[#0d1a14] tracking-tighter leading-none">Subscription<span className="text-gold">.</span></h1>
          <p className="text-gray-400 font-medium text-lg mt-4 max-w-xl leading-relaxed">Manage your ministry's technological footprint and service credentials.</p>
        </div>

        {/* Cycle Toggle */}
        <div className="bg-white p-1.5 rounded-[2rem] border border-gray-100 shadow-sm flex items-center shrink-0">
          <button 
            onClick={() => setBillingCycle('monthly')}
            className={`px-8 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${billingCycle === 'monthly' ? 'bg-burgundy text-gold shadow-lg shadow-burgundy/20' : 'text-gray-400 hover:text-burgundy'}`}
          >
            Monthly
          </button>
          <button 
            onClick={() => setBillingCycle('yearly')}
            className={`flex items-center gap-3 px-8 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${billingCycle === 'yearly' ? 'bg-burgundy text-gold shadow-lg shadow-burgundy/20' : 'text-gray-400 hover:text-burgundy'}`}
          >
            Yearly
            <span className="bg-gold-cream text-gold px-2 py-0.5 rounded-md text-[9px] border border-gold/20">-20%</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 items-start">
        {/* Left Column: Plan & Usage */}
        <div className="lg:col-span-2 space-y-10">
          
          {/* Main Tier Card */}
          <div className="bg-white rounded-[3.5rem] border border-gray-50 shadow-[0_30px_90px_rgba(0,0,0,0.03)] overflow-hidden group">
            <div className="bg-burgundy p-12 text-gold relative overflow-hidden">
               <div className="absolute top-0 right-0 p-10 opacity-10 rotate-12 transition-transform duration-1000 group-hover:scale-125">
                  <Zap size={180} fill="currentColor" />
               </div>
               <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-8">
                     <div className="px-4 py-1.5 bg-gold/20 border border-gold/20 rounded-full text-[10px] font-black uppercase tracking-widest">
                        Active Tier
                     </div>
                     <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest opacity-60">
                        <Clock size={12} />
                        Renews Oct 28
                     </div>
                  </div>
                  <h3 className="text-4xl font-black tracking-tight mb-2">Kingdom Growth Plan</h3>
                  <p className="text-white/60 font-medium max-w-sm leading-relaxed">Scaling your reach with advanced automation and unlimited congregant analysis.</p>
                  <div className="mt-10 flex items-baseline gap-2">
                     <span className="text-5xl font-black text-white">$2,490</span>
                     <span className="text-lg font-bold opacity-40">/ year</span>
                  </div>
               </div>
            </div>
            
            <div className="p-12 space-y-10">
               <div>
                  <h4 className="text-[11px] font-black text-gray-300 uppercase tracking-[0.3em] mb-8">Ecosystem Usage</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                     {usageStats.map((stat, i) => (
                        <div key={i} className="space-y-4">
                           <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 text-gray-400">
                                 {stat.icon}
                                 <span className="text-[12px] font-bold uppercase tracking-tight">{stat.label.split(' ')[0]}</span>
                              </div>
                              <span className="text-[11px] font-black text-[#0d1a14]">{Math.round((stat.current / stat.limit) * 100)}%</span>
                           </div>
                           <div className="h-1.5 w-full bg-gray-50 rounded-full overflow-hidden shadow-inner">
                              <div 
                                 className={`h-full ${stat.color} transition-all duration-1000`}
                                 style={{ width: `${(stat.current / stat.limit) * 100}%` }}
                              />
                           </div>
                           <p className="text-[10px] text-gray-300 font-bold uppercase">{stat.current.toLocaleString()} / {stat.limit.toLocaleString()}</p>
                        </div>
                     ))}
                  </div>
               </div>
               
               <div className="pt-10 border-t border-gray-50 flex items-center justify-between">
                  <p className="text-[13px] text-gray-400 font-medium">Need to scale your limits or add more modules?</p>
                  <button className="flex items-center gap-3 text-burgundy font-black text-xs uppercase tracking-widest hover:underline group/btn">
                     Explore Extensions
                     <ArrowRight size={16} className="group-hover/btn:translate-x-1 transition-transform" />
                  </button>
               </div>
            </div>
          </div>

          {/* Payment Method */}
          <div className="bg-white rounded-[3rem] border border-gray-50 shadow-sm p-12 flex flex-col md:flex-row items-center gap-12 group">
             <div className="relative shrink-0 transition-transform duration-700 group-hover:rotate-[-2deg]">
                <div className="w-[340px] h-[200px] bg-gradient-to-br from-burgundy-dark to-burgundy rounded-[2rem] p-8 shadow-2xl relative overflow-hidden border-b-8 border-gold/40">
                   <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/5 rounded-full blur-3xl" />
                   <div className="flex justify-between items-start relative z-10">
                      <div className="w-12 h-10 bg-gold/20 rounded-md flex items-center justify-center border border-gold/30 backdrop-blur-sm">
                         <div className="w-8 h-6 border-2 border-gold/40 rounded shadow-inner" />
                      </div>
                      <ShieldCheck size={28} className="text-gold opacity-60" />
                   </div>
                   <div className="mt-12">
                      <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.3em] mb-2">Vaulted Authorization</p>
                      <p className="text-white text-xl font-mono tracking-[0.3em] drop-shadow-lg">•••• •••• •••• 4242</p>
                   </div>
                   <div className="mt-auto pt-4 flex justify-between items-end relative z-10">
                      <div>
                         <p className="text-white/30 text-[8px] font-bold uppercase tracking-widest">Authorized By</p>
                         <p className="text-gold font-bold text-[12px] tracking-tight">H. SCHULTZ</p>
                      </div>
                      <div className="text-right">
                         <p className="text-white/30 text-[8px] font-bold uppercase tracking-widest">Expires</p>
                         <p className="text-white font-bold text-[12px]">08/26</p>
                      </div>
                   </div>
                </div>
             </div>
             <div className="flex-1 space-y-6">
                <div>
                   <h4 className="text-2xl font-black text-[#0d1a14] tracking-tight mb-2">Secure Payment Method</h4>
                   <p className="text-[14px] text-gray-400 font-medium leading-relaxed">Your primary VISA card is encrypted and managed via our secure financial gateway.</p>
                </div>
                <div className="flex items-center gap-4">
                   <button className="px-8 py-4 bg-white border border-gray-100 rounded-2xl text-burgundy font-black text-[11px] uppercase tracking-widest shadow-sm hover:shadow-md transition-all active:scale-95 flex items-center gap-2">
                      <CreditCard size={16} />
                      Replace Card
                   </button>
                   <button className="text-gray-300 font-bold text-[11px] uppercase tracking-widest hover:text-red-500 transition-colors">
                      Delete Method
                   </button>
                </div>
             </div>
          </div>
        </div>

        {/* Right Column: Invoices & Concierge Chat */}
        <div className="space-y-10">
          
          {/* History Ledger */}
          <div className="bg-white rounded-[3rem] border border-gray-50 shadow-sm p-10">
            <div className="flex items-center justify-between mb-10">
               <div>
                  <h3 className="text-xl font-black text-[#0d1a14] tracking-tight">Invoice History</h3>
                  <p className="text-[10px] text-gold font-black uppercase tracking-widest mt-1">Audit Ready</p>
               </div>
               <button className="p-3 bg-gray-50 text-gray-400 hover:text-burgundy rounded-xl transition-all">
                  <Plus size={20} />
               </button>
            </div>
            
            <div className="space-y-4">
               {invoices.map((inv, i) => (
                  <div key={i} className="group flex items-center justify-between p-5 rounded-[1.5rem] bg-[#fcfcfb] border border-transparent hover:bg-white hover:border-gold/20 hover:shadow-xl transition-all duration-500 cursor-pointer">
                     <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-gray-300 group-hover:text-gold shadow-sm border border-gray-50 transition-colors">
                           <Download size={18} />
                        </div>
                        <div>
                           <p className="text-[14px] font-black text-[#0d1a14] leading-none mb-1.5">{inv.id}</p>
                           <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{inv.date}</p>
                        </div>
                     </div>
                     <div className="text-right">
                        <p className="text-[14px] font-black text-burgundy mb-1">${inv.amount.toFixed(2)}</p>
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-green-50 text-green-600 font-black uppercase tracking-widest border border-green-100">PAID</span>
                     </div>
                  </div>
               ))}
            </div>
            
            <button className="w-full mt-10 py-5 bg-gray-50 border border-gray-100 rounded-2xl text-[#0d1a14] font-black text-[11px] uppercase tracking-widest hover:bg-white hover:border-gold/20 transition-all flex items-center justify-center gap-3 group">
               View Full Ledger
               <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          {/* Concierge Chat Support (Integrated Chat Experience) */}
          <div className="bg-gold-cream/40 p-10 rounded-[3rem] border border-gold/10 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-6 opacity-5 rotate-45 pointer-events-none group-hover:scale-125 transition-transform duration-1000">
               <MessageSquare size={120} className="text-burgundy" />
            </div>
            
            <div className="flex items-center gap-4 mb-8 relative z-10">
              <div className="w-12 h-12 rounded-2xl bg-burgundy flex items-center justify-center text-gold shadow-lg shadow-burgundy/20 animate-pulse">
                <Sparkles size={24} />
              </div>
              <div>
                <h3 className="text-lg font-black text-[#0d1a14] leading-none tracking-tight">Billing Concierge</h3>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Direct Priority Line</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm relative z-10">
               <p className="text-[13px] text-[#0d1a14] font-bold leading-relaxed">
                  "Hi Haley, I'm your financial assistant. I can help you reconcile these invoices or explain the tax deductions for your 501(c)(3) status."
               </p>
               <div className="mt-6 space-y-2">
                  <button className="w-full py-3 bg-gray-50 rounded-xl text-[11px] font-black text-gray-400 uppercase tracking-widest hover:bg-burgundy/5 hover:text-burgundy transition-all text-center">
                     Request Tax Receipt
                  </button>
                  <button className="w-full py-4 bg-burgundy text-gold font-black text-[11px] uppercase tracking-widest rounded-xl shadow-xl shadow-burgundy/20 active:scale-95 transition-all flex items-center justify-center gap-3">
                     <MessageSquare size={14} />
                     Start Direct Chat
                  </button>
               </div>
            </div>
            
            <div className="mt-8 flex items-center justify-center gap-3 opacity-40">
               <Lock size={12} className="text-burgundy" />
               <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.3em]">End-to-End Encrypted Session</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-center gap-12 pt-10 border-t border-gray-100">
        <div className="flex items-center gap-4 group cursor-pointer">
          <div className="w-12 h-12 rounded-2xl bg-gold-cream text-gold flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform border border-gold/10">
            <ShieldCheck size={22} />
          </div>
          <div className="text-left">
            <h4 className="text-sm font-bold text-[#0d1a14]">SOC2 Certified</h4>
            <p className="text-xs text-gray-400 font-medium">Your financial data is protected by bank-level security.</p>
          </div>
        </div>
        <div className="flex items-center gap-4 group cursor-pointer">
          <div className="w-12 h-12 rounded-2xl bg-burgundy/5 text-burgundy flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform border border-burgundy/10">
            <LifeBuoy size={22} />
          </div>
          <div className="text-left">
            <h4 className="text-sm font-bold text-[#0d1a14]">Priority Support</h4>
            <p className="text-xs text-gray-400 font-medium">As a Growth Tier member, you have <button className="text-burgundy hover:underline">Fast Track</button> access.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BillingPage;
