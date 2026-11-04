import { z } from 'zod';

export const CreateFundSchema = z.object({ name: z.string().min(1), description: z.string().optional(), isActive: z.boolean().default(true) });
export const CreatePledgeSchema = z.object({ memberId: z.string().uuid(), fundId: z.string().uuid(), amount: z.number().positive(), startDate: z.string().optional(), endDate: z.string().optional(), frequency: z.enum(['Once', 'Weekly', 'Bi-Weekly', 'Monthly', 'Yearly']).default('Once'), notes: z.string().optional() });
export const CreateLedgerEntrySchema = z.object({ date: z.string().optional(), description: z.string().min(1), amount: z.number(), type: z.enum(['Inflow', 'Outflow']), fundId: z.string().uuid().optional(), category: z.string().optional(), status: z.enum(['Draft', 'Pending', 'Finalized']).default('Draft'), referenceId: z.string().optional() });
export const CreateSessionSchema = z.object({
    date: z.string().optional(),
    leadCounter: z.string(),
    notes: z.string().optional(),
    name: z.string().optional(),
});
export const UpdateSessionSchema = z.object({ id: z.string().uuid(), status: z.enum(['Draft', 'Locked', 'Archived']).optional(), leadCounter: z.string().optional(), notes: z.string().optional(), cashTotal: z.number().optional(), checksTotal: z.number().optional(), digitalTotal: z.number().optional(), grandTotal: z.number().optional(), counts: z.record(z.string(), z.number()).optional(), givingTransactions: z.array(z.object({ memberId: z.string().uuid().optional(), fundId: z.string().uuid(), amount: z.number().positive(), date: z.string().optional(), source: z.string(), notes: z.string().optional() })).optional() });
export const CreateExpenseSchema = z.object({ vendor: z.string().min(1), amount: z.number().positive(), category: z.string().optional(), description: z.string().optional(), requester: z.string().min(1) });
export const CreateGivingTransactionSchema = z.object({ memberId: z.string().uuid().optional(), fundId: z.string().uuid(), amount: z.number().positive(), date: z.string().optional(), source: z.string(), referenceId: z.string().optional(), notes: z.string().optional(), batchId: z.string().uuid().optional() });
export const VideoSchema = z.object({ title: z.string().min(1), type: z.enum(['YouTube', 'Vimeo', 'Custom']), url: z.string().url(), scheduleNote: z.string().optional() });
export const HowToVideoSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  videoUrl: z.string().url(),
  thumbnailUrl: z.string().url(),
  category: z.enum(['vault', 'connect', 'dcb', 'tithe']).optional().default('vault'),
});
export const HowToVideoUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  videoUrl: z.string().url().optional(),
  thumbnailUrl: z.string().url().optional(),
  category: z.enum(['vault', 'connect', 'dcb', 'tithe']).optional(),
}).refine(
  (v) =>
    v.title !== undefined ||
    v.description !== undefined ||
    v.videoUrl !== undefined ||
    v.thumbnailUrl !== undefined ||
    v.category !== undefined,
  { message: 'At least one field is required' }
);
