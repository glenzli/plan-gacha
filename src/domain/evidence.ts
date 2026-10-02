import * as z from 'zod/v4';
/** Caller-supplied evidence; it is attribution, not independent authentication. */
export const evidenceSourceSchema = z.strictObject({ kind: z.enum(['user', 'provider', 'synthetic']), reference: z.string().min(1).max(1000), observedAt: z.iso.datetime({ offset: true }) });
export type EvidenceSource = z.infer<typeof evidenceSourceSchema>;
