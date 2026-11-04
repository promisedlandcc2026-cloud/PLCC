
import React, { useState } from 'react';
import { 
  Database, 
  FileUp, 
  Download, 
  Info, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  LifeBuoy, 
  ChevronRight, 
  UploadCloud,
  FileSpreadsheet,
  Zap,
  ArrowRight
} from 'lucide-react';

const ImportPeoplePage: React.FC = () => {
  const [step, setStep] = useState(1);
  const [isDragging, setIsDragging] = useState(false);

  const steps = [
    { id: 1, label: 'Prepare' },
    { id: 2, label: 'Upload' },
    { id: 3, label: 'Map Data' },
    { id: 4, label: 'Commit' }
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-12 animate-in fade-in duration-700 pb-20 pt-4">
      {/* Dynamic Header with Stepper */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 border-b border-gray-100 pb-10">
        <div className="space-y-2">
          <div className="flex items-center gap-3 mb-2">
            <div className="px-3 py-1 rounded-full bg-gold-cream border border-gold/20 text-[10px] font-black text-gold uppercase tracking-[0.2em]">
              Administration
            </div>
            <div className="w-1 h-1 rounded-full bg-gray-200" />
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Data Migration</span>
          </div>
          <h1 className="text-5xl font-black text-[#0d1a14] tracking-tighter leading-none">Import Concierge<span className="text-gold">.</span></h1>
          <p className="text-gray-400 font-medium text-lg max-w-lg">Seamlessly migrate your congregation records into the PLCC Ecosystem.</p>
        </div>

        {/* Stepper Component */}
        <div className="flex items-center gap-4 bg-white p-2 rounded-[2rem] border border-gray-50 shadow-sm">
          {steps.map((s, idx) => (
            <div key={s.id} className="flex items-center">
              <div className={`flex items-center gap-3 px-6 py-3 rounded-2xl transition-all ${step === s.id ? 'bg-burgundy text-gold shadow-lg' : 'text-gray-300'}`}>
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black border ${step === s.id ? 'border-gold/30 bg-gold/10' : 'border-gray-100 bg-gray-50'}`}>
                  {s.id}
                </div>
                <span className="text-xs font-black uppercase tracking-widest">{s.label}</span>
              </div>
              {idx < steps.length - 1 && (
                <div className="mx-2 text-gray-100">
                  <ChevronRight size={16} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 items-start">
        {/* Main Interaction Area */}
        <div className="lg:col-span-2 space-y-10">
          
          {/* Enhanced Drag & Drop Zone */}
          <div 
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            className={`group relative bg-white border-[3px] border-dashed rounded-[3.5rem] p-16 lg:p-24 text-center transition-all duration-500 overflow-hidden cursor-pointer ${
              isDragging ? 'border-gold bg-gold-cream/20 scale-[0.99] rotate-1' : 'border-gray-100 hover:border-gold/30 hover:bg-gold-cream/5 shadow-[0_20px_60px_rgba(0,0,0,0.02)]'
            }`}
          >
            {/* Contextual Animation elements */}
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
               <div className="absolute top-10 right-10 p-4 text-gold/5 -rotate-12 group-hover:-rotate-45 transition-transform duration-1000">
                  <FileSpreadsheet size={180} />
               </div>
               <div className="absolute bottom-10 left-10 p-4 text-burgundy/5 rotate-12 group-hover:rotate-45 transition-transform duration-1000">
                  <UploadCloud size={140} />
               </div>
            </div>

            <div className="relative z-10 flex flex-col items-center">
              <div className={`w-24 h-24 rounded-[2.5rem] flex items-center justify-center mb-10 transition-all duration-700 shadow-xl ring-8 ring-white ${
                isDragging ? 'bg-gold text-white scale-110 rotate-3' : 'bg-burgundy text-gold group-hover:scale-105 group-hover:shadow-burgundy/20'
              }`}>
                <UploadCloud size={48} strokeWidth={1.5} />
              </div>
              <h3 className="text-3xl font-black text-[#0d1a14] mb-4 tracking-tight">Drop your source file</h3>
              <p className="text-gray-400 font-bold uppercase tracking-[0.2em] text-[11px] mb-12">Supported: CSV, XLS, XLSX • Max 50MB</p>
              
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <button className="px-12 py-5 bg-burgundy text-gold font-black text-xs uppercase tracking-[0.2em] rounded-2xl shadow-2xl shadow-burgundy/30 hover:bg-burgundy-dark transition-all active:scale-95 border-b-4 border-gold/30">
                  Select Local File
                </button>
                <button className="px-10 py-5 bg-white text-gray-400 font-bold text-xs uppercase tracking-[0.1em] hover:text-burgundy transition-all flex items-center gap-2">
                  <Zap size={16} className="text-gold" />
                  Paste Data URL
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white p-10 rounded-[2.5rem] border border-gray-50 shadow-sm group hover:shadow-xl transition-all flex flex-col h-full border-t-4 border-t-gold/20">
              <div className="flex items-center gap-5 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-gold-cream text-gold flex items-center justify-center shadow-inner group-hover:rotate-6 transition-transform">
                  <Download size={24} />
                </div>
                <div>
                   <h4 className="font-black text-[#0d1a14] text-lg tracking-tight leading-none">Golden Template</h4>
                   <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">v4.2.0 (Optimized)</p>
                </div>
              </div>
              <p className="text-sm text-gray-400 font-medium leading-relaxed mb-10 flex-1">
                Download our pre-structured template to ensure perfect field mapping for household connections and spiritual statuses.
              </p>
              <button className="w-full py-5 bg-gray-50 text-[#0d1a14] font-black text-[11px] uppercase tracking-widest rounded-2xl border border-transparent hover:bg-white hover:border-gold/20 hover:shadow-md transition-all">
                Download Structure (.CSV)
              </button>
            </div>

            <div className="bg-[#fcfcfb] p-10 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col h-full border-t-4 border-t-burgundy/20">
               <div className="flex items-center gap-4 mb-8">
                  <div className="w-12 h-12 rounded-2xl bg-burgundy/5 text-burgundy flex items-center justify-center shadow-inner">
                     <Info size={24} />
                  </div>
                  <h4 className="font-black text-[#0d1a14] text-lg tracking-tight">Validation Logic</h4>
               </div>
               <div className="space-y-4 flex-1">
                  {[
                    'Email addresses must be globally unique.',
                    'Household IDs correlate family members.',
                    'Date format: YYYY-MM-DD only.',
                    'Boolean values: TRUE/FALSE or 1/0.'
                  ].map((rule, i) => (
                    <div key={i} className="flex items-start gap-3">
                       <CheckCircle2 size={16} className="text-gold shrink-0 mt-0.5" />
                       <span className="text-[13px] font-bold text-gray-400 leading-tight">{rule}</span>
                    </div>
                  ))}
               </div>
               <p className="text-[11px] text-gray-300 font-medium italic mt-8">System will auto-detect duplicates based on ID or Email.</p>
            </div>
          </div>
        </div>

        {/* AI Import Assistant Sidebar */}
        <div className="space-y-8">
          <div className="bg-white rounded-[3rem] border border-gray-100 p-10 shadow-[0_20px_50px_rgba(29, 55, 44,0.03)] flex flex-col relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-5 rotate-12 group-hover:scale-110 transition-transform">
               <Sparkles size={80} className="text-burgundy" />
            </div>
            
            <div className="flex items-center gap-4 mb-10">
              <div className="w-12 h-12 rounded-2xl bg-burgundy flex items-center justify-center text-gold shadow-lg shadow-burgundy/20 animate-pulse">
                <Sparkles size={24} />
              </div>
              <div>
                <h3 className="text-lg font-black text-[#0d1a14] leading-none tracking-tight">Import Assistant</h3>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Live Intelligence</p>
              </div>
            </div>

            <div className="flex-1 space-y-8 mb-12">
               <div className="bg-gold-cream/40 p-6 rounded-[2rem] rounded-tl-none border border-gold/10">
                  <p className="text-sm font-bold text-[#0d1a14] leading-relaxed">
                    "I can help you map custom columns or clean up phone numbers automatically during upload. What are we migrating today?"
                  </p>
               </div>
               
               <div className="space-y-3">
                  <p className="text-[10px] font-black text-gray-300 uppercase tracking-[0.3em] ml-2">Guided Actions</p>
                  <button className="w-full flex items-center justify-between p-4 rounded-2xl bg-white border border-gray-100 hover:border-gold/30 hover:shadow-sm transition-all group/btn text-left">
                     <span className="text-[12px] font-bold text-gray-500 group-hover/btn:text-burgundy transition-colors">How do I map households?</span>
                     <ArrowRight size={14} className="text-gray-200 group-hover/btn:text-gold" />
                  </button>
                  <button className="w-full flex items-center justify-between p-4 rounded-2xl bg-white border border-gray-100 hover:border-gold/30 hover:shadow-sm transition-all group/btn text-left">
                     <span className="text-[12px] font-bold text-gray-500 group-hover/btn:text-burgundy transition-colors">Fix date format errors</span>
                     <ArrowRight size={14} className="text-gray-200 group-hover/btn:text-gold" />
                  </button>
                  <button className="w-full flex items-center justify-between p-4 rounded-2xl bg-white border border-gray-100 hover:border-gold/30 hover:shadow-sm transition-all group/btn text-left">
                     <span className="text-[12px] font-bold text-gray-500 group-hover/btn:text-burgundy transition-colors">Merge duplicate records</span>
                     <ArrowRight size={14} className="text-gray-200 group-hover/btn:text-gold" />
                  </button>
               </div>
            </div>

            <div className="pt-8 border-t border-gray-50 flex items-center justify-between">
               <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Ready to Assist</span>
               </div>
               <button className="text-burgundy font-black text-[11px] uppercase tracking-widest hover:underline">Start Chat</button>
            </div>
          </div>

          <div className="bg-burgundy p-10 rounded-[3rem] text-gold shadow-2xl shadow-burgundy/30 relative overflow-hidden group">
             <Database size={120} className="absolute -bottom-10 -right-10 opacity-10 group-hover:scale-125 transition-transform duration-1000" />
             <div className="relative z-10">
                <LifeBuoy size={32} className="mb-6 opacity-60" />
                <h4 className="text-xl font-black mb-2 leading-none">Direct Migration</h4>
                <p className="text-white/60 text-[13px] font-medium leading-relaxed mb-8">
                  Coming from Planning Center or Church Community Builder? Our team handles direct database handshakes.
                </p>
                <button className="w-full py-4 bg-gold text-burgundy font-black text-[11px] uppercase tracking-[0.2em] rounded-2xl shadow-xl hover:bg-white transition-all active:scale-95 border-b-4 border-black/10">
                  Talk to a Specialist
                </button>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImportPeoplePage;
