import React, { useState } from 'react';
import {
  FileCheck,
  Search,
  Filter,
  Download,
  ChevronRight,
  ShieldCheck,
  Sparkles,
  LifeBuoy,
  Mail,
  Printer,
  Clock,
  CheckCircle2,
  ArrowRight,
  Database,
  Calendar
} from 'lucide-react';

import { formatCurrency } from '../../utils/formatters';
const TaxDocumentsPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [taxYear, setTaxYear] = useState('2024');

  const statements = [
    { id: 'ST-102', donor: 'Jonathan Edwards', year: '2024', total: 15400.00, delivery: 'Digital (Secure Email)', status: 'Delivered' },
    { id: 'ST-103', donor: 'Sarah Jenkins', year: '2024', total: 8200.50, delivery: 'Print (Physical Mail)', status: 'Processing' },
    { id: 'ST-104', donor: 'Michael Thompson', year: '2024', total: 540.00, delivery: 'Digital (Secure Email)', status: 'Draft' },
    { id: 'ST-105', donor: 'Elizabeth Warren', year: '2024', total: 24500.00, delivery: 'Digital (Secure Email)', status: 'Delivered' },
  ];

  const filtered = statements.filter(s =>
    s.donor.toLowerCase().includes(search.toLowerCase()) ||
    s.id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck size={14} className="text-gold" />
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Compliance Center</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-[#0d1a14] mb-1 tracking-tight">Tax Documents</h1>
          <p className="text-gray-400 text-sm md:text-base font-medium font-inter">Manage annual contribution statements and IRS-compliant reports.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
          <div className="relative w-full sm:w-auto">
            <select
              value={taxYear}
              onChange={(e) => setTaxYear(e.target.value)}
              className="w-full sm:w-auto bg-white border border-gray-100 px-5 py-3 rounded-xl md:rounded-2xl text-xs font-bold text-burgundy shadow-sm outline-none focus:ring-4 focus:ring-burgundy/5 appearance-none"
            >
              <option>Tax Year 2024</option>
              <option>Tax Year 2023</option>
              <option>Tax Year 2022</option>
            </select>
            <ChevronRight size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 rotate-90 pointer-events-none" />
          </div>
          <button className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl md:rounded-2xl bg-burgundy text-gold font-bold text-xs md:text-sm shadow-xl shadow-burgundy/20 hover:bg-burgundy-dark transition-all active:scale-95 border-b-2 border-gold/30">
            Generate Statements
          </button>
        </div>
      </div>

      {/* Generation Progress Block */}
      <div className="bg-white p-6 md:p-10 rounded-[1.5rem] md:rounded-[3rem] border border-gray-100 shadow-sm relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:scale-110 transition-transform duration-1000 pointer-events-none hidden md:block">
          <FileCheck size={180} className="text-burgundy" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8 md:gap-10">
          <div className="w-full md:flex-1 space-y-4 md:space-y-6">
            <div>
              <h3 className="text-xl md:text-2xl font-black text-[#0d1a14]">Annual Statement Rollout</h3>
              <p className="text-gray-400 text-xs md:text-sm font-medium mt-1">Status: <span className="text-gold font-black uppercase">Active Generation</span></p>
            </div>
            <div className="space-y-2 md:space-y-3">
              <div className="flex items-center justify-between text-[10px] md:text-[11px] font-black uppercase tracking-widest text-gray-400">
                <span>Fulfillment Progress</span>
                <span className="text-burgundy">84% Complete</span>
              </div>
              <div className="h-1.5 md:h-2 w-full bg-gray-50 rounded-full overflow-hidden shadow-inner border border-gray-100">
                <div className="h-full bg-burgundy rounded-full shadow-[0_0_8px_rgba(29, 55, 44,0.3)] transition-all duration-1000" style={{ width: '84%' }} />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:gap-4 w-full md:w-auto shrink-0">
            <div className="bg-gray-50 p-4 md:p-6 rounded-[1.5rem] md:rounded-[2rem] text-center border border-gray-100">
              <p className="text-xl md:text-2xl font-black text-[#0d1a14]">2,140</p>
              <p className="text-[8px] md:text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Emailed</p>
            </div>
            <div className="bg-gold-cream/30 p-4 md:p-6 rounded-[1.5rem] md:rounded-[2rem] text-center border border-gold/10">
              <p className="text-xl md:text-2xl font-black text-gold">412</p>
              <p className="text-[8px] md:text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Printed</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[1.5rem] md:rounded-[2.5rem] border border-gray-50 shadow-[0_8px_40px_rgba(0,0,0,0.02)] overflow-hidden">
        <div className="p-4 md:p-8 border-b border-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6">
          <div className="relative group flex-1 w-full md:max-w-xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-gold transition-colors" size={18} />
            <input
              type="text"
              placeholder="Search donor or statement ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-11 md:pl-12 pr-6 py-3.5 md:py-4 bg-gray-50/50 rounded-xl md:rounded-2xl outline-none border border-transparent focus:bg-white focus:border-gold/20 focus:ring-4 focus:ring-gold/5 transition-all text-sm font-semibold text-[#0d1a14]"
            />
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <button className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 md:px-5 py-3 rounded-xl md:rounded-2xl bg-white border border-gray-100 text-gray-400 font-bold text-[10px] md:text-sm hover:border-gold/20 transition-all active:scale-95 shadow-sm">
              <Mail size={14} />
              <span className="hidden sm:inline">Bulk Email</span>
              <span className="sm:hidden">Email</span>
            </button>
            <button className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 md:px-5 py-3 rounded-xl md:rounded-2xl bg-white border border-gray-100 text-gray-400 font-bold text-[10px] md:text-sm hover:border-gold/20 transition-all active:scale-95 shadow-sm">
              <Printer size={14} />
              <span className="hidden sm:inline">Bulk Print</span>
              <span className="sm:hidden">Print</span>
            </button>
          </div>
        </div>

        {/* Desktop View: Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gold-cream/20">
                <th className="px-8 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Donor Identity</th>
                <th className="px-8 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Tax Year</th>
                <th className="px-8 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Total Contribution</th>
                <th className="px-8 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Delivery Path</th>
                <th className="px-8 py-5 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] text-center">Status</th>
                <th className="px-8 py-5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(st => (
                <tr key={st.id} className="group hover:bg-gold-cream/10 transition-colors">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-burgundy text-gold flex items-center justify-center font-black text-xs shadow-sm group-hover:scale-110 transition-transform">
                        {st.donor.charAt(0)}
                      </div>
                      <div>
                        <p className="text-[14px] font-bold text-[#0d1a14] leading-none mb-1">{st.donor}</p>
                        <p className="text-[10px] text-gray-300 font-mono tracking-widest uppercase">{st.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6 text-[14px] font-bold text-gray-400">{st.year}</td>
                  <td className="px-8 py-6 text-[15px] font-black text-[#0d1a14]">{formatCurrency(st.total)}</td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2">
                      {st.delivery.includes('Email') ? <Mail size={14} className="text-gold" /> : <Printer size={14} className="text-burgundy" />}
                      <span className="text-[12px] font-semibold text-gray-500">{st.delivery}</span>
                    </div>
                  </td>
                  <td className="px-8 py-6 text-center">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border transition-all ${st.status === 'Delivered' ? 'bg-green-50 text-green-600 border-green-100' :
                      st.status === 'Processing' ? 'bg-gold-cream text-gold border-gold/20' :
                        'bg-gray-50 text-gray-400 border-gray-100'
                      }`}>
                      {st.status === 'Delivered' ? <CheckCircle2 size={10} className="mr-1.5" /> : <Clock size={10} className="mr-1.5" />}
                      {st.status}
                    </span>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <button className="p-2.5 text-gray-200 hover:text-burgundy hover:bg-white rounded-xl transition-all"><Download size={18} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile View: Cards */}
        <div className="md:hidden divide-y divide-gray-50">
          {filtered.map(st => (
            <div key={st.id} className="p-5 space-y-4 hover:bg-gold-cream/5 active:bg-gold-cream/10 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-burgundy text-gold flex items-center justify-center font-black text-xs shadow-sm">
                    {st.donor.charAt(0)}
                  </div>
                  <div>
                    <p className="text-[15px] font-black text-[#0d1a14] leading-none mb-1">{st.donor}</p>
                    <p className="text-[10px] text-gray-300 font-mono tracking-widest uppercase">{st.id}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[15px] font-black text-burgundy">{formatCurrency(st.total)}</p>
                  <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-1">TY {st.year}</p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-lg ${st.delivery.includes('Email') ? 'bg-gold/10 text-gold' : 'bg-burgundy/5 text-burgundy'} border border-transparent`}>
                    {st.delivery.includes('Email') ? <Mail size={14} /> : <Printer size={14} />}
                  </div>
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-tight">{st.delivery.split(' ')[0]}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[8px] font-black uppercase border transition-all ${st.status === 'Delivered' ? 'bg-green-50 text-green-600 border-green-100' :
                    st.status === 'Processing' ? 'bg-gold-cream text-gold border-gold/20' :
                      'bg-gray-50 text-gray-400 border-gray-100'
                    }`}>
                    {st.status}
                  </span>
                  <button className="p-2.5 bg-gray-50 text-gray-400 rounded-lg active:scale-95">
                    <Download size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-10 pt-4 border-t border-gray-50 px-4">
        <div className="flex items-center gap-3 text-xs md:text-sm font-semibold text-gray-400 text-center md:text-left">
          <Sparkles size={18} className="text-gold shrink-0" />
          <span>Statement errors? <button className="text-burgundy hover:underline">Ask PLCC AI</button> to audit the ledger.</span>
        </div>
        <div className="flex items-center gap-3 text-xs md:text-sm font-semibold text-gray-400 text-center md:text-left">
          <LifeBuoy size={18} className="text-burgundy shrink-0" />
          <span>IRS Compliance check? <button className="text-burgundy hover:underline font-black">Talk to Legal Support</button></span>
        </div>
      </div>
    </div>
  );
};

export default TaxDocumentsPage;