import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/agent-linkage-scenario.json';
import { initialize, preview, apply, mutationFromPreview, canonical } from './engine';
import { assessObservations, observationPlanToken } from './observations';
import { analyseEvidenceImpact } from './evidenceImpact';
import { exportReadonlyView } from './readonlyView';
import type { TripState } from './schema';
const now = fixture.asOf;
const at = (t: string) => ({ kind: 'synthetic' as const, reference: 'synthetic:linkage', observedAt: t });
const save = async (s: TripState, op: unknown, id: string, time = now) => (await apply(s, mutationFromPreview(await preview(s, op, s.revision), { idempotencyKey: id, actor: 'synthetic', reason: 'Synthetic test', at: time }))).state;
async function imported() { return save(initialize(fixture.snapshot), fixture.importOperation, 'import'); }
const record = (s: TripState, extra = {}) => ({ ...fixture.observationDrafts[0], scope: { ...fixture.observationDrafts[0].scope, planToken: observationPlanToken(s.content, 'north-day') }, ...extra });
const add = (s: TripState, r: unknown, id = 'obs') => save(s, { type: 'record_observation', record: r }, id);
describe('external observations and private projection', () => {
  it('preserves the anonymous scenario, separate dates and explicit unknowns without implicit writes', async () => {
    let s = await imported(); for (const [n, op] of fixture.operations.entries()) s = await save(s, op, 'op-' + n);
    for (const [n, draft] of fixture.observationDrafts.entries()) s = await add(s, { ...draft, scope: { ...draft.scope, planToken: observationPlanToken(s.content, draft.scope.planId) } }, 'e-' + n);
    const before = canonical(s); const r = await analyseEvidenceImpact(s, { asOf: now });
    expect(r.impacts.map((i) => i.observation.scope.dateId)).toEqual(['2033-10-05', '2033-10-04']);
    expect(r.impacts.every((i) => i.status === 'prediction_or_uncertain' && i.proposal === null)).toBe(true);
    expect(r.questions.some((q) => q.text.includes('Meeting and ending times unknown'))).toBe(true);
    expect(r.questions.some((q) => q.text.includes('Old unneeded'))).toBe(false);
    const v = await exportReadonlyView(s, { asOf: now, generatedAt: fixture.generatedAt, source: { libraryFileId: 'synthetic-library', libraryVersion: 7, retrievedAt: now } });
    expect(v.source.revision).toBe(s.revision); expect(v.source.library?.libraryVersion).toBe(7);
    expect(v.freshness.automaticRefresh).toBe(false); expect(v.freshness.providerSyncAt).toBeNull();
    expect(v.inactiveAlternatives.some((o) => o.id === 'old-later-north')).toBe(true);
    expect(v.actual[0].bounds).toEqual({ after: '09:00' });
    expect(v.current.find((d) => d.dateId === '2033-10-04')?.typedDay?.activities[0].title).toContain('08:30–09:00');
    expect(canonical(s)).toBe(before); expect(v.saved).toBe(false);
  });
  it('deduplicates a source message independent of request and capture IDs; rejects a changed payload', async () => {
    let s = await imported(); const r = record(s); s = await add(s, r);
    expect((await preview(s, { type: 'record_observation', record: { ...r, id: 'another', source: { ...r.source, observedAt: now } } }, s.revision)).reasonCodes).toContain('observation_already_recorded');
    await expect(add(s, { ...r, id: 'another', summary: 'Changed same message' }, 'bad')).rejects.toMatchObject({ code: 'observation_identity_conflict' });
  });
  it('reduces out-of-order by publication, and a failure/expiry never revives old success', async () => {
    const initial = await imported(); const old = record(initial, { id: 'old', messageId: 'old', basis: 'official_final' });
    const failed = { ...old, id: 'failed', messageId: 'failed', status: 'unavailable', claim: null, publishedAt: '2033-10-03T18:00:30+08:00', source: at(now) };
    let a = await add(await add(initial, old, 'old'), failed, 'failed'); let b = await add(await add(initial, failed, 'failed'), old, 'old');
    expect(assessObservations(a.content, now)).toEqual(assessObservations(b.content, now));
    expect(assessObservations(a.content, now)[0]).toMatchObject({ status: 'unknown', reasonCodes: ['unavailable'] });
    a = await add(initial, old); expect(assessObservations(a.content, old.expiresAt)[0].reasonCodes).toContain('expired_evidence');
    b = await add(initial, { ...old, source: at('2033-10-03T20:00:00+08:00') }); expect(assessObservations(b.content, now)[0].reasonCodes).toContain('future_observation');
  });
  it('makes equal-time conflicts deterministic and non-actionable', async () => {
    const s = await imported(); const one = record(s, { id: 'one', messageId: 'one', basis: 'official_final' });
    const two = { ...one, id: 'two', messageId: 'two', claim: { kind: 'opening', state: 'open' } };
    const a = await add(await add(s, one, 'one'), two, 'two'); const b = await add(await add(s, two, 'two'), one, 'one');
    expect(assessObservations(a.content, now)).toEqual(assessObservations(b.content, now));
    expect(assessObservations(a.content, now)[0].reasonCodes).toContain('equal_time_conflict');
  });
  it('corrections and withdrawals retain records, prevent branching and do not reopen saved restrictions', async () => {
    let s = await imported(); const r = record(s, { basis: 'official_final' }); s = await add(s, r);
    s = await save(s, { type: 'apply_observation', observationId: r.id, asOf: now }, 'adopt');
    const withdrawal = { ...r, id: 'withdraw', messageId: 'withdraw', status: 'withdrawn', claim: null, supersedesId: r.id, publishedAt: now, source: at(now) };
    s = await add(s, withdrawal, 'withdraw');
    expect(s.content.linkage?.observations).toHaveLength(2); expect(assessObservations(s.content, now)[0].reasonCodes).toContain('withdrawn');
    expect(s.content.snapshot.trip.plans.find((p) => p.id === 'north-day')?.closed_dates).toEqual(['2033-10-04']);
    await expect(add(s, { ...withdrawal, id: 'branch', messageId: 'branch' }, 'branch')).rejects.toMatchObject({ code: 'invalid_correction' });
    expect((await preview(s, { type: 'undo', commitId: 'withdraw' }, s.revision)).reasonCodes).toContain('linkage_undo_forbidden');
  });
  it('shares direct date restriction watermarks in both directions and uses publication instead of late capture', async () => {
    let s = await imported(); const r = record(s, { basis: 'official_final', source: at('2033-10-03T20:00:00+08:00') }); s = await add(s, r);
    s = await save(s, { type: 'set_plan_dates', planId: 'north-day', reopenDates: ['2033-10-04'], reason: 'Newer explicit report', source: at('2033-10-03T18:30:00+08:00') }, 'newer');
    expect((await preview(s, { type: 'apply_observation', observationId: r.id, asOf: '2033-10-03T20:01:00+08:00' }, s.revision)).reasonCodes).toContain('stale_date_evidence');
    s = await imported(); s = await add(s, record(s, { basis: 'official_final' })); s = await save(s, { type: 'apply_observation', observationId: r.id, asOf: now }, 'adopt');
    expect((await preview(s, { type: 'set_plan_dates', planId: 'north-day', reopenDates: ['2033-10-04'], reason: 'Old report', source: at('2033-10-03T17:00:00+08:00') }, s.revision)).reasonCodes).toContain('stale_date_evidence');
  });
  it('rechecks expiry on apply and leaves schedules, reservations and raw source capture unchanged', async () => {
    let s = await imported(); const r = record(s, { basis: 'official_final' }); s = await add(s, r);
    const op = { type: 'apply_observation', observationId: r.id, asOf: now }; const p = await preview(s, op, s.revision);
    expect(p.canApply).toBe(true);
    await expect(apply(s, mutationFromPreview(p, { idempotencyKey: 'expired', actor: 'test', reason: 'Test', at: r.expiresAt }))).rejects.toMatchObject({ code: 'observation_not_actionable' });
    const next = await save(s, op, 'adopt'); expect(next.content.snapshot.trip.schedule).toEqual(s.content.snapshot.trip.schedule); expect(next.content.itinerary?.commitments).toEqual(s.content.itinerary?.commitments);
    expect(next.content.linkage?.observations[0].source.observedAt).toBe(r.source.observedAt);
  });
  it('invalidates place/content binding and rejects malformed and unknown scopes', async () => {
    const s = await imported(); const r = record(s);
    for (const scope of [{ ...r.scope, place: { ...r.scope.place, identity: 'unknown', placeId: null } }, { ...r.scope, planToken: 'sha256:' + '0'.repeat(64) }]) {
      expect(assessObservations((await add(s, { ...r, scope })).content, now)[0].status).toBe('unknown');
    }
    await expect(add(s, { ...r, scope: { ...r.scope, planId: 'absent' } })).rejects.toMatchObject({ code: 'unknown_id' });
    await expect(add(s, { ...r, scope: { ...r.scope, dateId: '2034-01-01' } })).rejects.toMatchObject({ code: 'unknown_date' });
    await expect(add(s, { ...r, invented: true })).rejects.toMatchObject({ code: 'invalid_operation' });
    await expect(exportReadonlyView(s, { asOf: now, generatedAt: '2030-01-01T00:00:00Z' })).rejects.toMatchObject({ code: 'invalid_view_time' });
  });
});
describe('organized projection compatibility', () => {
  it('keeps known backups visible; canonicalizes fact corrections and adds explicit date/activity binding', async () => {
    let s = await imported();
    const experience = { kind: 'firsthand', eventDateId: '2033-10-03', topics: ['crowds'], conditions: [], unknowns: ['No activity link yet'], reviewBeforeReuse: ['crowds'], changeCommitIds: [] };
    s = await save(s, { type: 'fact', record: { id: 'old-report', text: 'Synthetic queue report v1', certainty: 'reported', source: at('2033-10-03T18:00:00+08:00'), experience } }, 'fact-old');
    s = await save(s, { type: 'fact', record: { id: 'current-report', text: 'Synthetic queue report corrected', certainty: 'reported', source: at(now), experience: { ...experience, supersedesFactId: 'old-report' } } }, 'fact-new');
    let view = await exportReadonlyView(s, { asOf: now, generatedAt: fixture.generatedAt });
    expect(view.organized.catalog.facts).toHaveLength(1); expect(view.organized.days.find((d) => d.dateId === '2033-10-03')?.factRefs).toEqual(['fact:current-report']);
    expect(view.organized.gaps.some((g) => g.ref === 'fact:current-report')).toBe(true);
    expect(view.organized.days.find((d) => d.dateId === '2033-10-05')?.alternativeRefs).toContain('option:walking-backup');
    s = await save(s, { type: 'bind_context', record: { id: 'bind-fact', subjectType: 'fact', subjectId: 'current-report', dateIds: ['2033-10-03'], planId: 'valley-day', activityId: 'valley', role: 'context', source: at(now) } }, 'bind');
    s = await save(s, { type: 'bind_context', record: { id: 'bind-tour', subjectType: 'option', subjectId: 'walking-backup', dateIds: ['2033-10-05'], planId: 'walking-tour', role: 'backup', source: at(now) } }, 'tour');
    view = await exportReadonlyView(s, { asOf: now, generatedAt: fixture.generatedAt });
    expect(view.organized.gaps.some((g) => g.ref === 'fact:current-report')).toBe(false);
    expect(view.organized.days.find((d) => d.dateId === '2033-10-04')?.alternativeRefs).not.toContain('option:walking-backup');
    expect(view.organized.catalog.options.find((o) => o.id === 'walking-backup')).toMatchObject({ role: 'backup', dateMeaning: 'explicit_context_binding' });
    expect(view.organized.catalog.options.find((o) => o.id === 'walking-backup')?.uncertainties).toContain('Meeting and ending times unknown');
    const before = canonical(s); await expect(save(s, { type: 'bind_context', record: { id: 'bad', subjectType: 'fact', subjectId: 'current-report', dateIds: ['2033-10-03'], planId: 'north-day', activityId: 'valley', role: 'context', source: at(fixture.generatedAt) } }, 'bad')).rejects.toMatchObject({ code: 'unknown_id' }); expect(canonical(s)).toBe(before);
  });
  it('invalidates observations when legacy itinerary/place aliases change', () => {
    const snap = structuredClone(fixture.snapshot); snap.trip.plans = [{ id: 'legacy', name: 'Legacy', itinerary: [{ id: 'stop', name: 'Old venue', place: 'Old place' }] }] as never;
    const s = initialize(snap); const old = observationPlanToken(s.content, 'legacy');
    const plan = s.content.snapshot.trip.plans[0]; (plan.itinerary as { place: string }[])[0].place = 'New place';
    expect(observationPlanToken(s.content, 'legacy')).not.toBe(old);
  });
});
it('historical display bindings do not freeze removal of a newly inserted activity', async () => {
  let s = await imported();
  s = await save(s, { type: 'edit_itinerary', source: at(now), changes: [{ action: 'insert', dateId: '2033-10-05', index: 1, activity: { id: 'new-stop', kind: 'visit', title: 'Temporary stop', timing: {}, source: at(now) } }] }, 'insert');
  s = await save(s, { type: 'fact', record: { id: 'report', text: 'Synthetic stop observation', certainty: 'reported', source: at(now) } }, 'fact');
  s = await save(s, { type: 'bind_context', record: { id: 'bind', subjectType: 'fact', subjectId: 'report', dateIds: ['2033-10-05'], planId: 'city-day', activityId: 'new-stop', role: 'context', source: at(now) } }, 'bind');
  s = await save(s, { type: 'edit_itinerary', source: at(now), changes: [{ action: 'remove', activityId: 'new-stop' }] }, 'remove');
  const view = await exportReadonlyView(s, { asOf: now, generatedAt: fixture.generatedAt });
  expect(view.organized.gaps.some((g) => g.ref === 'fact:report' && g.code === 'historical_activity_reference')).toBe(true);
  expect(view.organized.catalog.activities.find((a) => a.activityId === 'new-stop')?.current).toBe(false);
  expect(view.organized.days.find((d) => d.dateId === '2033-10-05')?.primary?.activityRefs).not.toContain('activity:city-day:new-stop');
});
it('an explicit new plan binding does not inherit an activity from a different old plan', async () => {
  let s = await imported();
  s = await save(s, { type: 'fact', record: { id: 'report', text: 'Synthetic experience', certainty: 'reported', source: at(now), experience: { kind: 'firsthand', eventDateId: '2033-10-03', planId: 'valley-day', activityId: 'valley', topics: ['crowds'], conditions: [], unknowns: [], reviewBeforeReuse: [], changeCommitIds: [] } } }, 'fact');
  s = await save(s, { type: 'bind_context', record: { id: 'bind', subjectType: 'fact', subjectId: 'report', dateIds: ['2033-10-05'], planId: 'city-day', role: 'context', source: at(now) } }, 'bind');
  const view = await exportReadonlyView(s, { asOf: now, generatedAt: fixture.generatedAt });
  expect(view.organized.catalog.facts[0].association).toMatchObject({ planId: 'city-day', activityId: null });
  expect(view.organized.gaps.some((g) => g.ref === 'fact:report' && g.code === 'missing_typed_link')).toBe(true);
});
it('preserves legacy backup plans without guessed dates and escapes compound IDs', async () => {
  const snapshot = structuredClone(fixture.snapshot);
  snapshot.trip.plans = [{ id: 'a:b', name: 'Legacy B', priority: 'backup', stops: [{ id: 'c', title: 'Stop one' }] }, { id: 'a', name: 'Legacy A', priority: 'backup', stops: [{ id: 'b:c', title: 'Stop two' }] }, { id: 'empty-backup', name: 'Known backup without activities', priority: 'backup' }] as never;
  const s = initialize(snapshot); const view = await exportReadonlyView(s, { asOf: now, generatedAt: fixture.generatedAt });
  expect(view.organized.catalog.plans).toHaveLength(3); expect(view.organized.unplaced.backupPlanRefs).toContain('plan:empty-backup');
  expect(new Set(view.organized.catalog.activities.map((a) => a.ref)).size).toBe(2);
});
it('does not attach an option question to a shorter colon-prefixed option ID', async () => {
  const f = structuredClone(fixture); f.importOperation.options = [
    { id: 'a', dateIds: ['2033-10-04'], condition: 'Unknown', proposal: 'A', uncertainties: ['Question A'], source: f.importOperation.source },
    { id: 'a:b', dateIds: ['2033-10-05'], condition: 'Unknown', proposal: 'B', uncertainties: ['Question B'], source: f.importOperation.source },
  ] as never; f.importOperation.decisionPoints = [];
  const s = await save(initialize(f.snapshot), f.importOperation, 'import'); const view = await exportReadonlyView(s, { asOf: now, generatedAt: fixture.generatedAt });
  expect(view.organized.catalog.pending.find((q) => q.text === 'Question B')?.dateIds).toEqual(['2033-10-05']);
});
it('reports unlinked actual changes first, then shows explicit replacements with unknown clocks', async () => {
  let s = await imported();
  s = await save(s, fixture.operations[1], 'actual-change');
  let v = await exportReadonlyView(s, { asOf: now, generatedAt: fixture.generatedAt }); let d = v.organized.days[0];
  expect(d.primary.basis).toBe('reported_change_needs_binding'); expect(d.primary.activityRefs).toEqual([]);
  expect(d.priorPlannedActivityRefs).toContain('activity:first-day:lake'); expect(d.unlinkedChangeReportRefs).toContain('actual:memorial-substitution');
  const unchanged = canonical(s.content.itinerary!.current);
  s = await save(s, fixture.operations.at(-1)!, 'link-actual');
  v = await exportReadonlyView(s, { asOf: now, generatedAt: fixture.generatedAt }); d = v.organized.days[0];
  expect(d.primary.basis).toBe('explicit_actual_change'); expect(d.primary.activityRefs).toContain('reported-activity:reported-memorial');
  expect(d.primary.activityRefs).not.toContain('activity:first-day:lake'); expect(d.priorPlannedActivityRefs).toContain('activity:first-day:lake');
  expect(v.organized.catalog.reportedActivities[0].timing).toEqual({}); expect(v.organized.catalog.reportedActivities[0].completionVerified).toBe(false);
  expect(canonical(s.content.itinerary!.current)).toBe(unchanged); expect(s.content.memory.facts).toEqual([]);
  const bad = structuredClone(fixture.operations.at(-1)!); if ('record' in bad && bad.record) Object.assign(bad.record, { id: 'wrong', dateId: '2033-10-03' });
  await expect(save(s, bad, 'bad')).rejects.toMatchObject({ code: 'actual_change_mismatch' });
});
it('narrows option display dates, but stale display bindings never lock requirement changes', async () => {
  let s = await imported();
  const binding = { id: 'bind', subjectType: 'option', subjectId: 'north-next', dateIds: ['2033-10-04'], planId: 'north-day', role: 'backup', source: at(now) };
  await expect(save(s, { type: 'bind_context', record: { ...binding, dateIds: ['2033-10-05'] } }, 'wrong-day')).rejects.toMatchObject({ code: 'context_binding_conflict' });
  s = await save(s, { type: 'bind_context', record: binding }, 'bind');
  s = await save(s, { type: 'set_option_requirements', optionId: 'north-next', plans: [{ planId: 'walking-tour', dateId: '2033-10-04' }], reason: 'Explicit changed requirement', source: at(fixture.generatedAt) }, 'change-req');
  const v = await exportReadonlyView(s, { asOf: now, generatedAt: fixture.generatedAt });
  expect(v.organized.catalog.options.find((o) => o.id === 'north-next')?.role).toBe('stale_binding');
  expect(v.organized.gaps.some((g) => g.code === 'stale_context_binding')).toBe(true);
});
it('binds explicit legacy stop identities without marking a present activity historical', async () => {
  const snap = structuredClone(fixture.snapshot); snap.trip.plans = [{ id: 'legacy', name: 'Legacy', stops: [{ id: 'explicit', title: 'Known activity' }] }] as never;
  let s = initialize(snap); s = await save(s, { type: 'fact', record: { id: 'fact', text: 'Observed legacy activity', certainty: 'reported', source: at(now) } }, 'fact');
  s = await save(s, { type: 'bind_context', record: { id: 'bind', subjectType: 'fact', subjectId: 'fact', dateIds: ['2033-10-03'], planId: 'legacy', activityId: 'explicit', role: 'context', source: at(now) } }, 'bind');
  const v = await exportReadonlyView(s, { asOf: now, generatedAt: fixture.generatedAt }); expect(v.organized.catalog.facts[0].association.activityCurrent).toBe(true);
});
it('uses an existing structured skipped activity without hiding the entire other day plan', async () => {
  let s = await imported(); s = await save(s, { type: 'record_actual', record: { id: 'skipped-lake', kind: 'skipped', dateId: '2033-10-02', activityId: 'lake', text: 'Explicitly did not visit the lake', source: at(now) } }, 'skipped');
  const v = await exportReadonlyView(s, { asOf: now, generatedAt: fixture.generatedAt });
  expect(v.organized.days[0].primary.activityRefs).toContain('activity:first-day:depart');
  expect(v.organized.days[0].primary.activityRefs).not.toContain('activity:first-day:lake');
  expect(v.organized.days[0].unlinkedChangeReportRefs).toEqual([]);
});
it('scoped changed_plan leaves other activities visible and keeps started reports on the day', async () => {
  let s = await imported(); s = await save(s, fixture.operations[0], 'started');
  s = await save(s, { type: 'record_actual', record: { id: 'scoped-change', kind: 'changed_plan', dateId: '2033-10-02', activityId: 'lake', text: 'Only lake plan changed; details pending', source: at(now) } }, 'scoped');
  const v = await exportReadonlyView(s, { asOf: now, generatedAt: fixture.generatedAt });
  expect(v.organized.days[0].primary.activityRefs).toContain('activity:first-day:depart');
  expect(v.organized.days[0].primary.activityRefs).not.toContain('activity:first-day:lake');
  expect(v.organized.days[0].primary.actualReportRefs).toContain('actual:late-departure');
});
it('rejects unvalidated cross-activity route references in reported replacements', async () => {
  let s = await imported(); s = await save(s, fixture.operations[1], 'actual');
  const op = { type: 'link_actual_change', record: { id: 'route-link', actualId: 'memorial-substitution', dateId: '2033-10-02', previousActivityIds: ['lake'], replacementActivities: [{ id: 'route-new', kind: 'transfer', title: 'Reported route', timing: {}, route: { mode: 'driving', from: { label: 'Unknown origin' }, to: { label: 'Memorial' }, fromActivityId: 'does-not-exist' }, source: at(now) }], source: at(now) } };
  await expect(save(s, op, 'bad-route')).rejects.toMatchObject({ code: 'invalid_operation' });
});
