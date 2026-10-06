import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtemp, readFile, writeFile, rm, symlink, link } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import fixture from '../../fixtures/planning-tools.snapshot.json';
import { initialize, preview, apply, mutationFromPreview, hash } from './engine';
import { loadStore, loadState, stageStore } from './store';
import { prepareMigration, commitMigration, exportFormat1 } from './migration';
import { isStorage2, encodeStorage2 } from './storage2';
const at = '2033-10-05T08:00:00Z';
const folders: string[] = []; const io = vi.hoisted(() => ({ failCandidate: '', failAfterRename: '' }));
vi.mock('node:fs/promises', async () => { const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises'); return { ...actual, rename: async (from: string, to: string) => { await actual.rename(from, to); if (to === io.failAfterRename) io.failCandidate = to; }, open: (path: string, ...args: unknown[]) => { if (path === io.failCandidate) throw new Error('Synthetic candidate publication failure'); return (actual.open as (...args: unknown[]) => unknown)(path, ...args); } }; });
afterEach(async () => { io.failCandidate = ''; io.failAfterRename = ''; for (const p of folders.splice(0)) await rm(p, { recursive: true, force: true }); });
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'tripctl-format2-')); folders.push(dir); const source = join(dir, 'source.json'); const output = join(dir, 'candidate.json');
  const initial = initialize(fixture); const p = await preview(initial, { type: 'set_context', todayId: '2026-10-11' }, 0); const request = mutationFromPreview(p, { idempotencyKey: 'before', actor: 'synthetic', reason: 'Synthetic migration', at }); const state = (await apply(initial, request)).state;
  const raw = `  ${JSON.stringify(state, null, 3)}  \n`; await writeFile(source, raw); const loaded = await loadStore(source);
  const q = { targetFormat: 2, expectedJourneyId: state.content.snapshot.trip.id, expectedRevision: 1, expectedStateHash: hash(state), expectedFileHash: loaded.fileHash, at, sourceLibrary: { libraryFileId: 'synthetic-authority', expectedCurrentVersion: 23, retrievedAt: at } };
  return { dir, source, output, raw, state, request, q };
}
describe('guarded formal migration and recovery', () => {
  it('prepares lossless candidate without source writes, adopts locally, then stages another edit', async () => {
    const t = await setup(); const report = await prepareMigration(t.source, t.output, t.q);
    expect(report.saved).toBe(false); expect(await readFile(t.source, 'utf8')).toBe(t.raw); expect(await readFile(report.paths.backup, 'utf8')).toBe(t.raw); expect(report.sourceLibrary?.expectedCurrentVersion).toBe(23);
    expect(report.proof.allEventsCompared).toBe(1); expect((await apply(await loadState(t.output), t.request)).receipt.replayed).toBe(true);
    const receipt = await commitMigration(t.source, JSON.parse(await readFile(report.paths.report, 'utf8'))); expect(receipt.saved).toBe(true); expect(receipt.revision).toBe(1); expect(isStorage2(await loadState(t.source))).toBe(true);
    const state = await loadState(t.source); const p = await preview(state, { type: 'set_context', todayId: '2026-10-12' }, 1); const request = mutationFromPreview(p, { idempotencyKey: 'after', actor: 'synthetic', reason: 'Continue after migration', at });
    const stage = await stageStore(t.source, join(t.dir, 'next.json'), request); expect(stage.saved).toBe(false); expect(stage.baseFileHash).toBe(receipt.fileHash); expect((await loadState(stage.candidate)).revision).toBe(2); expect((await loadState(t.source)).revision).toBe(1);
    const legacy = await exportFormat1(stage.candidate, join(t.dir, 'latest-format1.json'), { expectedRevision: 2, expectedStateHash: stage.candidateStateHash }); expect(legacy.historyTrimmed).toBe(false); expect((await loadState(legacy.candidate)).revision).toBe(2);
  });
  it('reports unknown save outcome when replacement succeeds but readback fails', async () => {
    const t = await setup(); const report = await prepareMigration(t.source, t.output, t.q); io.failAfterRename = t.source;
    await expect(commitMigration(t.source, reportInput(report))).rejects.toMatchObject({ code: 'save_outcome_unknown' }); io.failCandidate = ''; io.failAfterRename = '';
    expect(isStorage2(await loadState(t.source))).toBe(true); expect(await readFile(report.paths.backup, 'utf8')).toBe(t.raw);
  });
  it('rejects stale logical/byte guards, including same-revision whitespace changes', async () => {
    const t = await setup(); await expect(prepareMigration(t.source, t.output, { ...t.q, expectedRevision: 0 })).rejects.toMatchObject({ code: 'migration_conflict' });
    const report = await prepareMigration(t.source, t.output, t.q); await writeFile(t.source, t.raw + ' ');
    await expect(commitMigration(t.source, reportInput(report))).rejects.toMatchObject({ code: 'migration_conflict' }); expect(await readFile(t.source, 'utf8')).toBe(t.raw + ' ');
  });
  it('rechecks backup, candidate and report correspondence before any replacement', async () => {
    const t = await setup(); const r = await prepareMigration(t.source, t.output, t.q); const review = reportInput(r);
    await writeFile(r.paths.backup, t.raw + ' '); await expect(commitMigration(t.source, review)).rejects.toMatchObject({ code: 'migration_mismatch' }); await writeFile(r.paths.backup, t.raw);
    await writeFile(r.paths.candidate, (await readFile(r.paths.candidate, 'utf8')) + ' '); await expect(commitMigration(t.source, review)).rejects.toMatchObject({ code: 'migration_mismatch' }); expect(await readFile(t.source, 'utf8')).toBe(t.raw);
  });
  it('rejects exact, parent-symlink and hardlink output aliases without overwriting', async () => {
    const t = await setup(); await expect(prepareMigration(t.source, t.source, t.q)).rejects.toMatchObject({ code: 'invalid_output' });
    await symlink(t.dir, join(t.dir, 'alias')); await expect(prepareMigration(t.source, join(t.dir, 'alias', 'source.json'), t.q)).rejects.toMatchObject({ code: 'invalid_output' });
    const alias = join(t.dir, 'linked.json'); await link(t.source, alias); await expect(prepareMigration(t.source, alias, t.q)).rejects.toMatchObject({ code: 'invalid_file' }); expect(await readFile(t.source, 'utf8')).toBe(t.raw);
  });
  it('retains exact backup/report and untouched authority after publication failure', async () => {
    const t = await setup(); io.failCandidate = t.output; await expect(prepareMigration(t.source, t.output, t.q)).rejects.toThrow('Synthetic candidate publication failure'); io.failCandidate = '';
    expect(await readFile(t.source, 'utf8')).toBe(t.raw); expect(await readFile(t.output + '.format1.backup.json', 'utf8')).toBe(t.raw); expect(JSON.parse(await readFile(t.output + '.migration.json', 'utf8')).saved).toBe(false);
    await expect(readFile(t.output)).rejects.toMatchObject({ code: 'ENOENT' }); await expect(prepareMigration(t.source, t.output, t.q)).rejects.toMatchObject({ code: 'already_exists' });
  });
  it('does not implicitly migrate old states; rejects missing schema guards and existing recovery locks', async () => {
    const t = await setup(); expect(isStorage2(await loadState(t.source))).toBe(false); await expect(prepareMigration(t.source, t.output, {})).rejects.toMatchObject({ code: 'invalid_migration_request' });
    await writeFile(t.source + '.lock', 'synthetic active task'); await expect(prepareMigration(t.source, t.output, t.q)).rejects.toMatchObject({ code: 'store_busy' }); expect(await readFile(t.source + '.lock', 'utf8')).toBe('synthetic active task');
  });
  it('refuses downgrade before large expansion and preserves a >200-event authority', async () => {
    const t = await setup(); let state = encodeStorage2(initialize(fixture));
    // Exercise actual business commits beyond the old representation boundary.
    for (let n = 0; n < 201; n++) { const p = await preview(state, { type: 'set_context', todayId: fixture.todayId }, state.revision); state = (await apply(state, mutationFromPreview(p, { idempotencyKey: 'event-' + n, actor: 'synthetic', reason: 'Synthetic bounded log', at }))).state as typeof state; }
    await writeFile(t.source, JSON.stringify(state)); const raw = await readFile(t.source);
    await expect(exportFormat1(t.source, join(t.dir, 'legacy.json'), { expectedRevision: 201, expectedStateHash: hash(state) })).rejects.toMatchObject({ code: 'downgrade_unrepresentable' }); expect(await readFile(t.source)).toEqual(raw);
  });
});
function reportInput(value: Awaited<ReturnType<typeof prepareMigration>>) { const report: Record<string, unknown> = { ...value }; for (const key of ['ok', 'migrationReportFileHash', 'originalUnchanged', 'externalCasRequired']) delete report[key]; return report; }
