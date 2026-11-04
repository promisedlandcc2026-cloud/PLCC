import React, { useState } from 'react';
import { X, Check, Milestone, Plus, Calendar, User, Sparkles } from 'lucide-react';
import { useChurch } from '../context/ChurchContext';
import { MembershipMilestone } from '../types';

interface AddMilestoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  memberId: string;
}

export const AddMilestoneModal: React.FC<AddMilestoneModalProps> = ({
  isOpen,
  onClose,
  memberId,
}) => {
  const { addMembershipMilestone, members } = useChurch();
  const member = members.find((m) => m.id === memberId);

  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [category, setCategory] = useState<MembershipMilestone['category']>('Membership');
  const [description, setDescription] = useState('');
  const [officiatedBy, setOfficiatedBy] = useState('');

  if (!isOpen || !member) return null;

  const quickPresets = [
    { title: 'Joined PLCC', cat: 'Membership', desc: 'Received into church fellowship during Sunday worship.' },
    { title: 'Baptized', cat: 'Baptism', desc: 'Water baptism in the sanctuary baptistery as a public confession of faith.' },
    { title: 'Ministry Lead Appointment', cat: 'Leadership', desc: 'Appointed and consecrated to lead ministry department.' },
    { title: 'Discipleship 101 Completion', cat: 'Discipleship', desc: 'Completed the 8-week kingdom foundations course.' },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date.trim()) return;

    addMembershipMilestone(memberId, {
      title: title.trim(),
      date: date.trim(),
      category,
      description: description.trim(),
      officiatedBy: officiatedBy.trim() || undefined,
    });

    // Reset and close
    setTitle('');
    setDate('');
    setDescription('');
    setOfficiatedBy('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-lg w-full border border-stone-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between bg-stone-50/70">
          <div className="flex items-center gap-2">
            <Milestone className="w-4 h-4 text-[#1d372c]" />
            <div>
              <h3 className="font-semibold text-stone-900 text-sm">
                Record Membership Journey Milestone
              </h3>
              <p className="text-[11px] text-stone-500">
                For {member.fullName} &middot; Church Spiritual Record
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Quick presets */}
          <div>
            <label className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider flex items-center gap-1 mb-1.5">
              <Sparkles className="w-3 h-3 text-[#C9A35A]" /> Common Milestones
            </label>
            <div className="flex flex-wrap gap-1.5">
              {quickPresets.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setTitle(p.title);
                    setCategory(p.cat as any);
                    if (!description) setDescription(p.desc);
                  }}
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-[#EEF3EF] hover:text-[#1d372c] text-stone-700 transition-colors"
                >
                  {p.title}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Milestone Title *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Joined PLCC, Baptized..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-[#1d372c]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Date Stamp *
              </label>
              <input
                type="text"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                placeholder="e.g. Oct 14, 2023 or Easter 2024"
                className="w-full px-3 py-2 text-xs rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-[#1d372c]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-[#1d372c] bg-white"
              >
                <option value="Membership">Membership (Joined church)</option>
                <option value="Baptism">Water Baptism / Dedication</option>
                <option value="Leadership">Ministry Lead Appointment</option>
                <option value="Discipleship">Discipleship & Foundations</option>
                <option value="Ordination">Ordination & Consecration</option>
                <option value="Service">Service Recognition</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Officiated / Presided By (Optional)
              </label>
              <input
                type="text"
                value={officiatedBy}
                onChange={(e) => setOfficiatedBy(e.target.value)}
                placeholder="e.g. Pastor Marcus Vance"
                className="w-full px-3 py-2 text-xs rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-[#1d372c]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">
              Description & Notes
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Significance of this milestone, scripture verse, or gathering details..."
              className="w-full px-3 py-2 text-xs rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-[#1d372c]"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-stone-600 hover:text-stone-900 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-[#1d372c] hover:bg-[#12231c] rounded-lg shadow-xs flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              Save Milestone
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
