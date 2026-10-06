import * as z from 'zod/v4';
import { constants } from 'node:fs';
import { lstat, realpath, open } from 'node:fs/promises';
import { resolve, dirname, basename, join } from 'node:path';
import { canonical, hash, parseState, TRIPCTL_CORE_VERSION } from './engine';
import { MAX_STORE_BYTES } from './limits';
import { TripError, type TripState } from './schema';
import { auditEvents, checkpointOf, checkpointLibrarySchema, createHistoryCheckpoint, contentAt, historicalSources, storageIdentity, originalDateRestriction, eventMetadata, anchorRevision } from './storage2';
import { previewHistoryMaintenance } from './historyMaintenance';
import { loadStore, withLock, fileHash, serializeState, exclusiveWrite, atomicWriteBytes } from './store';
const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/);
export const compactionRequestSchema = z.strictObject({ asOf: z.iso.datetime({ offset: true }), expectedJourneyId: z.string().min(1), expectedRevision: z.number().int().nonnegative(), expectedStateHash: digest, expectedFileHash: digest, actor: z.string().min(1).max(200), reason: z.string().min(1).max(4000), sourceLibrary: checkpointLibrarySchema.optional() });
const identity = z.strictObject({ storageFormat: z.union([z.literal(1), z.literal(2)]), stateHashScope: z.enum(['canonical-format-1-state', 'content-and-audit-head-v2']), stateHash: digest, contentHash: digest, auditHeadHash: digest.nullable(), containerHash: digest, fileHash: digest, fileBytes: z.number().int().nonnegative() });
export const compactionReportSchema = z.strictObject({ reportVersion: z.literal(1), coreVersion: z.number().int().positive(), request: compactionRequestSchema, paths: z.strictObject({ source: z.string(), candidate: z.string(), report: z.string(), localRecoveryCheckpoint: z.string() }), source: identity, candidate: identity,
  proof: z.strictObject({ currentContentHash: digest, allOriginalMetadataRetained: z.literal(true), metadataCount: z.number().int().nonnegative(), fullRecoveryFromRevision: z.number().int().nonnegative(), fullRecoverableRevisionsCompared: z.number().int().nonnegative(), historicalIdentityVersionsRetained: z.literal(true), originalDateSourcesRetained: z.literal(true) }),
  effect: z.strictObject({ globalRevisionUnchanged: z.literal(true), archiveMetadata: z.number().int().nonnegative(), recentFullEvents: z.number().int().nonnegative(), newlyRemovedTechnicalEventDeltas: z.number().int().positive(), businessEventsDeleted: z.literal(0), metadataDeleted: z.literal(0), mechanicalSummaryCards: z.number().int().nonnegative(), physicalSavingsBytes: z.number().int(), candidateIsSmaller: z.boolean() }),
  recovery: z.strictObject({ localCheckpointCreated: z.literal(false), recoveryExternallyVerified: z.literal(false), sourceLibrary: checkpointLibrarySchema.nullable(), fullOlderSnapshots: z.literal('prior_full_version_required'), localCommitRecovery: z.literal('one_replaceable_exact_file_checkpoint') }), saved: z.literal(false), durability: z.literal('candidate_only'), warnings: z.array(z.string()),
});
type Report = z.infer<typeof compactionReportSchema>;
const fail = (code: string, message: string): never => { throw new TripError(code, message); };
async function checkPaths(paths: Report['paths'], outputsMayExist: boolean) {
  const names = new Set<string>(); const inodes = new Set<string>();
  for (const [key, path] of Object.entries(paths)) {
    const name = join(await realpath(dirname(path)), basename(path)); if (names.has(name)) fail('invalid_output', 'Source, candidate, report and recovery paths must differ'); names.add(name);
    try { const stat = await lstat(path); if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) fail('invalid_file', 'Checkpoint paths must be regular single-link files'); const inode = `${stat.dev}:${stat.ino}`; if (inodes.has(inode)) fail('invalid_output', 'Checkpoint paths alias one file'); inodes.add(inode); if (!outputsMayExist && (key === 'candidate' || key === 'report')) fail('already_exists', 'Candidate and report are exclusive outputs'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; if (key === 'source') throw error; }
  }
}
async function readReviewedReport(path: string) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat(); if (!info.isFile() || info.size > MAX_STORE_BYTES) fail('invalid_compaction_report', 'Report must be a bounded regular JSON file');
    const raw = await handle.readFile(); if (raw.length > MAX_STORE_BYTES) fail('invalid_compaction_report', 'Report grew beyond its bound');
    try { return compactionReportSchema.parse(JSON.parse(raw.toString('utf8'))); }
    catch { return fail('invalid_compaction_report', 'Unable to read the complete reviewed report'); }
  } finally { await handle.close(); }
}
function effect(original: Awaited<ReturnType<typeof loadStore>>, candidate: TripState, raw: string | Buffer) {
  const checkpoint = checkpointOf(candidate)!; const bytes = Buffer.byteLength(raw);
  return { globalRevisionUnchanged: true, archiveMetadata: checkpoint.archive.length, recentFullEvents: candidate.history.length, newlyRemovedTechnicalEventDeltas: checkpoint.revision - anchorRevision(original.state), businessEventsDeleted: 0, metadataDeleted: 0, mechanicalSummaryCards: checkpoint.summaries.length, physicalSavingsBytes: original.raw.length - bytes, candidateIsSmaller: bytes < original.raw.length };
}
const identityToken = (c: ReturnType<typeof historicalSources>[number]) => hash({ tripId: c.snapshot.trip.id, plans: c.snapshot.trip.plans, lodgings: c.snapshot.trip.lodgings, baseline: c.itinerary?.baseline || null, current: c.itinerary?.current || null, registered: c.itinerary?.registeredActivityIds || null, replacements: c.linkage?.actualChanges || null });
/** Prefix technical snapshots deliberately are not called lossless or reconstructed from summaries. */
export function proveHistoryCheckpoint(originalInput: unknown, candidateInput: unknown) {
  const original = parseState(originalInput); const candidate = parseState(candidateInput); const checkpoint = checkpointOf(candidate);
  if (!checkpoint || original.revision !== candidate.revision || canonical(original.content) !== canonical(candidate.content)) return fail('compaction_mismatch', 'Checkpoint changed current content/revision or is absent');
  const before = auditEvents(original).map(eventMetadata); const after = auditEvents(candidate).map(eventMetadata);
  if (canonical(before) !== canonical(after)) fail('compaction_mismatch', 'Checkpoint changed or removed original event metadata, nested business reasons or receipts');
  for (let r = checkpoint.revision; r <= candidate.revision; r++) if (canonical(contentAt(original, r)) !== canonical(contentAt(candidate, r))) fail('compaction_mismatch', 'Recent recovery state differs');
  const identities = new Set(historicalSources(candidate).map(identityToken)); if (historicalSources(original).some((c) => !identities.has(identityToken(c)))) fail('compaction_mismatch', 'A raw historical entity version disappeared');
  for (const event of before) if (canonical(originalDateRestriction(original, event)) !== canonical(originalDateRestriction(candidate, event))) fail('compaction_mismatch', 'Historical dated source watermark changed');
  return { currentContentHash: hash(candidate.content), allOriginalMetadataRetained: true as const, metadataCount: before.length, fullRecoveryFromRevision: checkpoint.revision, fullRecoverableRevisionsCompared: candidate.revision - checkpoint.revision + 1, historicalIdentityVersionsRetained: true as const, originalDateSourcesRetained: true as const };
}
function build(state: TripState, request: z.infer<typeof compactionRequestSchema>) {
  const review = previewHistoryMaintenance(state, { asOf: request.asOf, expectedRevision: request.expectedRevision, expectedStateHash: request.expectedStateHash });
  return parseState(createHistoryCheckpoint(state, { createdAt: request.asOf, actor: request.actor, reason: request.reason, sourceFileHash: request.expectedFileHash, ...(request.sourceLibrary ? { sourceLibrary: request.sourceLibrary } : {}), summaries: review.summaries }));
}
function guard(loaded: Awaited<ReturnType<typeof loadStore>>, q: z.infer<typeof compactionRequestSchema>) {
  if (loaded.state.content.snapshot.trip.id !== q.expectedJourneyId || loaded.state.revision !== q.expectedRevision || hash(loaded.state) !== q.expectedStateHash || loaded.fileHash !== q.expectedFileHash) fail('compaction_conflict', 'Source journey/revision/logical hash or exact file bytes changed');
  if (q.sourceLibrary && Date.parse(q.sourceLibrary.retrievedAt) > Date.parse(q.asOf)) fail('invalid_compaction_request', 'Checkpoint must follow the declared Library retrieval time');
}
export async function prepareHistoryCheckpoint(path: string, output: string, input: unknown) {
  const parsed = compactionRequestSchema.safeParse(input); if (!parsed.success) return fail('invalid_compaction_request', 'Use fresh identity/revision/logical/file guards, explicit asOf/actor/reason and optional caller Library version'); const q = parsed.data;
  const paths = { source: resolve(path), candidate: resolve(output), report: resolve(output) + '.maintenance.json', localRecoveryCheckpoint: resolve(path) + '.recovery-checkpoint.json' };
  return withLock(paths.source, async () => {
    await checkPaths(paths, false); const loaded = await loadStore(paths.source); guard(loaded, q);
    const candidate = build(loaded.state, q); const raw = serializeState(candidate); const proof = proveHistoryCheckpoint(loaded.state, candidate);
    const report = compactionReportSchema.parse({ reportVersion: 1, coreVersion: TRIPCTL_CORE_VERSION, request: q, paths, source: { ...storageIdentity(loaded.state), fileHash: loaded.fileHash, fileBytes: loaded.raw.length }, candidate: { ...storageIdentity(candidate), fileHash: fileHash(raw), fileBytes: Buffer.byteLength(raw) }, proof,
      effect: effect(loaded, candidate, raw),
      recovery: { localCheckpointCreated: false, recoveryExternallyVerified: false, sourceLibrary: q.sourceLibrary || null, fullOlderSnapshots: 'prior_full_version_required', localCommitRecovery: 'one_replaceable_exact_file_checkpoint' }, saved: false, durability: 'candidate_only',
      warnings: ['All old business event metadata remains; only technical prefix deltas are removed', 'Older exact views require a readable prior full version; caller Library metadata does not verify recovery', 'Physical savings depend on this input; synthetic summary ratios do not predict a real journey', 'A compacted identity requires refreshed pending previews; committed receipts still replay', 'No Library versions, actual reports, orders, reminders or current unknown fields are deleted'] });
    await exclusiveWrite(paths.report, JSON.stringify(report, null, 2) + '\n'); await exclusiveWrite(paths.candidate, raw);
    const reread = await loadStore(paths.candidate); if (reread.fileHash !== report.candidate.fileHash) fail('compaction_mismatch', 'Candidate readback differs'); proveHistoryCheckpoint(loaded.state, reread.state);
    if ((await loadStore(paths.source)).fileHash !== loaded.fileHash) fail('compaction_conflict', 'Source changed while preparing the candidate; do not adopt it');
    return { ok: true, ...report, reportFile: paths.report, sourceUnchanged: true, externalSameIdentityCasRequired: true };
  });
}
/** Local-only explicit adoption keeps one exact fsynced prior file; cloud hosts use native CAS. */
export async function commitHistoryCheckpoint(path: string, input: unknown) {
  const parsed = compactionReportSchema.safeParse(input); if (!parsed.success) return fail('invalid_compaction_report', 'Use the complete reviewed maintenance report'); const report = parsed.data; const source = resolve(path);
  if (report.paths.source !== source || report.paths.localRecoveryCheckpoint !== source + '.recovery-checkpoint.json') fail('compaction_conflict', 'Report names another source or recovery checkpoint');
  return withLock(source, async () => {
    await checkPaths(report.paths, true);
    if (report.coreVersion !== TRIPCTL_CORE_VERSION || canonical(await readReviewedReport(report.paths.report)) !== canonical(report)) fail('compaction_mismatch', 'Reviewed report bytes or core version differ');
    const loaded = await loadStore(source); const candidate = await loadStore(report.paths.candidate);
    if (candidate.fileHash !== report.candidate.fileHash || canonical({ ...storageIdentity(candidate.state), fileHash: candidate.fileHash, fileBytes: candidate.raw.length }) !== canonical(report.candidate)) fail('compaction_mismatch', 'Candidate bytes or identity changed');
    const replayed = loaded.fileHash === candidate.fileHash;
    const original = replayed ? await loadStore(report.paths.localRecoveryCheckpoint) : loaded; guard(original, report.request);
    if (canonical({ ...storageIdentity(original.state), fileHash: original.fileHash, fileBytes: original.raw.length }) !== canonical(report.source)) fail('compaction_mismatch', 'Original checkpoint identity differs');
    if (canonical(effect(original, candidate.state, candidate.raw)) !== canonical(report.effect)) fail('compaction_mismatch', 'Reviewed effect differs from the actual source and candidate');
    const rebuilt = build(original.state, report.request); if (canonical(rebuilt) !== canonical(candidate.state) || canonical(proveHistoryCheckpoint(original.state, candidate.state)) !== canonical(report.proof)) fail('compaction_mismatch', 'Candidate does not reproduce the reviewed source/request/proof');
    if (!replayed) {
      try { const existing = await loadStore(report.paths.localRecoveryCheckpoint); if (existing.state.content.snapshot.trip.id !== report.request.expectedJourneyId) fail('recovery_conflict', 'Existing recovery file belongs to another journey'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      await atomicWriteBytes(report.paths.localRecoveryCheckpoint, original.raw);
      const recovery = await loadStore(report.paths.localRecoveryCheckpoint); if (!recovery.raw.equals(original.raw)) fail('recovery_mismatch', 'Exact prior file recovery readback failed; source remains intact');
      if ((await loadStore(source)).fileHash !== report.source.fileHash) fail('compaction_conflict', 'Source changed before local checkpoint adoption');
      await atomicWriteBytes(source, candidate.raw);
    }
    const after = await loadStore(source).catch(() => fail('save_outcome_unknown', 'Replacement occurred but readback failed; inspect the exact recovery file before retry'));
    if (after.fileHash !== candidate.fileHash) fail('save_outcome_unknown', 'Adopted file readback differs; preserve recovery checkpoint');
    return { ok: true, saved: true, replayed, durability: 'local_filesystem', revision: after.state.revision, ...storageIdentity(after.state), fileHash: after.fileHash, fullRecoveryFromRevision: anchorRevision(after.state), localRecoveryCheckpoint: report.paths.localRecoveryCheckpoint, localRecoveryCheckpointFileHash: original.fileHash, localRecoveryVerified: true, recoveryExternallyVerified: false, businessEventsDeleted: 0, addedDomainEvent: false };
  });
}
