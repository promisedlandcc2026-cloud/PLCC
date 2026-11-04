import React, { useEffect, useRef, useState } from 'react';
import { MembershipMilestone } from '../types';
import { Edit2 } from 'lucide-react';

interface TimelineMilestoneItemProps {
  milestone: MembershipMilestone;
  index: number;
  canEdit?: boolean;
  onEdit?: (milestone: MembershipMilestone) => void;
}

export const TimelineMilestoneItem: React.FC<TimelineMilestoneItemProps> = ({
  milestone,
  index,
  canEdit = false,
  onEdit,
}) => {
  const itemRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = itemRef.current;
    if (!el) return;

    if (!('IntersectionObserver' in window)) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      {
        rootMargin: '0px 0px -30px 0px',
        threshold: 0.15,
      }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, []);

  // Compute a slight stagger delay (capped at 400ms so it doesn't feel sluggish)
  const staggerDelayMs = Math.min(index * 90, 400);

  return (
    <div
      ref={itemRef}
      style={{
        transitionDelay: `${staggerDelayMs}ms`,
      }}
      className={`relative group transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none motion-reduce:transform-none motion-reduce:opacity-100 ${
        isVisible
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-6 pointer-events-none'
      }`}
    >
      {/* Node Pin Marker */}
      <div
        className={`absolute -left-6 sm:-left-8 top-1 w-5 h-5 rounded-full border-2 border-white bg-[#1d372c] shadow-sm flex items-center justify-center text-white ring-2 ring-[#EEF3EF] transition-transform duration-500 ${
          isVisible ? 'scale-100' : 'scale-50'
        }`}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-[#C9A35A]" />
      </div>

      <div className="bg-stone-50/70 p-4 rounded-xl border border-stone-200/80 hover:border-stone-300 transition-colors space-y-2 hover:bg-stone-50">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold text-stone-900 group-hover:text-[#1d372c] transition-colors">
              {milestone.title}
            </h4>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-stone-200/80 text-stone-700">
              {milestone.category}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#1d372c] font-mono tabular-nums bg-white px-2.5 py-0.5 rounded-md border border-stone-200 shadow-2xs">
              {milestone.date}
            </span>
            {canEdit && onEdit && (
              <button
                type="button"
                onClick={() => onEdit(milestone)}
                className="p-1 text-stone-400 hover:text-[#1d372c] hover:bg-stone-200/60 rounded-md transition-colors"
                title="Edit Milestone"
              >
                <Edit2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        <p className="text-xs text-stone-600 leading-relaxed">
          {milestone.description}
        </p>

        {milestone.officiatedBy && (
          <div className="pt-2 border-t border-stone-200/60 text-[11px] text-stone-500 flex items-center gap-1.5">
            <span className="text-stone-400">Officiated / Presided by:</span>
            <span className="font-semibold text-stone-800">{milestone.officiatedBy}</span>
          </div>
        )}
      </div>
    </div>
  );
};
