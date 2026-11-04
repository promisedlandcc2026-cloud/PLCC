import React from 'react';
import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';

type Props = {
  isDirty: boolean;
  isSaving: boolean;
  justSaved: boolean;
  canSave: boolean;
  onSave: () => void;
  onDiscard: () => void;
  variant: 'header' | 'mobile';
};

const SaveButton: React.FC<Pick<Props, 'isSaving' | 'canSave' | 'onSave'> & { className: string }> = ({
  isSaving,
  canSave,
  onSave,
  className,
}) => (
  <button type="button" onClick={onSave} disabled={isSaving || !canSave} className={className}>
    {isSaving ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
    {isSaving ? 'Saving…' : 'Save changes'}
  </button>
);

const Status: React.FC<Pick<Props, 'isDirty' | 'justSaved'>> = ({ isDirty, justSaved }) =>
  justSaved && !isDirty ? (
    <span role="status" className="flex items-center gap-1.5 text-green-700 font-bold text-xs uppercase tracking-widest">
      <CheckCircle2 size={16} /> Saved
    </span>
  ) : isDirty ? (
    <span role="status" className="text-amber-700 font-bold text-[11px] uppercase tracking-widest">
      Unsaved changes
    </span>
  ) : null;

/**
 * Header variant (md+) sits beside the page title.
 * Mobile variant is a sticky bottom bar that only appears when there is something to save.
 */
const SaveBar: React.FC<Props> = ({ isDirty, isSaving, justSaved, canSave, onSave, onDiscard, variant }) => {
  if (variant === 'header') {
    return (
      <div className="hidden md:flex items-center gap-3">
        <Status isDirty={isDirty} justSaved={justSaved} />
        {isDirty && !isSaving ? (
          <button
            type="button"
            onClick={onDiscard}
            className="px-4 py-3 text-xs font-black uppercase tracking-widest text-gray-600 hover:text-burgundy"
          >
            Discard
          </button>
        ) : null}
        <SaveButton
          isSaving={isSaving}
          canSave={canSave && isDirty}
          onSave={onSave}
          className="px-6 py-3 bg-burgundy text-gold font-black text-xs uppercase tracking-widest rounded-xl shadow-lg shadow-burgundy/15 hover:bg-burgundy-dark transition-all active:scale-[0.98] disabled:opacity-50 flex items-center gap-2"
        />
      </div>
    );
  }

  if (!isDirty && !isSaving && !justSaved) return null;

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-white/95 backdrop-blur-xl border-t border-gray-100 z-[80] flex items-center gap-3 animate-in slide-in-from-bottom-4 duration-200">
      {justSaved && !isDirty ? (
        <p role="status" className="flex-1 flex items-center justify-center gap-2 h-12 text-green-700 font-black text-xs uppercase tracking-widest">
          <CheckCircle2 size={18} /> Saved
        </p>
      ) : (
        <>
          <button
            type="button"
            onClick={onDiscard}
            disabled={isSaving}
            className="h-12 px-4 rounded-xl border border-gray-200 text-xs font-black uppercase tracking-widest text-gray-600 disabled:opacity-50"
          >
            Discard
          </button>
          <SaveButton
            isSaving={isSaving}
            canSave={canSave}
            onSave={onSave}
            className="flex-1 h-12 bg-burgundy text-gold font-black uppercase tracking-widest text-xs rounded-xl shadow-lg flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-60"
          />
        </>
      )}
    </div>
  );
};

export default SaveBar;
