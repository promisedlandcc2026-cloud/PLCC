
import React, { useState, useEffect } from 'react';
import {
  Workflow,
  Plus,
  Users,
  Zap,
  Settings,
  ArrowRight,
  Clock,
  Mail,
  MessageSquare,
  CheckSquare,
  Loader2,
  X,
  Target,
  UserPlus
} from 'lucide-react';
import { FollowUpWorkflow, FollowUpWorkflowStep, FollowUpTemplate } from '../../types';

import { authedFetch } from '../../lib/authedFetch';
const FollowUpWorkflowsPage: React.FC = () => {
  const [workflows, setWorkflows] = useState<FollowUpWorkflow[]>([]);
  const [templates, setTemplates] = useState<FollowUpTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newWorkflow, setNewWorkflow] = useState<{ id?: string; name: string; description: string }>({ name: '', description: '' });
  const [newSteps, setNewSteps] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  // Detail/Enroll Modal State
  const [selectedWorkflow, setSelectedWorkflow] = useState<FollowUpWorkflow | null>(null);
  const [enrollMemberId, setEnrollMemberId] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  useEffect(() => {
    fetchWorkflows();
    fetchTemplates();
  }, []);

  useEffect(() => {
    if (memberSearch.length > 2) {
      searchMembers();
    } else {
      setSearchResults([]);
    }
  }, [memberSearch]);

  const fetchWorkflows = async () => {
    try {
      const res = await authedFetch('/api/vault?resource=tools&subResource=followup_workflows');
      const data = await res.json();
      if (data.ok) setWorkflows(data.workflows);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const fetchTemplates = async () => {
    try {
      const res = await authedFetch('/api/vault?resource=tools&subResource=followup_templates');
      const data = await res.json();
      if (data.ok) setTemplates(data.templates);
    } catch (err) { console.error(err); }
  };

  const searchMembers = async () => {
    try {
      const res = await authedFetch(`/api/vault?resource=people&query=${memberSearch}`);
      const data = await res.json();
      if (data.ok) setSearchResults(data.members);
    } catch (err) { console.error(err); }
  };

  const handleAddStep = () => {
    setNewSteps([...newSteps, {
      step_order: newSteps.length + 1,
      name: 'New Step',
      type: 'Email',
      delay_days: 0,
      template_id: ''
    }]);
  };

  const updateStep = (index: number, field: string, value: any) => {
    const updated = [...newSteps];
    updated[index] = { ...updated[index], [field]: value };
    setNewSteps(updated);
  };

  const removeStep = (index: number) => {
    const updated = newSteps.filter((_, i) => i !== index).map((s, i) => ({ ...s, step_order: i + 1 }));
    setNewSteps(updated);
  }

  const handleEditWorkflow = (wf: FollowUpWorkflow) => {
    setNewWorkflow({
      id: wf.id,
      name: wf.name,
      description: wf.description || ''
    });
    // Deep copy steps
    if (wf.steps) {
      setNewSteps(wf.steps.map(s => ({
        ...s,
        template_id: s.template?.id || s.template_id // Ensure ID is preserved
      })));
    } else {
      setNewSteps([]);
    }
    setIsCreateOpen(true);
  };

  const handleSaveWorkflow = async () => {
    setSaving(true);
    try {
      const payload = { ...newWorkflow, steps: newSteps };
      const method = (newWorkflow as any).id ? 'PATCH' : 'POST';

      const res = await authedFetch('/api/vault?resource=tools&subResource=followup_workflows', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        await fetchWorkflows();
        setIsCreateOpen(false);
        setNewWorkflow({ name: '', description: '' });
        setNewSteps([]);
      }
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  const handleEnroll = async () => {
    if (!selectedWorkflow || !enrollMemberId) return;
    setEnrolling(true);
    try {
      const res = await authedFetch(`/api/vault?resource=tools&subResource=followup_workflows&action=enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: enrollMemberId, workflow_id: selectedWorkflow.id })
      });
      if (res.ok) {
        alert("Member Successfully Enrolled!");
        setEnrollMemberId('');
        setMemberSearch('');
        setSelectedWorkflow(null);
      } else {
        alert("Enrollment Failed.");
      }
    } catch (err) { console.error(err); } finally { setEnrolling(false); }
  };

  const getStepIcon = (type: string) => {
    switch (type) {
      case 'Email': return <Mail size={14} />;
      case 'SMS': return <MessageSquare size={14} />;
      case 'Task': return <CheckSquare size={14} />;
      case 'Wait': return <Clock size={14} />;
      default: return <Target size={14} />;
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-extrabold text-[#0d1a14] mb-2 tracking-tight">Ministry Pathways</h1>
          <p className="text-gray-400 font-medium">Design automated sequences and guide members through milestones.</p>
        </div>
        <button
          onClick={() => {
            setNewWorkflow({ name: '', description: '' });
            setNewSteps([]);
            setIsCreateOpen(true);
          }}
          className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-burgundy text-gold font-bold text-sm shadow-xl shadow-burgundy/20 hover:bg-burgundy-dark transition-all active:scale-95 border-b-2 border-gold/30"
        >
          <Plus size={18} />
          Launch Pathway
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-gray-300" size={32} /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {workflows.map(wf => (
            <div key={wf.id} className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden flex flex-col group hover:shadow-xl transition-all border-l-4 border-l-transparent hover:border-l-burgundy relative max-w-xl">
              <div className="p-6 sm:p-8 flex flex-col h-full">
                <div className="flex items-start justify-between mb-6">
                  <div className="w-12 h-12 rounded-xl bg-burgundy/5 text-burgundy flex items-center justify-center shadow-inner transition-colors group-hover:bg-burgundy group-hover:text-gold">
                    <Zap size={24} />
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleEditWorkflow(wf)}
                      className="p-2 text-gray-400 hover:text-burgundy hover:bg-gray-50 rounded-lg transition-all"
                      title="Settings"
                    >
                      <Settings size={16} />
                    </button>
                  </div>
                </div>

                <div className="flex-1">
                  <h3 className="text-xl font-bold text-[#0d1a14] mb-2 group-hover:text-burgundy transition-colors">{wf.name}</h3>
                  <p className="text-xs sm:text-sm text-gray-500 font-medium leading-relaxed line-clamp-2 mb-6">
                    {wf.description || "Automated care sequence for ministry milestones."}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-gray-50 mt-auto">
                  <div className="flex items-center gap-2">
                    <Users size={14} className="text-gray-300" />
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Pipeline Active</span>
                  </div>
                  <button
                    onClick={() => setSelectedWorkflow(wf)}
                    className="px-5 py-2.5 bg-gray-50 text-burgundy font-black text-[10px] uppercase tracking-widest rounded-xl border border-transparent hover:bg-burgundy hover:text-gold hover:shadow-lg hover:shadow-burgundy/20 transition-all flex items-center gap-2"
                  >
                    Enroll Member
                    <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {workflows.length === 0 && (
            <div className="col-span-full py-20 text-center text-gray-400 font-medium bg-gray-50 rounded-[3rem] border border-dashed border-gray-200">
              No pathways found. Create one to automate your care.
            </div>
          )}
        </div>
      )}

      {/* CREATE WORKFLOW MODAL */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-2xl max-h-[90vh] overflow-y-auto p-8 shadow-2xl animate-in zoom-in-95 duration-200 custom-scrollbar">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-[#0d1a14]">{(newWorkflow as any).id ? 'Edit' : 'Design New'} Pathway</h2>
              <button onClick={() => setIsCreateOpen(false)} className="p-2 bg-gray-50 rounded-full hover:bg-gray-100"><X size={20} /></button>
            </div>

            <div className="space-y-6">
              <div className="space-y-4">
                <input
                  className="w-full p-4 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-gold/50 outline-none font-black text-xl text-[#0d1a14]"
                  placeholder="Pathway Name"
                  value={newWorkflow.name}
                  onChange={e => setNewWorkflow({ ...newWorkflow, name: e.target.value })}
                />
                <textarea
                  className="w-full p-4 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-gold/50 outline-none font-medium text-gray-600"
                  placeholder="Description..."
                  value={newWorkflow.description}
                  onChange={e => setNewWorkflow({ ...newWorkflow, description: e.target.value })}
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest">Workflow Steps</h3>
                  <button onClick={handleAddStep} className="text-gold font-bold text-xs uppercase tracking-widest hover:text-burgundy">+ Add Step</button>
                </div>

                <div className="space-y-3">
                  {newSteps.map((step, idx) => (
                    <div key={idx} className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-3 relative group">
                      <button onClick={() => removeStep(idx)} className="absolute top-2 right-2 p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><X size={14} /></button>
                      <div className="flex gap-3">
                        <span className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-xs font-bold text-gray-400 shadow-sm border border-gray-100">{idx + 1}</span>
                        <input
                          className="bg-transparent font-bold text-[#0d1a14] outline-none w-full"
                          placeholder="Step Name"
                          value={step.name}
                          onChange={e => updateStep(idx, 'name', e.target.value)}
                        />
                      </div>
                      <div className="flex gap-2">
                        <select
                          className="bg-white px-2 py-1 rounded-lg text-xs font-bold text-gray-500 outline-none border border-gray-200"
                          value={step.type}
                          onChange={e => updateStep(idx, 'type', e.target.value)}
                        >
                          {['Email', 'SMS', 'Task', 'Wait'].map(t => <option key={t} value={t}>{t}</option>)}
                        </select>

                        <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-lg border border-gray-200">
                          <Clock size={12} className="text-gray-400" />
                          <input
                            type="number"
                            className="w-8 outline-none text-xs font-bold text-gray-600"
                            value={step.delay_days}
                            onChange={e => updateStep(idx, 'delay_days', parseInt(e.target.value))}
                          />
                          <span className="text-[10px] text-gray-400 uppercase font-bold">Days Later</span>
                        </div>

                        {(step.type === 'Email' || step.type === 'SMS') && (
                          <select
                            className="bg-white px-2 py-1 rounded-lg text-xs font-bold text-gray-500 outline-none border border-gray-200 flex-1"
                            value={step.template_id || ''}
                            onChange={e => updateStep(idx, 'template_id', e.target.value)}
                          >
                            <option value="">Select Template...</option>
                            {templates.filter(t => t.type === step.type).map(t => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={handleSaveWorkflow}
                disabled={saving || !newWorkflow.name}
                className="w-full py-4 bg-burgundy text-gold font-black text-sm uppercase tracking-widest rounded-xl hover:bg-burgundy-dark transition-all shadow-lg shadow-burgundy/20 disabled:opacity-50 mt-4"
              >
                {saving ? 'Creating...' : 'Launch Pathway'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ENROLL MODAL */}
      {selectedWorkflow && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-lg p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-black text-[#0d1a14]">{selectedWorkflow.name}</h2>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Enroll Member</p>
              </div>
              <button onClick={() => setSelectedWorkflow(null)} className="p-2 bg-gray-50 rounded-full hover:bg-gray-100"><X size={20} /></button>
            </div>

            <div className="space-y-6">

              {/* Workflow Preview */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 max-h-48 overflow-y-auto custom-scrollbar">
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Pipeline Steps</h4>
                {(selectedWorkflow as any).steps?.map((step: any, idx: number) => (
                  <div key={idx} className="flex gap-3 mb-3 last:mb-0">
                    <div className="flex flex-col items-center">
                      <div className="w-2 h-2 rounded-full bg-gold shrink-0 mt-1.5" />
                      {idx !== ((selectedWorkflow as any).steps.length - 1) && <div className="w-0.5 h-full bg-gray-200 my-1" />}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[#0d1a14]">{step.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="flex items-center gap-1 text-[10px] font-bold text-gray-400 bg-white px-1.5 py-0.5 rounded shadow-sm">
                          {getStepIcon(step.type)} {step.type}
                        </span>
                        {step.delay_days > 0 && <span className="text-[10px] text-gray-400 font-medium">+{step.delay_days}d delay</span>}
                      </div>
                    </div>
                  </div>
                ))}
                {(!(selectedWorkflow as any).steps || (selectedWorkflow as any).steps.length === 0) && <p className="text-xs text-gray-400 italic">No steps defined.</p>}
              </div>

              {/* Member Search */}
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Select Member</label>
                <input
                  className="w-full p-4 bg-white border border-gray-200 rounded-xl focus:border-gold outline-none font-medium text-[#0d1a14]"
                  placeholder="Search by name..."
                  value={memberSearch}
                  onChange={e => { setMemberSearch(e.target.value); setEnrollMemberId(''); }}
                />
                {searchResults.length > 0 && !enrollMemberId && (
                  <div className="mt-2 bg-white border border-gray-100 rounded-xl shadow-lg max-h-40 overflow-y-auto custom-scrollbar">
                    {searchResults.map(m => (
                      <button
                        key={m.id}
                        onClick={() => { setEnrollMemberId(m.id); setMemberSearch(`${m.first_name} ${m.last_name}`); setSearchResults([]); }}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-3 border-b border-gray-50 last:border-0"
                      >
                        <div className="w-6 h-6 rounded-full bg-burgundy/10 text-burgundy font-black text-xs flex items-center justify-center">{(m.first_name?.[0] || '')}</div>
                        <p className="text-sm font-bold text-gray-700">{m.first_name} {m.last_name}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={handleEnroll}
                disabled={enrolling || !enrollMemberId}
                className="w-full py-4 bg-gold text-burgundy font-black text-sm uppercase tracking-widest rounded-xl hover:bg-gold-dark transition-all shadow-lg shadow-gold/20 disabled:opacity-50 mt-2 flex items-center justify-center gap-2"
              >
                {enrolling ? <Loader2 className="animate-spin" /> : <UserPlus size={18} />}
                {enrolling ? 'Enrolling...' : 'Start Workflow'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default FollowUpWorkflowsPage;