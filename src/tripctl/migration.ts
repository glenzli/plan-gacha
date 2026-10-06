import * as z from 'zod/v4';
import { lstat, realpath, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { canonical, hash, parseState, TRIPCTL_CORE_VERSION } from './engine';
import { TripError, type TripState } from './schema';
import { MAX_HISTORY_EVENTS, MAX_STORE_BYTES } from './limits';
import { encodeStorage2, exportLegacyState, isStorage2, storageIdentity, eventMetadata } from './storage2';
import { loadStore, withLock, fileHash, serializeState, exclusiveWrite, atomicWriteBytes } from './store';
const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const library = z.strictObject({ libraryFileId: z.string().min(1), expectedCurrentVersion: z.number().int().positive(), retrievedAt: z.iso.datetime({ offset: true }) });
export const migrationRequestSchema = z.strictObject({ targetFormat: z.literal(2), expectedJourneyId: z.string().min(1), expectedRevision: z.number().int().nonnegative(), expectedStateHash: digest, expectedFileHash: digest, at: z.iso.datetime({ offset: true }), sourceLibrary: library.optional() });
const identity = z.strictObject({ storageFormat: z.union([z.literal(1), z.literal(2)]), stateHashScope: z.enum(['canonical-format-1-state', 'content-and-audit-head-v2']), stateHash: digest, contentHash: digest, auditHeadHash: digest.nullable(), containerHash: digest });
export const migrationReportSchema = z.strictObject({ reportVersion: z.literal(1), coreVersion: z.literal(12), createdAt: z.iso.datetime({ offset: true }), journeyId: z.string(), revision: z.number().int().nonnegative(), historyCount: z.number().int().nonnegative(), paths: z.strictObject({ source: z.string(), candidate: z.string(), backup: z.string(), report: z.string() }), source: identity.extend({ fileHash: digest, fileBytes: z.number().int().nonnegative() }), candidate: identity.extend({ fileHash: digest, fileBytes: z.number().int().nonnegative() }), backup: z.strictObject({ fileHash: digest, fileBytes: z.number().int().nonnegative() }), proof: z.strictObject({ legacyStateHash: digest, currentContentHash: digest, allEventsCompared: z.number().int().nonnegative(), lossless: z.literal(true) }), sourceLibrary: library.optional(), metadataIsCallerSupplied: z.literal(true), saved: z.literal(false), durability: z.literal('candidate_and_exact_original_backup') });
export const downgradeRequestSchema = z.strictObject({ expectedRevision: z.number().int().nonnegative(), expectedStateHash: digest });
type Report = z.infer<typeof migrationReportSchema>;
const fail = (code: string, message: string): never => { throw new TripError(code, message); };
/** Canonical parent resolution also catches different spellings and parent-directory symlink aliases. */
async function checkPaths(paths: string[], allowExisting: boolean) {
  const names = new Set<string>(); const inodes = new Set<string>();
  for (const path of paths) {
    const name = join(await realpath(dirname(resolve(path))), basename(path));
    if (names.has(name)) fail('invalid_output', 'Source, candidate, backup and report paths must be distinct'); names.add(name);
    try {
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) fail('invalid_file', 'Migration paths must be regular files without symlinks or hardlinks');
      const inode = `${stat.dev}:${stat.ino}`; if (inodes.has(inode)) fail('invalid_output', 'Migration file identities alias'); inodes.add(inode);
      if (!allowExisting && paths[0] !== path) fail('already_exists', 'Migration outputs are exclusive; use fresh paths after reviewing retained recovery artifacts');
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; if (paths[0] === path) throw error; }
  }
}
async function regularBytes(path: string) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { const info = await handle.stat(); if (!info.isFile() || info.nlink !== 1 || info.size > MAX_STORE_BYTES) fail('invalid_file', 'Recovery artifact must be a regular single-link file at most 16 MiB'); const raw = await handle.readFile(); if (raw.length > MAX_STORE_BYTES) fail('state_too_large', 'Recovery artifact grew beyond 16 MiB'); return raw; }
  finally { await handle.close(); }
}
/** Explicit full-history proof; never silently normalize away supplied legacy JSON fields. */
export function proveLossless(original: TripState, candidateInput: unknown) {
  const candidate = parseState(candidateInput); if (!isStorage2(candidate)) fail('invalid_migration', 'Candidate must be format2');
  const reconstructed = exportLegacyState(candidate);
  if (candidate.revision !== original.revision || candidate.history.length !== original.history.length || canonical(candidate.content) !== canonical(original.content)) fail('migration_mismatch', 'Migration changed revision, history count or current content');
  for (const [n, event] of original.history.entries()) {
    const row = reconstructed.history[n];
    if (canonical(eventMetadata(row)) !== canonical(eventMetadata(event)) || canonical(row.before) !== canonical(event.before) || canonical(row.after) !== canonical(event.after)) fail('migration_mismatch', 'Migration changed historical content or audit metadata');
  }
  if (canonical(reconstructed) !== canonical(original)) fail('migration_mismatch', 'Full legacy reconstruction differs');
  return { legacyStateHash: hash(reconstructed), currentContentHash: hash(candidate.content), allEventsCompared: original.history.length, lossless: true as const };
}
export async function prepareMigration(path: string, output: string, input: unknown) {
  const request = migrationRequestSchema.safeParse(input); if (!request.success) fail('invalid_migration_request', 'Migration requires explicit identity, revision, logical hash, exact file hash and timestamp'); const q = request.data!;
  const sourcePath = resolve(path); const candidatePath = resolve(output);
  const paths = { source: sourcePath, candidate: candidatePath, backup: `${candidatePath}.format1.backup.json`, report: `${candidatePath}.migration.json` };
  return withLock(sourcePath, async () => {
    await checkPaths(Object.values(paths), false);
    const loaded = await loadStore(sourcePath); const state = loaded.state;
    if (isStorage2(state)) fail('already_format2', 'No migration is needed; use normal stage/apply');
    if (state.content.snapshot.trip.id !== q.expectedJourneyId || state.revision !== q.expectedRevision || hash(state) !== q.expectedStateHash || loaded.fileHash !== q.expectedFileHash) fail('migration_conflict', 'Source identity, revision, logical hash or exact file bytes changed');
    if (canonical(JSON.parse(loaded.raw.toString('utf8'))) !== canonical(state)) fail('migration_mismatch', 'Legacy parsing normalizes fields; preserve the original bytes and resolve schema differences before migrating');
    const candidate = parseState(encodeStorage2(state)); const candidateBytes = serializeState(candidate); const proof = proveLossless(state, candidate);
    const report: Report = migrationReportSchema.parse({ reportVersion: 1, coreVersion: TRIPCTL_CORE_VERSION, createdAt: q.at, journeyId: q.expectedJourneyId, revision: state.revision, historyCount: state.history.length, paths, source: { ...storageIdentity(state), fileHash: loaded.fileHash, fileBytes: loaded.raw.length }, candidate: { ...storageIdentity(candidate), fileHash: fileHash(candidateBytes), fileBytes: Buffer.byteLength(candidateBytes) }, backup: { fileHash: loaded.fileHash, fileBytes: loaded.raw.length }, proof, ...(q.sourceLibrary ? { sourceLibrary: q.sourceLibrary } : {}), metadataIsCallerSupplied: true, saved: false, durability: 'candidate_and_exact_original_backup' });
    // Candidate is published last. Any earlier failure leaves source intact and completed recovery artifacts visible.
    await exclusiveWrite(paths.backup, loaded.raw);
    await exclusiveWrite(paths.report, `${JSON.stringify(report, null, 2)}\n`);
    await exclusiveWrite(paths.candidate, candidateBytes);
    const reread = await loadStore(paths.candidate); if (reread.fileHash !== report.candidate.fileHash) fail('migration_mismatch', 'Candidate readback differs'); proveLossless(state, reread.state);
    return { ok: true, ...report, migrationReportFileHash: fileHash(await regularBytes(paths.report)), originalUnchanged: (await loadStore(sourcePath)).fileHash === loaded.fileHash, externalCasRequired: true };
  });
}
/** Explicit local adoption; Library/remote adoption still uses the host's same-identity version CAS. */
export async function commitMigration(path: string, reportInput: unknown) {
  const parsed = migrationReportSchema.safeParse(reportInput); if (!parsed.success) fail('invalid_migration_report', 'Use the complete migration report'); const report = parsed.data!; const source = resolve(path);
  if (resolve(report.paths.source) !== source) fail('migration_conflict', 'Report names a different authoritative path');
  return withLock(source, async () => {
    await checkPaths(Object.values(report.paths), true);
    const loaded = await loadStore(source); const candidate = await loadStore(report.paths.candidate); const backup = await regularBytes(report.paths.backup); const reportBytes = await regularBytes(report.paths.report);
    if (canonical(JSON.parse(reportBytes.toString('utf8'))) !== canonical(report)) fail('migration_mismatch', 'Report file does not match the reviewed input');
    if (isStorage2(loaded.state) || loaded.state.content.snapshot.trip.id !== report.journeyId || loaded.state.revision !== report.revision || canonical(storageIdentity(loaded.state)) !== canonical({ ...report.source, fileHash: undefined, fileBytes: undefined }) || loaded.fileHash !== report.source.fileHash || loaded.raw.length !== report.source.fileBytes) fail('migration_conflict', 'Source changed after candidate preparation; regenerate without overwriting recovery artifacts');
    if (!backup.equals(loaded.raw) || fileHash(backup) !== report.backup.fileHash || backup.length !== report.backup.fileBytes) fail('migration_mismatch', 'Backup must preserve exact original file bytes');
    if (candidate.fileHash !== report.candidate.fileHash || candidate.raw.length !== report.candidate.fileBytes || canonical(storageIdentity(candidate.state)) !== canonical({ ...report.candidate, fileHash: undefined, fileBytes: undefined })) fail('migration_mismatch', 'Candidate file or identity changed');
    const proof = proveLossless(loaded.state, candidate.state); if (canonical(proof) !== canonical(report.proof) || report.historyCount !== loaded.state.history.length) fail('migration_mismatch', 'Recomputed lossless proof differs');
    await atomicWriteBytes(source, candidate.raw);
    const after = await loadStore(source).catch(() => fail('save_outcome_unknown', 'Replacement occurred but readback failed; verify exact fileHash and retained original backup before retry'));
    if (after.fileHash !== candidate.fileHash) fail('save_outcome_unknown', 'Adopted file readback differs; retain backup and verify before retry');
    return { ok: true, saved: true, durability: 'local_filesystem', externalCheckpointVerified: false, journeyId: report.journeyId, revision: after.state.revision, ...storageIdentity(after.state), fileHash: after.fileHash, backup: report.paths.backup, originalFileHash: loaded.fileHash, migrationAddedDomainEvent: false };
  });
}
export async function exportFormat1(path: string, output: string, input: unknown) {
  const parsed = downgradeRequestSchema.safeParse(input); if (!parsed.success) fail('invalid_migration_request', 'Downgrade export requires expectedRevision and expectedStateHash'); const q = parsed.data!;
  const source = resolve(path); const candidate = resolve(output);
  return withLock(source, async () => {
    await checkPaths([source, candidate], false); const loaded = await loadStore(source);
    if (loaded.state.revision !== q.expectedRevision || hash(loaded.state) !== q.expectedStateHash) fail('migration_conflict', 'Source changed before downgrade export');
    if (loaded.state.history.length > MAX_HISTORY_EVENTS) fail('downgrade_unrepresentable', 'Latest complete history exceeds the old 200-event format; no events are removed');
    const legacy = parseState(exportLegacyState(loaded.state)); let bytes: string;
    try { bytes = serializeState(legacy); } catch (error) { if (error instanceof TripError && error.code === 'state_too_large') fail('downgrade_unrepresentable', 'Latest complete legacy history exceeds 16 MiB; retain format2 and original backup'); throw error; }
    await exclusiveWrite(candidate, bytes!);
    return { ok: true, saved: false, durability: 'candidate_only', revision: legacy.revision, ...storageIdentity(legacy), candidate, candidateFileHash: fileHash(bytes!), baseIdentity: storageIdentity(loaded.state), baseFileHash: loaded.fileHash, historyTrimmed: false };
  });
}
