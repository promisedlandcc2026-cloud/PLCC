
import React from 'react';
import { 
  BarChart, 
  PieChart, 
  TrendingUp, 
  Sparkles, 
  Calendar, 
  Download, 
  ArrowUpRight,
  ChevronRight,
  LifeBuoy
} from 'lucide-react';

const EventsReports: React.FC = () => {
  const data = [
    { label: 'Jan', value: 45 },
    { label: 'Feb', value: 72 },
    { label: 'Mar', value: 38 },
    { label: 'Apr', value: 91 },
    { label: 'May', value: 64 },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-extrabold text-[#0d1a14] mb-2 tracking-tight">Event Analytics</h1>
          <p className="text-gray-400 font-medium">Deep dive into attendance trends and participation demographics.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-white border border-gray-100 text-gray-500 font-bold text-sm hover:bg-gray-50 transition-all shadow-sm">
            <Download size={18} className="text-gold" />
            Full Report
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white p-10 rounded-[2.5rem] border border-gray-50 shadow-sm group">
          <div className="flex items-center justify-between mb-10">
            <h3 className="text-xl font-black text-[#0d1a14] flex items-center gap-3">
               <TrendingUp size={22} className="text-burgundy" />
               Attendance Growth
            </h3>
            <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Past 5 Months</span>
          </div>
          
          <div className="flex items-end justify-between h-56 px-4 mb-4">
            {data.map((d, i) => (
              <div key={i} className="flex flex-col items-center flex-1">
                <div 
                  className="w-10 bg-burgundy/5 rounded-2xl transition-all hover:bg-burgundy group-hover:bg-burgundy/10 cursor-pointer relative group/bar flex flex-col justify-end overflow-hidden border border-burgundy/5"
                  style={{ height: '100%' }}
                >
                  <div 
                    className="w-full bg-burgundy rounded-2xl shadow-lg transition-all"
                    style={{ height: `${d.value}%` }}
                  >
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 opacity-0 group-hover/bar:opacity-100 transition-opacity">
                       <span className="text-[10px] font-black text-gold">{d.value}%</span>
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-black text-gray-300 mt-4 uppercase tracking-[0.2em]">{d.label}</span>
              </div>
            ))}
          </div>
          <div className="p-5 bg-gold-cream/20 rounded-2xl border border-gold/10 flex items-start gap-4 mt-6">
             <Sparkles size={18} className="text-gold shrink-0 mt-0.5" />
             <p className="text-xs text-gray-400 font-medium leading-relaxed">Attendance peaked in April, coinciding with the Easter Youth Rally. Consider similar engagement strategies for next quarter.</p>
          </div>
        </div>

        <div className="bg-white p-10 rounded-[2.5rem] border border-gray-50 shadow-sm group">
          <div className="flex items-center justify-between mb-10">
            <h3 className="text-xl font-black text-[#0d1a14] flex items-center gap-3">
               <PieChart size={22} className="text-gold" />
               Demographics
            </h3>
            <button className="text-[10px] font-black text-burgundy uppercase tracking-widest hover:underline">Filter</button>
          </div>
          
          <div className="flex-1 flex items-center justify-center h-56 bg-[#fdfdfc] rounded-[2rem] border border-dashed border-gray-100 group-hover:bg-gold-cream/10 transition-colors">
             <div className="text-center">
               <div className="w-20 h-20 rounded-full border-4 border-gold/10 border-t-gold animate-spin-slow mx-auto mb-6" />
               <p className="text-[11px] font-black text-gray-300 uppercase tracking-widest">Generating Demographics...</p>
             </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-8">
             <div className="p-4 bg-gray-50 rounded-2xl flex items-center justify-between">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">New Visitors</span>
                <span className="text-lg font-black text-burgundy">24%</span>
             </div>
             <div className="p-4 bg-gray-50 rounded-2xl flex items-center justify-between">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Returning</span>
                <span className="text-lg font-black text-burgundy">76%</span>
             </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'Retention Rate', value: '85%', trend: '+4%', icon: <TrendingUp size={20} /> },
          { label: 'Avg Check-In Time', value: '42s', trend: '-10s', icon: <Calendar size={20} /> },
          { label: 'Volunteer Ratio', value: '1:12', trend: '+2', icon: <ArrowUpRight size={20} /> }
        ].map((item, i) => (
          <div key={i} className="bg-white p-6 rounded-[2rem] border border-gray-50 flex items-center gap-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-burgundy/5 text-burgundy rounded-xl flex items-center justify-center shrink-0">
              {item.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-1">{item.label}</p>
              <div className="flex items-end justify-between">
                 <p className="text-xl font-black text-[#0d1a14]">{item.value}</p>
                 <span className="text-[10px] font-bold text-gold">{item.trend}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-8 pt-8 border-t border-gray-50">
        <div className="flex items-center gap-3 text-sm font-semibold text-gray-400">
          <Sparkles size={18} className="text-gold" />
          <span>Need help interpreting these trends? <button className="text-burgundy hover:underline">Ask PLCC AI</button></span>
        </div>
        <div className="flex items-center gap-3 text-sm font-semibold text-gray-400">
          <LifeBuoy size={18} className="text-burgundy" />
          <span>Missing transaction data? <button className="text-burgundy hover:underline">Contact Support</button></span>
        </div>
      </div>
    </div>
  );
};

export default EventsReports;
