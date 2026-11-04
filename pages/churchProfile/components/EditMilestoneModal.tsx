import React, { useState, useEffect } from 'react';
import { X, Check, Milestone, Trash2, Calendar, User, Sparkles } from 'lucide-react';
import { useChurch } from '../context/ChurchContext';
import { MembershipMilestone } from '../types';

interface EditMilestoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  memberId: string;
  milestone: MembershipMilestone | null;
}

export const EditMilestoneModal: React.FC<EditMilestoneModalProps> = ({
  isOpen,
  onClose,
  memberId,
  milestone,
}) => {
  const { updateMembershipMilestone, deleteMembershipMilestone, members } = useChurch();
  const member = members.find((m) => m.id === memberId);

  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [category, setCategory] = useState<MembershipMilestone['category']>('Membership');
  const [description, setDescription] = useState('');
  const [officiatedBy, setOfficiatedBy] = useState('');

  useEffect(() => {
    if (milestone) {
      setTitle(milestone.title);
      setDate(milestone.date);
      setCategory(milestone.category);
      setDescription(milestone.description);
      setOfficiatedBy(milestone.officiatedBy || '');
    }
  }, [milestone]);

  if (!isOpen || !member || !milestone) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date.trim()) return;

    updateMembershipMilestone(memberId, milestone.id, {
      title: title.trim(),
      date: date.trim(),
      category,
      description: description.trim(),
      officiatedBy: officiatedBy.trim() || undefined,
    });

    onClose();
  };

  const handleDelete = () => {
    if (window.confirm(`Delete milestone "${milestone.title}" from this membership journey?`)) {
      deleteMembershipMilestone(memberId, milestone.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-lg w-full border border-stone-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between bg-stone-50/70">
          <div className="flex items-center gap-2">
            <Milestone className="w-4 h-4 text-[#1d372c]" />
            <div>
              <h3 className="font-semibold text-stone-900 text-sm">
                Edit Membership Journey Milestone
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
              Spiritual Milestone Notes / Description
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Significant scriptures, details, or memory of this milestone..."
              className="w-full px-3 py-2 text-xs rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-[#1d372c]"
            />
          </div>

          <div className="pt-3 border-t border-stone-100 flex items-center justify-between">
            <button
              type="button"
              onClick={handleDelete}
              className="text-xs text-rose-600 hover:text-rose-800 flex items-center gap-1 hover:underline"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Remove Milestone</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-stone-600 hover:bg-stone-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-[#1d372c] hover:bg-[#12231c] rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
