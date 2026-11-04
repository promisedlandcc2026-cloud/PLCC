import { useCallback, useState } from 'react';
import { Child } from '../../../types';
import {
  createParentDependent,
  listParentDependents,
  updateParentDependent,
  ParentDependentError,
} from '../../../lib/parentDependentsClient';

type Dependents = Awaited<ReturnType<typeof listParentDependents>>;

/** Structured family records first, then legacy JSON-only entries that still need a record. */
export function mapDependents(deps: Dependents): Child[] {
  return [
    ...deps.structured.map((d) => ({
      id: d.id,
      name: d.name,
      age: d.age || '',
      notes: d.notes || undefined,
      structured: true,
      needsPromote: false,
      guardianOnly: d.guardianOnly === true,
    })),
    ...deps.legacyOnly.map((d) => ({
      id: d.id.startsWith('legacy-') ? undefined : d.id,
      name: d.name,
      age: d.age || '',
      notes: d.notes || undefined,
      structured: d.structured,
      needsPromote: d.needsPromote,
      legacyIndex: d.legacyIndex,
    })),
  ];
}

function mapChildrenJson(json: any[]): Child[] {
  return json.map((c: any) => ({
    id: c?.id ? String(c.id) : undefined,
    name: String(c?.name || 'Child'),
    age: c?.age != null ? String(c.age) : '',
    notes: c?.notes || undefined,
    structured: Boolean(c?.id),
    needsPromote: !c?.id,
  }));
}

function splitName(full: string, fallbackFirst = ''): { firstName: string; lastName?: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || fallbackFirst, lastName: parts.slice(1).join(' ') || undefined };
}

function describeError(err: unknown, fallback: string): string {
  if (err instanceof ParentDependentError) return err.message;
  const msg = (err as { message?: string } | null)?.message;
  return msg || fallback;
}

/**
 * Children are saved to their own family records immediately (add / promote / remove).
 * Only legacy entries without a record are removed locally and persist on "Save changes".
 */
export function useChildren() {
  const [children, setChildren] = useState<Child[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** True when a local-only (legacy) removal is waiting on Save changes. */
  const [pendingLocalChange, setPendingLocalChange] = useState(false);

  const applyResult = (json: unknown, fallback: Child[]) => {
    setChildren(Array.isArray(json) ? mapChildrenJson(json) : fallback);
  };

  /** The full list includes office-linked children that the saved JSON doesn't carry. */
  const reloadFromServer = async () => {
    try {
      setChildren(mapDependents(await listParentDependents()));
    } catch {
      /* keep what we have */
    }
  };

  const run = async (fallbackMessage: string, task: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(describeError(err, fallbackMessage));
    } finally {
      setBusy(false);
    }
  };

  const addChild = (name: string, age: string) =>
    run('Could not add child.', async () => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const result = await createParentDependent({ ...splitName(trimmed), age: age.trim() || undefined });
      const added: Child = {
        id: result.child.id,
        name: result.child.name,
        age: result.child.age || '',
        structured: true,
      };
      applyResult(result.childrenJson, [...children, added]);
      await reloadFromServer();
    });

  const promoteChild = (child: Child) =>
    run('Could not create family record.', async () => {
      const result = await createParentDependent({
        ...splitName(String(child.name || ''), 'Child'),
        age: child.age || undefined,
        notes: child.notes,
        legacyIndex: child.legacyIndex,
      });
      if (Array.isArray(result.childrenJson)) {
        applyResult(result.childrenJson, children);
      } else {
        setChildren(mapDependents(await listParentDependents()));
      }
    });

  const removeChild = (idx: number) => {
    const child = children[idx];
    if (!child) return Promise.resolve();
    const remaining = children.filter((_, i) => i !== idx);
    if (!child.id || String(child.id).startsWith('legacy-')) {
      setChildren(remaining);
      setPendingLocalChange(true);
      return Promise.resolve();
    }
    return run('Could not remove child.', async () => {
      const result = await updateParentDependent({ childId: child.id!, remove: true });
      applyResult(result.childrenJson, remaining);
      await reloadFromServer();
    });
  };

  const markSaved = useCallback(() => setPendingLocalChange(false), []);

  return {
    children,
    setChildren,
    busy,
    error,
    pendingLocalChange,
    markSaved,
    addChild,
    promoteChild,
    removeChild,
  };
}
