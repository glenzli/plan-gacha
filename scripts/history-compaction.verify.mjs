// Actual local adoption proof on synthetic temporary files only. No external app calls.
import { strict as assert } from 'node:assert';
import { readFile, writeFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const folder = resolve(process.argv[2] || dirname(fileURLToPath(import.meta.url)));
const core = await import(pathToFileURL(join(folder, 'tripctl-lib.mjs')).href);
const at = '2033-10-04T20:00:00Z', asOf = '2034-10-04T20:00:00Z';
const scratch = await mkdtemp(join(tmpdir(), 'tripctl-checkpoint-'));
const call = (input, ...args) => {
  const result = spawnSync(process.execPath, [join(folder, 'tripctl.mjs'), ...args, ...(input === undefined ? [] : ['--input', '-'])], { encoding: 'utf8', input: input === undefined ? undefined : JSON.stringify(input), maxBuffer: 20 * 1024 * 1024 });
  if (result.error) throw result.error;
  const body = JSON.parse(result.stdout);
  return { status: result.status, body };
};
const run = (input, ...args) => { const result = call(input, ...args); assert.equal(result.status, 0, JSON.stringify(result.body)); return result.body; };
try {
  const fixture = JSON.parse(await readFile(join(folder, 'operator-scenario.json'), 'utf8'));
  let state = core.encodeStorage2(core.initialize(fixture.snapshot)); const requests = [];
  const change = async (operation, key, reason) => {
    const p = await core.preview(state, operation, state.revision); assert.equal(p.canApply, true);
    const q = core.mutationFromPreview(p, { idempotencyKey: key, actor: 'synthetic', reason, at });
    state = (await core.apply(state, q)).state; requests.push(q);
  };
  await change(fixture.importOperation, 'import', '原计划导入，实际行程尚未知');
  const source = { kind: 'synthetic', reference: 'synthetic:checkpoint', observedAt: at };
  const { dateId, planId } = state.content.itinerary.current[0];
  await change({ type: 'decision', record: { id: 'veto', planId: 'crosscity', disposition: 'excluded', reason: '用户明确否决赶路过多的方案', source } }, 'veto', '保留明确否决原因');
  await change({ type: 'issue', record: { id: 'unfinished', text: '住宿条件仍待核对', source } }, 'unfinished', '未完成不推断为完成');
  await change({ type: 'record_actual', record: { id: 'note', dateId, kind: 'note', text: '实际是否参观仍未知', source } }, 'note', '备注不等于去过');
  await change({ type: 'set_context', todayId: dateId }, 'ordinary', '排队导致调整，结果仍未知');
  await change({ type: 'fact', record: { id: 'experience', text: '合成体验，结果未知', certainty: 'uncertain', source, experience: { kind: 'firsthand', eventDateId: dateId, planId, topics: ['timing'], conditions: [], unknowns: ['实际结果'], reviewBeforeReuse: [], changeCommitIds: ['ordinary'] } } }, 'experience', '保留体验与原调整关联');
  for (let n = 0; n < 60; n++) await change({ type: 'set_context', todayId: dateId }, 'context-' + n, '重新核对行程');
  const store = join(scratch, 'synthetic.json'), output = join(scratch, 'candidate.json');
  const raw = core.serializeState(state); await writeFile(store, raw);
  const identity = run(undefined, 'verify', '--store', store);
  const q = { asOf, expectedJourneyId: identity.journeyId, expectedRevision: identity.revision, expectedStateHash: identity.stateHash, expectedFileHash: identity.fileHash, actor: 'synthetic', reason: 'Explicit reviewed checkpoint', sourceLibrary: { libraryFileId: 'synthetic-library-only', expectedCurrentVersion: 3, retrievedAt: asOf } };
  const pending = core.mutationFromPreview(await core.preview(state, { type: 'set_context', todayId: dateId }, state.revision), { idempotencyKey: 'pending', actor: 'synthetic', reason: 'Old pending preview', at });
  const prepared = run(q, 'prepare-maintenance', '--store', store, '--output', output);
  assert.equal(prepared.saved, false); assert.equal(prepared.sourceUnchanged, true);
  assert.equal(await readFile(store, 'utf8'), raw); assert.ok(!(await readdir(scratch)).some((p) => p.includes('recovery-checkpoint')));
  const report = JSON.parse(await readFile(prepared.paths.report, 'utf8'));
  assert.equal(report.effect.archiveMetadata, 46); assert.equal(report.effect.recentFullEvents, 20);
  assert.equal(report.effect.businessEventsDeleted, 0); assert.equal(report.effect.metadataDeleted, 0);
  assert.equal(report.effect.physicalSavingsBytes, Buffer.byteLength(raw) - Buffer.byteLength(await readFile(output)));
  assert.equal(report.recovery.recoveryExternallyVerified, false);
  const candidate = (await core.loadStore(output)).state;
  assert.deepEqual(candidate.content, state.content); assert.deepEqual(core.auditEvents(candidate).map(core.eventMetadata), core.auditEvents(state).map(core.eventMetadata));
  assert.equal(core.proveHistoryCheckpoint(state, candidate).fullRecoverableRevisionsCompared, 21);
  for (const request of requests) assert.equal((await core.apply(candidate, request)).receipt.replayed, true);
  assert.equal(call(pending, 'validate-request', '--store', output).body.error.code, 'stale_preview');
  assert.equal(call({ view: { basis: 'as_recorded', revision: 45 }, asOf, generatedAt: asOf }, 'presentation-view', '--store', output).body.error.code, 'history_compacted');
  assert.equal(run({ view: { basis: 'as_recorded', revision: 46 }, asOf, generatedAt: asOf }, 'presentation-view', '--store', output).source.projectedRevision, 46);
  assert.equal(call({ ...q, expectedRevision: 0 }, 'prepare-maintenance', '--store', store, '--output', join(scratch, 'stale.json')).body.error.code, 'compaction_conflict');
  const committed = run(undefined, 'commit-maintenance', '--store', store, '--input', prepared.paths.report);
  assert.equal(committed.saved, true); assert.equal(committed.localRecoveryVerified, true); assert.equal(committed.recoveryExternallyVerified, false);
  assert.equal(await readFile(committed.localRecoveryCheckpoint, 'utf8'), raw);
  assert.equal(run(undefined, 'commit-maintenance', '--store', store, '--input', prepared.paths.report).replayed, true);
  assert.equal(run(undefined, 'verify', '--store', store).historyCount, 66);
  const recap = run({ asOf }, 'experiences', '--store', store);
  assert.ok(recap.results[0].recap.changes.some((c) => c.commitId === 'ordinary' && c.reason === '排队导致调整，结果仍未知'));
  const fresh = (operation, key) => {
    const current = run(undefined, 'verify', '--store', store);
    const p = run(operation, 'preview', '--store', store, '--revision', String(current.revision));
    return run(core.mutationFromPreview(p, { idempotencyKey: key, actor: 'synthetic', reason: 'After checkpoint', at }), 'apply', '--store', store);
  };
  fresh({ type: 'set_context', todayId: dateId }, 'after'); fresh({ type: 'undo', commitId: 'after' }, 'undo-after');
  const after = await core.loadStore(store); assert.deepEqual(after.state.content, state.content);
  const secondQ = { ...q, expectedRevision: after.state.revision, expectedStateHash: core.hash(after.state), expectedFileHash: after.fileHash };
  const second = run(secondQ, 'prepare-maintenance', '--store', store, '--output', join(scratch, 'candidate2.json'));
  run(undefined, 'commit-maintenance', '--store', store, '--input', second.paths.report);
  assert.equal(await readFile(committed.localRecoveryCheckpoint, 'utf8'), after.raw.toString('utf8'));
  assert.equal((await readdir(scratch)).filter((p) => p.includes('recovery-checkpoint')).length, 1);
  assert.equal(run(undefined, 'verify', '--store', store).historyCount, 68);
  // Independent cross-date nested reason reproduction; no real booking or provider.
  let nested = core.encodeStorage2(core.initialize(JSON.parse(await readFile(join(folder, 'booked-day.snapshot.json'), 'utf8'))));
  const nestedReason = '餐馆临时关闭、用户同意调整预订';
  for (let n = 0; n < 26; n++) {
    const operation = n ? { type: 'set_context', todayId: '2026-10-11' } : { type: 'assign', dateId: '2026-10-12', planId: 'gallery', commitmentChanges: [{ dateId: '2026-10-11', planId: 'museum', reason: nestedReason }] };
    const p = await core.preview(nested, operation, nested.revision); assert.equal(p.canApply, true);
    nested = (await core.apply(nested, core.mutationFromPreview(p, { idempotencyKey: 'nested-' + n, actor: 'synthetic', reason: '按用户要求调整', at }))).state;
  }
  const nestedStore = join(scratch, 'nested.json'); await writeFile(nestedStore, core.serializeState(nested));
  const ni = run(undefined, 'verify', '--store', nestedStore);
  const nr = run({ asOf, expectedRevision: ni.revision, expectedStateHash: ni.stateHash }, 'history-maintenance', '--store', nestedStore);
  assert.ok(nr.technicalMemory.protectedCommitRefs.some((c) => c.id === 'nested-0' && c.businessReasons.some((r) => r.text === nestedReason && r.planId === 'museum' && r.dateId === '2026-10-11')));
  const nc = run({ ...q, expectedJourneyId: ni.journeyId, expectedRevision: ni.revision, expectedStateHash: ni.stateHash, expectedFileHash: ni.fileHash }, 'prepare-maintenance', '--store', nestedStore, '--output', join(scratch, 'nested-candidate.json'));
  assert.ok((await readFile(nc.paths.candidate, 'utf8')).includes(nestedReason));
  const manifest = JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8'));
  assert.equal(manifest.coreVersion, core.TRIPCTL_CORE_VERSION); assert.ok(manifest.storageCodecs.includes(2));
  console.log(JSON.stringify({ ok: true, coreVersion: core.TRIPCTL_CORE_VERSION, syntheticOnly: true, independentCliProcesses: true, sourceAuthorityAccessed: false, actualLocalAdoptionTested: true, effect: report.effect, oldReceiptReplayCount: requests.length, exactRecentStatesCompared: 21, nestedBusinessReason: { preserved: true, actualDateId: '2026-10-11', assignedDateId: '2026-10-12' }, localRecoveryFiles: 1, nativeLibraryRecoveryVerified: false, realAuthorityReductionMeasured: false, checks: ['prepare-source-unchanged', 'actual-byte-effect', 'all-original-metadata-exact', 'all66-receipts-replay', 'experience-recap-linked-old-change', 'unknowns-and-veto-retained', 'pending-old-preview-refused', '21-exact-recent-states', 'older-full-view-explicitly-refused', 'stale-four-guards-refused', 'independent-local-commit-and-replay', 'exact-prior-file-readback', 'next-business-edit-and-undo', 'single-recovery-point-rotation', 'recompact-carries-all68-metadata', 'nested-cross-date-booking-reason-retained', 'runtime-manifest-dynamic-core-and-codec'] }));
} catch (error) { console.error(JSON.stringify({ ok: false, error: error.code || error.message })); process.exitCode = 1; }
finally { await rm(scratch, { recursive: true, force: true }); }
