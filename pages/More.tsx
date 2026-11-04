
import React from 'react';
import { 
  Settings, 
  ShieldCheck, 
  Building2, 
  ClipboardList, 
  BarChart, 
  ChevronRight,
  ArrowLeft,
  Sparkles,
  LayoutGrid,
  ShieldAlert,
  BookOpen,
  Database,
  Shield
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const MorePage: React.FC = () => {
  const navigate = useNavigate();

  const menuItems = [
    { 
      label: 'Settings Hub', 
      description: 'System preferences & tools',
      path: '/settings', 
      icon: <Settings size={28} />,
      color: 'bg-burgundy text-gold',
      shadow: 'shadow-burgundy/20'
    },
    { 
      label: 'Staff & Roles', 
      description: 'Assign member roles (Super Admin only)',
      path: '/admin/users', 
      icon: <ShieldCheck size={28} />,
      color: 'bg-gold text-burgundy',
      shadow: 'shadow-gold/20'
    },
    { 
      label: 'Consent Forms', 
      description: 'Food allergy, kids e-sign & medical forms',
      path: '/admin/consent-management?tab=forms', 
      icon: <Shield size={28} />,
      color: 'bg-green-500 text-white',
      shadow: 'shadow-green-500/20'
    },
    { 
      label: 'Servant Keeper Integration', 
      description: 'Sync with church management system',
      path: '/admin/servant-keeper', 
      icon: <Database size={28} />,
      color: 'bg-blue-500 text-white',
      shadow: 'shadow-blue-500/20'
    },
    { 
      label: 'Organization', 
      description: 'Ministry profile & branding',
      path: '/settings?tab=organization', 
      icon: <Building2 size={28} />,
      color: 'bg-gold-cream text-burgundy',
      shadow: 'shadow-gold-cream/20'
    },
    { 
      label: 'Security Log', 
      description: 'Incident tracking & dispatch',
      path: '/settings?tab=security-log', 
      icon: <ShieldAlert size={28} />,
      color: 'bg-burgundy/10 text-burgundy',
      shadow: 'shadow-burgundy/5'
    },
    { 
      label: 'Audit Log', 
      description: 'System activity & history',
      path: '/settings?tab=audit', 
      icon: <ClipboardList size={28} />,
      color: 'bg-gray-50 text-gray-400',
      shadow: 'shadow-gray-200/50'
    },
    { 
      label: 'Reports & Insights', 
      description: 'Detailed ministry analytics',
      path: '/reports', 
      icon: <BarChart size={28} />,
      color: 'bg-burgundy text-gold',
      shadow: 'shadow-burgundy/20'
    },
    { 
      label: 'Policies & Guides', 
      description: 'Official ministry playbook',
      path: '/admin/policies', 
      icon: <BookOpen size={28} />,
      color: 'bg-gold text-burgundy',
      shadow: 'shadow-gold/20'
    },
  ];

  return (
    <div className="min-h-screen bg-[#FDFDFB] pb-32 animate-in fade-in duration-700">
      {/* Header Area */}
      <div className="bg-white border-b border-gray-100 px-6 py-8 md:py-12">
        <div className="max-w-4xl mx-auto">
          <button 
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 text-gray-400 font-bold text-[10px] uppercase tracking-widest mb-6 hover:text-burgundy transition-colors group"
          >
            <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
            Back to Dashboard
          </button>
          
          <div className="flex items-center gap-3 mb-2">
            <div className="h-1 w-8 bg-gold rounded-full" />
            <h2 className="text-[10px] font-black text-gold uppercase tracking-[0.4em]">Administration</h2>
          </div>
          <h1 className="text-4xl font-black text-[#0d1a14] tracking-tighter leading-none mb-1">More Tools<span className="text-gold">.</span></h1>
          <p className="text-gray-400 font-medium text-sm">Auxiliary modules and system configuration.</p>
        </div>
      </div>

      {/* Grid Content */}
      <div className="max-w-4xl mx-auto px-6 mt-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {menuItems.map((item, index) => (
            <button
              key={index}
              onClick={() => navigate(item.path)}
              className="group bg-white p-6 rounded-[2.5rem] border border-gray-50 flex items-center gap-6 shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 text-left"
            >
              <div className={`w-16 h-16 rounded-3xl flex items-center justify-center transition-all group-hover:scale-110 shadow-lg ${item.color} ${item.shadow}`}>
                {item.icon}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-black text-[#0d1a14] leading-none mb-1 group-hover:text-burgundy transition-colors">{item.label}</h3>
                <p className="text-xs text-gray-400 font-medium">{item.description}</p>
              </div>
              <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-50 group-hover:bg-burgundy group-hover:text-gold transition-all text-gray-300">
                <ChevronRight size={18} />
              </div>
            </button>
          ))}
        </div>

        {/* System Health Card */}
        <div className="mt-12 bg-burgundy p-10 rounded-[3rem] text-gold relative overflow-hidden group shadow-2xl shadow-burgundy/30 border-b-8 border-gold/40">
           <LayoutGrid size={120} className="absolute -bottom-8 -right-8 opacity-5 group-hover:scale-110 transition-transform duration-1000" />
           <div className="relative z-10">
             <div className="flex items-center gap-2 mb-4">
               <Sparkles size={20} className="text-gold" />
               <span className="text-[10px] font-black uppercase tracking-[0.3em] opacity-60">System Status</span>
             </div>
             <h3 className="text-3xl font-black tracking-tight mb-2 leading-none">All Protocols Operational</h3>
             <p className="text-white/60 font-medium text-sm max-w-sm">The PLCC Vault is synchronized with high-availability nodes. All administrative channels are secured.</p>
           </div>
        </div>
      </div>
    </div>
  );
};

export default MorePage;
