import React, { useState } from 'react';
import { Baby, Loader2, Plus, X } from 'lucide-react';
import { Child } from '../../../types';
import { EmptyState, InlineError, SectionCard, inputClass } from './ui';

type Props = {
  children: Child[];
  busy: boolean;
  error: string | null;
  onAdd: (name: string, age: string) => Promise<void>;
  onPromote: (child: Child) => Promise<void>;
  onRemove: (idx: number) => Promise<void>;
};

const ChildrenSection: React.FC<Props> = ({ children, busy, error, onAdd, onPromote, onRemove }) => {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    await onAdd(name, age);
  };

  // Clear inputs once the list grows after an add (errors keep the typed values).
  const lastCount = React.useRef(children.length);
  React.useEffect(() => {
    if (children.length > lastCount.current) {
      setName('');
      setAge('');
    }
    lastCount.current = children.length;
  }, [children.length]);

  return (
    <SectionCard
      id="profile-children"
      icon={Baby}
      iconTone="gold"
      title="My children"
      subtitle="For My Family and check-in — no login needed"
    >
      <p className="text-[11px] text-gray-500 font-medium leading-relaxed -mt-1">
        Children don't need their own login, email, or phone. Adding a child here creates their church record right away.
      </p>

      <InlineError message={error} />

      <ul className="space-y-2">
        {children.map((child, idx) => (
          <li
            key={child.id || `child-${idx}`}
            className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-2.5"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                aria-hidden
                className="w-9 h-9 rounded-full bg-white border border-gray-100 flex items-center justify-center text-burgundy font-black text-sm shrink-0"
              >
                {(child.name || '?').charAt(0)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#0d1a14] truncate">{child.name}</p>
                <p className="text-xs text-gray-600 font-medium">
                  {child.age ? `${child.age} years old` : 'Age not set'}
                  {child.needsPromote ? <span className="ml-2 text-amber-700">Needs family record</span> : null}
                  {child.guardianOnly ? <span className="ml-2 text-burgundy/70">Linked by the church office</span> : null}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {child.needsPromote ? (
                <button
                  type="button"
                  onClick={() => void onPromote(child)}
                  disabled={busy}
                  className="px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide text-burgundy bg-white border border-burgundy/15 rounded-lg disabled:opacity-50"
                >
                  Create record
                </button>
              ) : null}
              {child.guardianOnly ? null : (
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Remove ${child.name || 'this child'} from your family?`)) void onRemove(idx);
                }}
                disabled={busy}
                aria-label={`Remove ${child.name}`}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-white rounded-lg disabled:opacity-50"
              >
                <X size={16} />
              </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {children.length === 0 && <EmptyState>No children listed yet.</EmptyState>}

      <form onSubmit={submit} className="flex gap-2">
        <label className="sr-only" htmlFor="new-child-name">
          Child name
        </label>
        <input
          id="new-child-name"
          placeholder="Child's full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${inputClass} flex-1 min-w-0 h-11 px-3 text-sm`}
        />
        <label className="sr-only" htmlFor="new-child-age">
          Age
        </label>
        <input
          id="new-child-age"
          placeholder="Age"
          inputMode="numeric"
          value={age}
          onChange={(e) => setAge(e.target.value.replace(/[^\d]/g, '').slice(0, 2))}
          className={`${inputClass} !w-20 shrink-0 h-11 px-3 text-sm text-center`}
        />
        <button
          type="submit"
          disabled={!name.trim() || busy}
          aria-label="Add child"
          className="h-11 w-11 shrink-0 bg-burgundy text-gold rounded-xl flex items-center justify-center disabled:opacity-50"
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
        </button>
      </form>
    </SectionCard>
  );
};

export default ChildrenSection;
