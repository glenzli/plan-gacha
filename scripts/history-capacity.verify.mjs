// Formal production codec + CLI, synthetic data only. No alternate authority or remote I/O.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const folder = resolve(process.argv[2] || 'dist/tripctl'); const oldFolder = process.argv[3];
const core = await import(pathToFileURL(join(folder, 'tripctl-lib.mjs')).href);
const scratch = await mkdtemp(join(tmpdir(), 'tripctl-production-storage-'));
const cli = join(folder, 'tripctl.mjs'); const checks = []; const at = '2033-10-05T08:00:00Z';
const run = (command, ...args) => { const result = spawnSync(process.execPath, [cli, command, ...args], { encoding: 'utf8' }); const response = JSON.parse(result.stdout); assert.equal(result.status, 0, JSON.stringify(response)); return response; };
const rejected = (command, ...args) => { const result = spawnSync(process.execPath, [cli, command, ...args], { encoding: 'utf8' }); assert.notEqual(result.status, 0); return JSON.parse(result.stdout); };
const save = async (name, value) => { const file = join(scratch, name); await writeFile(file, JSON.stringify(value, null, 2)); return file; };
const metadata = (id) => ({ idempotencyKey: id, actor: 'synthetic-storage-proof', reason: 'Synthetic lossless storage acceptance', at });
const size = (state) => Buffer.byteLength(JSON.stringify(state, null, 2) + '\n');
try {
  assert.equal(core.TRIPCTL_CORE_VERSION, 12);
  const fixture = JSON.parse(await readFile(join(folder, 'synthetic.snapshot.json'), 'utf8'));
  fixture.trip.plans[0].syntheticDenseEvidence = '合成 evidence '.repeat(3000);
  let state = core.initialize(fixture); const requests = [];
  const start = performance.now();
  for (let n = 1; n <= 100; n++) {
    const p = await core.preview(state, { type: 'fact', record: { id: 'fact-' + n, text: 'Synthetic observation '.repeat(6), certainty: 'reported', source: { kind: 'synthetic', reference: 'synthetic:event-' + n, observedAt: at } } }, state.revision);
    const q = core.mutationFromPreview(p, metadata('event-' + n)); requests.push(q); state = (await core.apply(state, q)).state;
  }
  const legacyBuildMs = performance.now() - start; const legacyBytes = size(state); assert.ok(legacyBytes > 8 * 1024 * 1024); assert.ok(legacyBytes <= 16 * 1024 * 1024);
  const source = join(scratch, 'authority.json'); const raw = ' ' + JSON.stringify(state, null, 2) + '\n'; await writeFile(source, raw);
  const verified = run('verify', '--store', source); const request = await save('migration-request.json', { targetFormat: 2, expectedJourneyId: state.content.snapshot.trip.id, expectedRevision: 100, expectedStateHash: verified.stateHash, expectedFileHash: verified.fileHash, at, sourceLibrary: { libraryFileId: 'synthetic-only', expectedCurrentVersion: 23, retrievedAt: at } });
  const output = join(scratch, 'authority.format2.json'); const migrateStart = performance.now(); const report = run('migrate', '--store', source, '--input', request, '--output', output); const migrationMs = performance.now() - migrateStart;
  assert.equal(report.saved, false); assert.equal(await readFile(source, 'utf8'), raw); assert.equal(await readFile(report.paths.backup, 'utf8'), raw); assert.equal(report.proof.legacyStateHash, core.hash(state)); assert.equal(report.proof.allEventsCompared, 100);
  const migrated = core.parseState(JSON.parse(await readFile(output, 'utf8'))); assert.equal(core.canonical(core.exportLegacyState(migrated)), core.canonical(state));
  checks.push('100-dense-business-commits-lossless', 'all-event-identities-metadata-before-after-current-preserved', 'exact-original-bytes-backed-up', 'candidate-only-no-authority-write');
  await writeFile(source, raw + ' '); assert.equal(rejected('commit-migration', '--store', source, '--input', report.paths.report).error.code, 'migration_conflict'); await writeFile(source, raw);
  assert.equal(run('commit-migration', '--store', source, '--input', report.paths.report).saved, true); const current = run('verify', '--store', source); assert.equal(current.revision, 100); assert.equal(current.stateHashScope, 'content-and-audit-head-v2'); assert.equal(current.fileHash, report.candidate.fileHash);
  for (const [n, request] of requests.entries()) assert.equal((await core.apply(migrated, request)).receipt.committedRevision, n + 1);
  const replayRequest = await save('old-receipt.json', requests[0]); assert.equal(run('apply', '--store', source, '--input', replayRequest).replayed, true);
  const op = await save('next-operation.json', { type: 'set_context', todayId: '2026-10-11' }); const beforeNext = performance.now(); const p = run('preview', '--store', source, '--input', op, '--revision', '100'); const previewMs = performance.now() - beforeNext;
  const q = await save('next-request.json', core.mutationFromPreview(p, metadata('after-migration'))); const candidate = join(scratch, 'next.format2.json'); const stageStart = performance.now(); const staged = run('stage', '--store', source, '--input', q, '--output', candidate); const stageMs = performance.now() - stageStart;
  assert.equal(staged.saved, false); assert.equal(run('verify', '--store', source).revision, 100); assert.equal(run('verify', '--store', candidate).revision, 101); assert.equal(staged.baseFileHash, current.fileHash); assert.equal(staged.candidateIdentity.storageFormat, 2);
  checks.push('same-revision-byte-CAS-conflict-refused', 'local-adoption-readback', 'all-100-committed-receipts-replay', 'next-preview-stage-and-readback', 'distinct-logical-container-and-exact-file-hashes');
  const downgradeQ = await save('downgrade-request.json', { expectedRevision: 101, expectedStateHash: staged.candidateStateHash }); const downgrade = run('export-format1', '--store', candidate, '--input', downgradeQ, '--output', join(scratch, 'latest.format1.json')); assert.equal(downgrade.revision, 101); assert.equal(downgrade.historyTrimmed, false);
  if (oldFolder) { const prior = await import(pathToFileURL(join(resolve(oldFolder), 'tripctl-lib.mjs')).href); assert.equal(prior.hash(prior.parseState(JSON.parse(await readFile(downgrade.candidate, 'utf8')))), downgrade.stateHash); const format2Json = JSON.parse(await readFile(candidate, 'utf8')); assert.throws(() => prior.parseState(format2Json)); checks.push('actual-core11-latest-complete-downgrade-readable', 'actual-core11-format2-refused'); }
  let later = migrated;
  for (let n = 101; n <= 205; n++) { const p = await core.preview(later, { type: 'set_context', todayId: n % 2 ? '2026-10-11' : '2026-10-12' }, later.revision); later = (await core.apply(later, core.mutationFromPreview(p, metadata('event-' + n)))).state; }
  const larger = await save('beyond200.json', later); assert.equal(run('verify', '--store', larger).historyCount, 205); const over = await save('over-request.json', { expectedRevision: 205, expectedStateHash: core.hash(later) }); assert.equal(rejected('export-format1', '--store', larger, '--input', over, '--output', join(scratch, 'impossible.json')).error.code, 'downgrade_unrepresentable');
  const undo = await core.preview(later, { type: 'undo', commitId: 'event-205' }, 205); const undone = (await core.apply(later, core.mutationFromPreview(undo, metadata('undo-205')))).state; assert.equal(core.canonical(undone.content), core.canonical(later.history.at(-1).before)); assert.equal(undone.revision, 206);
  for (const corrupt of [(s) => { s.history[0].reason = 'corrupted'; }, (s) => { s.history[0].forward = []; }, (s) => { [s.history[0], s.history[1]] = [s.history[1], s.history[0]]; }, (s) => { s.history.splice(2, 1); }, (s) => { s.content.memory.facts.pop(); }, (s) => { s.history[0].reverse = []; }]) { const broken = JSON.parse(JSON.stringify(migrated)); corrupt(broken); assert.throws(() => core.parseState(broken)); }
  checks.push('actual-format2-205-business-commits', 'complete-downgrade-refused-above200-without-trimming', 'monotonic-undo-after205', 'corrupted-patch-metadata-order-gap-current-inverse-refused');
  console.log(JSON.stringify({ ok: true, production: true, syntheticOnly: true, coreVersion: core.TRIPCTL_CORE_VERSION, checks, dense100: { legacyBytes, format2Bytes: report.candidate.fileBytes, reductionPercent: +(100 * (1 - report.candidate.fileBytes / legacyBytes)).toFixed(2), legacyBuildMs: Math.round(legacyBuildMs), migrationMs: Math.round(migrationMs), nextPreviewMs: Math.round(previewMs), nextStageMs: Math.round(stageMs), afterNextBytes: size(await core.loadState(candidate)) }, beyond200: { revision: later.revision, bytes: size(later), replayBudget: core.storage2Stats(later) }, noNetwork: true, authorityRestoredOriginalBeforeAdoption: true, physicalByteLimitUnchanged: 16777216 }));
} finally { await rm(scratch, { recursive: true, force: true }); }
