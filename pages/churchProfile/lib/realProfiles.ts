import { INITIAL_MEMBERS } from '../data/initialData';

const sampleNames = new Map(INITIAL_MEMBERS.map((member) => [member.id, member.fullName.trim()]));

/** A seeded profile the household has not renamed or replaced. */
export function isUnchangedSampleProfile(member: { id: string; fullName: string }): boolean {
  const sampleName = sampleNames.get(member.id);
  if (!sampleName) return false;
  return String(member.fullName || '').trim() === sampleName;
}
