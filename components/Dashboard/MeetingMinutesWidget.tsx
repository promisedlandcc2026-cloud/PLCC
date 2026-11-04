import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, ChevronRight, Clock, AlertCircle, X } from 'lucide-react';
import { MeetingMinutes, Section } from '../../types';
import { useNav } from '../../App';
import {
  isDismissed,
  dismissHomeItem,
  minutesDismissalKey,
} from '../../lib/dashboardHomeDismissals';
import HomeTeensZone from './HomeTeensZone';

interface MeetingMinutesWidgetProps {
  userId: string | null;
  /** Bump when Home archive restores a dismissal so the widget refilters. */
  dismissalRevision?: number;
  onDismissed?: () => void;
}

const MeetingMinutesWidget: React.FC<MeetingMinutesWidgetProps> = ({
  userId,
  dismissalRevision = 0,
  onDismissed,
}) => {
  const navigate = useNavigate();
  const { setActiveSection } = useNav();
  const [pendingMinutes, setPendingMinutes] = useState<MeetingMinutes[]>([]);
  const [loading, setLoading] = useState(true);

  const goToMinutes = (path: string) => {
    setActiveSection(Section.Communication);
    navigate(path);
  };

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        const res = await fetch('/api/minutes?resource=minutes');
        const data = await res.json();

        if (data.ok) {
          const docs = data.documents as MeetingMinutes[];
          const reaqSigDocs = docs.filter((d) => d.require_signature);

          const ackRes = await fetch(
            `/api/minutes?resource=minutes&subResource=acknowledgements&userId=${userId}`
          );
          const ackData = await ackRes.json();

          if (ackData.ok) {
            const signedIds = new Set(
              ackData.acknowledgements.map((a: any) => a.document_id)
            );
            const pending = reaqSigDocs.filter((d) => !signedIds.has(d.id));
            setPendingMinutes(pending);
          }
        }
      } catch (err) {
        console.error('Dashboard Widget Error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [userId]);

  const visiblePending = useMemo(() => {
    return pendingMinutes.filter(
      (d) => !isDismissed(userId, minutesDismissalKey(d.id))
    );
    // dismissalRevision forces recompute after dismiss/restore
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingMinutes, userId, dismissalRevision]);

  const handleDismiss = (doc: MeetingMinutes, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!userId) return;
    dismissHomeItem(userId, minutesDismissalKey(doc.id), {
      title: doc.title || 'Pending signature',
      kind: 'minutes',
    });
    onDismissed?.();
  };

  if (loading) return null;

  // Same Home slot: signatures when needed, teens zone when you're clear.
  if (visiblePending.length === 0) {
    return <HomeTeensZone />;
  }

  return (
    <div className="bg-white rounded-[2rem] border border-burgundy/10 shadow-sm overflow-hidden animate-in slide-in-from-right-4">
      <div className="bg-burgundy p-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-gold">
            <FileText size={20} />
          </div>
          <div>
            <h3 className="font-black text-white text-sm tracking-tight">PENDING SIGNATURES</h3>
            <p className="text-[10px] font-bold text-gold/60 uppercase tracking-widest">
              Leadership Protocol
            </p>
          </div>
        </div>
        <div className="px-3 py-1 bg-gold text-burgundy text-[10px] font-black rounded-lg shadow-lg">
          {visiblePending.length} ACTION REQD
        </div>
      </div>

      <div className="p-4 space-y-3">
        {visiblePending.slice(0, 3).map((doc) => (
          <div
            key={doc.id}
            className="w-full flex items-center gap-3 p-4 rounded-2xl hover:bg-gray-50 transition-all border border-transparent hover:border-burgundy/5 group"
          >
            <button
              type="button"
              onClick={() => goToMinutes(`/communication/minutes/${doc.id}`)}
              className="flex-1 flex items-center gap-4 min-w-0 text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-burgundy/5 text-burgundy flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <Clock size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-[#0d1a14] text-sm truncate">{doc.title}</h4>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[9px] font-black text-gold uppercase tracking-tighter bg-gold/5 px-2 rounded-md">
                    {doc.department}
                  </span>
                  <span className="text-[9px] font-bold text-gray-400 capitalize">
                    {new Date(doc.meeting_date).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <ChevronRight
                size={16}
                className="text-gray-300 group-hover:text-burgundy transition-colors shrink-0"
              />
            </button>
            <button
              type="button"
              onClick={(e) => handleDismiss(doc, e)}
              className="p-2 rounded-xl text-gray-300 hover:text-burgundy hover:bg-burgundy/5 shrink-0"
              title="Hide from Home (still available in Minutes)"
              aria-label={`Hide ${doc.title} from Home`}
            >
              <X size={16} />
            </button>
          </div>
        ))}

        {visiblePending.length > 3 && (
          <button
            type="button"
            onClick={() => goToMinutes('/communication/minutes')}
            className="w-full py-3 text-center text-[10px] font-black text-burgundy/40 uppercase tracking-widest hover:text-burgundy transition-colors"
          >
            See All Pending (+{visiblePending.length - 3})
          </button>
        )}
      </div>

      <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-50 flex items-center gap-2">
        <AlertCircle size={12} className="text-burgundy/40" />
        <p className="text-[9px] font-bold text-gray-400">
          Formal acknowledgement required by policy. Dismiss hides this on Home only.
        </p>
      </div>
    </div>
  );
};

export default MeetingMinutesWidget;
