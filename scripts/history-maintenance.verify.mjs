// Standalone synthetic dry-run proof. Does not clean history or call an external app.
import { strict as assert } from 'node:assert';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
const folder = resolve(process.argv[2] || dirname(fileURLToPath(import.meta.url)));
const core = await import(pathToFileURL(join(folder, 'tripctl-lib.mjs')).href); const at = '2031-06-04T20:00:00Z';
const scratch = await mkdtemp(join(tmpdir(), 'tripctl-maintenance-')); const asOf = '2032-06-04T20:00:00Z';
try {
  const fixture = JSON.parse(await readFile(join(folder, 'operator-scenario.json'), 'utf8')); let state = core.encodeStorage2(core.initialize(fixture.snapshot)); const receipts = [];
  const change = async (operation, key, reason) => { const p = await core.preview(state, operation, state.revision); const q = core.mutationFromPreview(p, { idempotencyKey: key, actor: 'synthetic', reason, at }); state = (await core.apply(state, q)).state; receipts.push(q); };
  await change(fixture.importOperation, 'import', '导入原计划，实际行程仍未知');
  const source = { kind: 'synthetic', reference: 'synthetic:maintenance', observedAt: at }; const date = state.content.itinerary.current[0].dateId; const planId = state.content.itinerary.current[0].planId;
  await change({ type: 'decision', record: { id: 'veto', planId: 'crosscity', disposition: 'excluded', reason: '用户明确否决赶路过多的方案', source } }, 'veto', '保留关键否决原因');
  await change({ type: 'issue', record: { id: 'unfinished', text: '住宿条件仍待核对', source } }, 'unfinished', '不把未完成事项标为已完成');
  await change({ type: 'record_actual', record: { id: 'note', dateId: date, kind: 'note', text: '这是计划备注，实际是否参观尚未知', source } }, 'note', '保留原始备注，不推断去过');
  await change({ type: 'set_context', todayId: date }, 'experience-linked-adjustment', '排队影响了后续安排，结果未知');
  await change({ type: 'fact', record: { id: 'experience', text: '合成体验：排队造成延误，结果尚未报告', certainty: 'uncertain', source, experience: { kind: 'firsthand', eventDateId: date, planId, topics: ['timing'], conditions: ['合成排队条件'], unknowns: ['实际结果'], reviewBeforeReuse: [], changeCommitIds: ['experience-linked-adjustment'] } } }, 'experience', '保留体验、未知与变更关联');
  for (let n = 0; n < 60; n++) await change({ type: 'set_context', todayId: date }, 'adjust-' + n, n % 3 ? '调整查看日期' : '重新核对行程安排');
  const store = join(scratch, 'synthetic.format2.json'); const raw = JSON.stringify(state, null, 2) + '\n'; await writeFile(store, raw);
  const input = { asOf, expectedRevision: state.revision, expectedStateHash: core.hash(state) }; const request = join(scratch, 'request.json'); await writeFile(request, JSON.stringify(input));
  const run = (...args) => JSON.parse(execFileSync(process.execPath, [join(folder, 'tripctl.mjs'), ...args], { encoding: 'utf8' }));
  const report = run('history-maintenance', '--store', store, '--input', request); const again = run('history-maintenance', '--store', store, '--input', request);
  assert.deepEqual(report, again); assert.equal(report.saved, false); assert.equal(report.applicationImplemented, false); assert.equal(report.effect.reclaimedStorageBytes, 0); assert.equal(report.effect.deletedEvents, 0); assert.equal(await readFile(store, 'utf8'), raw);
  assert.equal(report.effect.olderAdjustmentsToSummarize, 40); assert.equal(report.effect.summaryCards, 1); assert.equal(report.effect.recentFullChanges, 20);
  assert.equal(report.longTerm.keyDecisionReasons.planning[0].reason, '用户明确否决赶路过多的方案'); assert.equal(report.longTerm.businessMemory.unresolvedIssues, 1); assert.equal(report.longTerm.businessMemory.actualReports, 1); assert.equal(report.longTerm.businessMemory.experiences, 1); assert.equal(state.content.itinerary.actual[0].kind, 'note'); assert.equal(state.content.memory.facts[0].experience.outcome, undefined);
  assert.equal(report.technicalMemory.receipts.length, state.revision); for (const q of receipts) assert.equal((await core.apply(state, q)).receipt.replayed, true);
  assert.ok(report.technicalMemory.protectedCommitRefs.some((r) => r.id === 'experience-linked-adjustment')); assert.ok(report.summaries.every((c) => c.impliesVisitedOrSkipped === false));
  const bad = join(scratch, 'bad.json'); await writeFile(bad, JSON.stringify({ ...input, expectedRevision: 0 })); const failed = spawnSync(process.execPath, [join(folder, 'tripctl.mjs'), 'history-maintenance', '--store', store, '--input', bad], { encoding: 'utf8' }); assert.notEqual(failed.status, 0); assert.equal(JSON.parse(failed.stdout).error.code, 'revision_conflict'); assert.equal(await readFile(store, 'utf8'), raw);
  console.log(JSON.stringify({ ok: true, coreVersion: core.TRIPCTL_CORE_VERSION, syntheticOnly: true, independentCliProcesses: true, effect: report.effect, summaryReasons: report.summaries.flatMap((c) => c.reasons.map((r) => ({ text: r.text, occurrences: r.occurrences }))), preserved: report.longTerm.businessMemory, receiptReplayCount: receipts.length, unchangedBytesAndHash: true, inferredVisitOrCompletion: false, extraBackupCreated: false, authorityCleaned: false, checks: ['40-older-adjustments-to-one-semantic-card', 'latest20-recovery', 'distinct-reasons-and-provenance-retained', 'explicit-veto-and-unknown-outcome-retained', 'experience-linked-change-protected', 'all66-committed-receipts-replay', 'source-bytes-and-hash-unchanged', 'repeated-input-same-output', 'stale-snapshot-refused', 'no-implicit-visit-completion-cleanup-or-backup'] }));
} catch (error) { console.error(JSON.stringify({ ok: false, error: error.code || error.message })); process.exitCode = 1; } finally { await rm(scratch, { recursive: true, force: true }); }
