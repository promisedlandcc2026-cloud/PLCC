import React, { useState } from 'react';
import { 
  FileText, 
  BookOpen, 
  ChevronRight, 
  ArrowLeft, 
  Sparkles,
  ClipboardCheck,
  GraduationCap,
  Scale,
  X,
  Loader2,
  PenLine,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNav } from '../../App';
import { getAuthHeaders } from '../../lib/api';
import AskAdminTitleLink from '../../components/common/AskAdminTitleLink';

const PoliciesPage: React.FC = () => {
  const navigate = useNavigate();
  const { userRole } = useNav();
  const canRequireAck = ['SUPER_ADMIN', 'ADMIN', 'PASTOR', 'SECRETARY', 'ASST_SECRETARY', 'ADMIN_STAFF', 'FIRST_LADY'].includes(
    String(userRole)
  );
  const [viewingDoc, setViewingDoc] = useState<any>(null);
  const [docContent, setDocContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [ackBusy, setAckBusy] = useState(false);

  const categories = [
    {
      title: 'Administration & Membership',
      description: 'Official procedures for member management and administration.',
      icon: <ClipboardCheck className="text-burgundy" size={24} />,
      items: [
        { name: 'Member Onboarding SOP', type: 'SOP', path: '/docs/sop/SOP_Member_Onboarding.md' },
        { name: 'Meeting Minutes Workflow SOP', type: 'SOP', path: '/docs/sop/SOP_Meeting_Minutes.md' },
        { name: 'How to Add a Member', type: 'Guide', path: '/docs/guides/HowTo_Add_Member.md' },
        { name: 'How to Create Your PLCC Vault Account', type: 'Guide', path: '/docs/guides/HowTo_Member_Setup.md' },
        { name: 'How to Enable Connect Child Cards', type: 'Guide', path: '/docs/guides/HowTo_Connect_Child_Cards.md' },
      ]
    },
    {
      title: 'Events & Attendance',
      description: 'Standards for event management and attendance tracking.',
      icon: <Scale className="text-burgundy" size={24} />,
      items: [
        { name: 'Child Check-In SOP', type: 'SOP', path: '/docs/sop/SOP_Child_Check_In.md' },
        { name: 'Child Check-In For Dummies', type: 'Guide', path: '/docs/guides/HowTo_Child_Check_In_Visual.md' },
        { name: 'Child Check-In Flowchart (Print)', type: 'Quick Ref', path: '/docs/guides/Child_Check_In_Flowchart.md' },
      ]
    },
    {
      title: 'Finance & Treasury',
      description: 'Financial procedures and stewardship standards.',
      icon: <Scale className="text-burgundy" size={24} />,
      items: [
        { name: 'Counting Session Workflow SOP', type: 'SOP', path: '/docs/sop/SOP_Counting_Session.md' },
        { name: 'Contribution Manager How-To', type: 'Guide', path: '/docs/guides/HowTo_Contribution_Manager.md' },
        { name: 'Giving Insights SOP', type: 'SOP', path: '/docs/sop/SOP_Giving_Insights.md' },
      ]
    },
    {
      title: 'Event & Attendance Tools',
      description: 'Step-by-step guides for check-in and event management.',
      icon: <GraduationCap className="text-gold" size={24} />,
      items: [
        { name: 'Using the Event Check-In System', type: 'Guide', path: '/docs/guides/HowTo_Event_Check_In.md' },
      ]
    },
    {
      title: 'Ministry & Team Management',
      description: 'Practical guides for leading teams and volunteers.',
      icon: <GraduationCap className="text-gold" size={24} />,
      items: [
        { name: 'Managing Ministry Teams', type: 'Guide', path: '/docs/guides/HowTo_Manage_Teams.md' },
        { name: 'Setting Up Follow-Up Workflows', type: 'Guide', path: '/docs/guides/HowTo_Follow_Up_Workflows.md' },
      ]
    },
    {
      title: 'Forms & Communication',
      description: 'Tools for creating forms and engaging your congregation.',
      icon: <GraduationCap className="text-gold" size={24} />,
      items: [
        { name: 'Building Custom Forms', type: 'Guide', path: '/docs/guides/HowTo_Create_Forms.md' },
        { name: 'Using Giving Insights', type: 'Guide', path: '/docs/guides/HowTo_Giving_Insights.md' },
      ]
    },
    {
      title: 'Integrations & Data Management',
      description: 'Connect with external systems and manage data sync.',
      icon: <GraduationCap className="text-gold" size={24} />,
      items: [
        { name: 'Servant Keeper 8 Integration', type: 'Guide', path: '/docs/guides/HowTo_Servant_Keeper_Integration.md' },
      ]
    },
    {
      title: 'Church Policies',
      description: 'Official PLCC policies for safety, privacy, and media.',
      icon: <Scale className="text-burgundy" size={24} />,
      items: [
        { name: 'Child Injury & Incident Policy', type: 'Policy', path: '/docs/policies/POLICY_Child_Injury.md' },
        { name: 'Photography & Media Policy', type: 'Policy', path: '/docs/policies/POLICY_Photography_Media.md' },
      ]
    }
  ];

  const handleOpenDoc = async (item: any) => {
    setViewingDoc(item);
    setIsLoading(true);
    setDocContent('');
    try {
      const response = await fetch(item.path);
      const text = await response.text();
      setDocContent(text);
    } catch (err) {
      console.error('Failed to load document:', err);
      setDocContent('Error loading document. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequireAcknowledgement = async () => {
    if (!viewingDoc || !docContent || ackBusy) return;
    if (!canRequireAck) {
      alert('Only leadership roles can require policy acknowledgements.');
      return;
    }
    setAckBusy(true);
    try {
      const deadline = new Date();
      deadline.setDate(deadline.getDate() + 7);
      const headers = await getAuthHeaders();
      const res = await fetch('/api/vault?resource=minutes', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: viewingDoc.name,
          meeting_date: new Date().toISOString().split('T')[0],
          department: 'Policy',
          summary: `Policy acknowledgement required — source ${viewingDoc.path}`,
          content: docContent,
          require_signature: true,
          deadline: deadline.toISOString(),
          requesterRole: userRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create acknowledgement');
      setViewingDoc(null);
      navigate(data.document?.id ? `/communication/minutes/${data.document.id}` : '/communication/minutes');
    } catch (err: any) {
      alert(err?.message || 'Could not create policy acknowledgement');
    } finally {
      setAckBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFDFB] pb-32 animate-in fade-in duration-700">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-8 md:py-12">
        <div className="max-w-4xl mx-auto">
          <button 
            onClick={() => navigate('/more')}
            className="flex items-center gap-2 text-gray-400 font-bold text-[10px] uppercase tracking-widest mb-6 hover:text-burgundy transition-colors group"
          >
            <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
            Back to More Tools
          </button>
          
          <div className="flex items-center gap-3 mb-2">
            <div className="h-1 w-8 bg-gold rounded-full" />
            <h2 className="text-[10px] font-black text-gold uppercase tracking-[0.4em]">Official standards</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h1 className="text-4xl font-black text-[#0d1a14] tracking-tighter leading-none">Ministry Playbook<span className="text-gold">.</span></h1>
            <AskAdminTitleLink />
          </div>
          <p className="text-gray-400 font-medium text-sm">Clear, simple standards for every department at PLCC.</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 mt-10 space-y-12">
        {/* Simple Explanation Card */}
        <div className="bg-gold-cream/30 p-8 rounded-[2.5rem] border border-gold/10 flex items-start gap-4">
          <Sparkles className="text-gold shrink-0 mt-1" size={20} />
          <div>
            <h4 className="text-sm font-black text-burgundy mb-1 uppercase tracking-tight">Why this matters</h4>
            <p className="text-xs text-gray-500 font-medium leading-relaxed">
              This is our "Playbook." It ensures that no matter who is serving, we all provide a **consistent, professional, and excellent experience** for our congregation. It turns guesswork into excellence.
            </p>
          </div>
        </div>

        {/* Categories */}
        <div className="space-y-12">
          {categories.map((cat, idx) => (
            <div key={idx} className="space-y-6">
              <div className="flex items-center gap-4 ml-2">
                <div className="w-12 h-12 rounded-2xl bg-white border border-gray-100 flex items-center justify-center shadow-sm">
                  {cat.icon}
                </div>
                <div>
                  <h3 className="text-lg font-black text-[#0d1a14] leading-none uppercase tracking-tight">{cat.title}</h3>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">{cat.description}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {cat.items.map((item, i) => (
                  <button
                    key={i}
                    onClick={() => handleOpenDoc(item)}
                    className="bg-white p-5 rounded-[1.5rem] border border-gray-50 flex items-center justify-between group hover:shadow-xl hover:border-gold/20 transition-all text-left"
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-300 group-hover:bg-burgundy group-hover:text-gold transition-colors shrink-0">
                        <FileText size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black text-[#0d1a14] leading-tight group-hover:text-burgundy transition-colors truncate">{item.name}</p>
                        <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest mt-1.5">{item.type}</p>
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-gray-200 group-hover:text-burgundy group-hover:translate-x-1 transition-all shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Vision Footer */}
        <div className="pt-12 text-center">
            <div className="w-12 h-12 bg-burgundy/5 text-burgundy rounded-[1.5rem] flex items-center justify-center mx-auto mb-4 border border-burgundy/5">
                <ClipboardCheck size={24} />
            </div>
            <p className="text-[10px] font-black text-gray-300 uppercase tracking-[0.5em]">United in Excellence</p>
        </div>
      </div>

      {/* Document Viewer Modal */}
      {viewingDoc && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 animate-in fade-in zoom-in duration-300">
          <div className="absolute inset-0 bg-burgundy/40 backdrop-blur-sm" onClick={() => setViewingDoc(null)} />
          <div className="relative bg-white w-full max-w-4xl h-full max-h-[90vh] rounded-[3rem] shadow-2xl flex flex-col overflow-hidden border-8 border-white">
            {/* Modal Header */}
            <div className="px-8 py-6 border-b border-gray-50 flex items-center justify-between bg-gold-cream/10">
              <div>
                <p className="text-[10px] font-black text-gold uppercase tracking-[0.4em] mb-1">{viewingDoc.type}</p>
                <h3 className="text-2xl font-black text-burgundy tracking-tight">{viewingDoc.name}</h3>
              </div>
              <button 
                onClick={() => setViewingDoc(null)}
                className="w-12 h-12 rounded-2xl bg-white border border-gray-100 flex items-center justify-center text-gray-400 hover:text-burgundy hover:scale-110 transition-all shadow-sm"
              >
                <X size={24} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-12 custom-scrollbar bg-white">
              {isLoading ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-300 gap-4">
                  <Loader2 className="animate-spin" size={48} />
                  <p className="text-xs font-black uppercase tracking-widest">Accessing Playbook...</p>
                </div>
              ) : (
                <div className="prose prose-burgundy max-w-none">
                  {/* Basic Markdown Rendering as Preformatted Text for now, beautifully boxed */}
                  <div className="bg-gray-50/50 p-8 rounded-3xl border border-gray-100 text-sm leading-relaxed text-gray-600 whitespace-pre-wrap font-medium font-serif">
                    {docContent}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-8 py-6 border-t border-gray-50 bg-gray-50/30 flex flex-col sm:flex-row justify-end gap-3">
               {canRequireAck && viewingDoc?.type === 'Policy' && !isLoading && docContent && (
                 <button
                   type="button"
                   disabled={ackBusy}
                   onClick={handleRequireAcknowledgement}
                   className="px-6 py-3 bg-gold-cream text-[#8A6A2E] border border-gold/30 font-black text-xs uppercase tracking-widest rounded-xl hover:bg-gold hover:text-white transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                 >
                   {ackBusy ? <Loader2 size={16} className="animate-spin" /> : <PenLine size={16} />}
                   Require acknowledgement
                 </button>
               )}
               <button 
                 onClick={() => setViewingDoc(null)}
                 className="px-8 py-3 bg-burgundy text-gold font-black text-xs uppercase tracking-widest rounded-xl shadow-lg shadow-burgundy/20 hover:scale-105 active:scale-95 transition-all"
               >
                 Close Playbook
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PoliciesPage;
