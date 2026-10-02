import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/anonymous-itinerary.json';
import { initialize, preview, apply, mutationFromPreview, parseState, canonical } from './engine';
import { analyseItinerary, itineraryActivityToken, assessItineraryEvidence } from './itinerary';
import { itineraryOperationSchema, type Itinerary, type ItineraryOperation } from './itinerarySchema';
import { renderItineraryReport } from './itineraryReport';
import type { TripState } from './schema';
const source = { kind: 'synthetic' as const, reference: 'synthetic:explicit-user-instruction', observedAt: '2030-05-11T12:00:00+08:00' };
const date = '2030-05-12';
const edit = (changes: Extract<ItineraryOperation, { type: 'edit_itinerary' }>['changes']) => ({ type: 'edit_itinerary' as const, source, changes });
const save = async (s: TripState, op: unknown, id: string) => { const p = await preview(s, op, s.revision); return (await apply(s, mutationFromPreview(p, { idempotencyKey: id, actor: 'synthetic', reason: 'Synthetic user instruction', at: source.observedAt }))).state; };
async function imported() { return save(initialize(fixture.snapshot), fixture.operation, 'import'); }
const current = (s: TripState) => s.content.itinerary!;
const activity = (i: Itinerary, id: string) => i.current.flatMap((d) => d.activities).find((a) => a.id === id)!;
const evidence = (i: Itinerary, overrides = {}) => ({ id: 'route-1', kind: 'route', dateId: date, activityId: 'drive-e', activityToken: itineraryActivityToken(i, 'drive-e'), source: { kind: 'provider', reference: 'https://maps.example.test/anonymous-observation', observedAt: source.observedAt }, expiresAt: '2030-05-11T13:00:00+08:00', captureKind: 'live', status: 'estimate', mode: 'driving', durationMinutes: { min: 100, max: 120 }, detail: 'Caller-supplied anonymous estimate; provider not authenticated by engine', ...overrides });
describe('versioned itinerary core', () => {
  it('imports atomically, preserves original and exposes strict deadline conflict without claiming feasible', async () => {
    const s = await imported(); expect(parseState(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(current(s).baseline.days).toEqual(current(s).current); expect(s.content.snapshot.trip.checklistText).toBe(fixture.snapshot.trip.checklistText);
    const r = analyseItinerary(current(s), { asOf: source.observedAt });
    expect(r.clockConstraints.find((c) => c.id === 'finish')?.status).toBe('violated'); expect(r.feasibility).toBe('not_proven');
    expect(r.requirements.every((r) => !r.canUseForComparison)).toBe(true); expect(r.preferences[0].limit).toBeUndefined();
  });
  it('same input produces the same preview regardless of ambient time or IDs', async () => {
    const s = await imported(); const op = edit([{ action: 'update', activityId: 'drive-e', patch: { timing: { start: '14:30', end: '16:59' } } }]);
    expect(await preview(s, op, 1)).toEqual(await preview(s, structuredClone(op), 1));
    const next = await save(s, op, 'time'); expect(current(next).baseline).toEqual(current(s).baseline); expect(activity(current(next), 'drive-e').timing.end).toBe('16:59');
    expect(next.content.snapshot.trip.plans[1].stops?.[4]).toMatchObject({ id: 'drive-e', time: '14:30' });
  });
  it.each(['17:01', '17:30'])('blocks a worsening strict deadline at %s with zero writes', async (end) => {
    const s = await imported(); const p = await preview(s, edit([{ action: 'update', activityId: 'drive-e', patch: { timing: { start: '14:30', end } } }]), 1);
    expect(p.canApply).toBe(false); expect(p.reasonCodes).toContain('hard_time_constraint_worsened'); expect(p.nextContent).toEqual(s.content);
    await expect(apply(s, mutationFromPreview(p, { idempotencyKey: 'denied', actor: 'synthetic', reason: 'Test', at: source.observedAt }))).rejects.toMatchObject({ code: 'constraint_violation' });
  });
  it('blocks erasure of a hard clock and deletion or moving of its target', async () => {
    const s = await imported(); for (const op of [edit([{ action: 'update', activityId: 'drive-e', patch: { timing: {} } }]), edit([{ action: 'remove', activityId: 'drive-e' }]), edit([{ action: 'move', activityId: 'drive-e', dateId: '2030-05-11', index: 4 }])]) expect((await preview(s, op, 1)).canApply).toBe(false);
  });
  it('adds/deletes/reorders/moves with controlled IDs; retains tombstones', async () => {
    let s = await imported(); const a = { id: 'extra', kind: 'other' as const, title: 'Optional stop', timing: {}, source };
    s = await save(s, edit([{ action: 'insert', dateId: date, index: 6, activity: a }]), 'add');
    s = await save(s, edit([{ action: 'move', activityId: 'extra', dateId: '2030-05-11', index: 4 }]), 'move');
    s = await save(s, edit([{ action: 'reorder', dateId: '2030-05-11', activityIds: ['drive-a', 'visit-a', 'drive-b', 'extra', 'hotel-a'] }]), 'reorder');
    s = await save(s, edit([{ action: 'remove', activityId: 'extra' }]), 'remove');
    expect(current(s).registeredActivityIds).toContain('extra'); await expect(preview(s, edit([{ action: 'insert', dateId: date, index: 6, activity: a }]), s.revision)).rejects.toMatchObject({ code: 'duplicate_id' });
    expect(s.revision).toBe(5); expect(current(s).baseline.days).toEqual(fixture.operation.days);
  });
  it('rejects unknown IDs, bad order, malformed schema, implicit overnight and invalid analysis', async () => {
    const s = await imported(); for (const [op, code] of [
      [edit([{ action: 'remove', activityId: 'unknown' }]), 'unknown_id'], [edit([{ action: 'reorder', dateId: date, activityIds: [] }]), 'invalid_order'],
      [edit([{ action: 'update', activityId: 'visit-b', patch: { timing: { start: '23:00', end: '01:00' } } }]), undefined],
      [{ type: 'edit_itinerary', source, changes: [{ action: 'remove', activityId: 'visit-b', invented: true }] }, 'invalid_operation'],
    ] as const) { if (code) await expect(preview(s, op, 1)).rejects.toMatchObject({ code }); else await expect(preview(s, op, 1)).rejects.toThrow(); }
    expect(() => analyseItinerary(current(s), {})).toThrow(); expect(itineraryOperationSchema.safeParse({ ...fixture.operation, timeZone: 'UTC' }).success).toBe(false);
  });
  it('explicit overnight is represented without timezone guessing', async () => {
    const s = await imported(); const next = await save(s, edit([{ action: 'update', activityId: 'hotel-b', patch: { timing: { start: '23:00', end: '01:00', endDayOffset: 1 } } }]), 'overnight');
    expect(activity(current(next), 'hotel-b').timing.endDayOffset).toBe(1);
  });
  it('reported late departure remains an exclusive bound, no invented arrival/check-in', async () => {
    const s = await save(await imported(), { type: 'record_actual', record: { id: 'late', dateId: '2030-05-11', activityId: 'drive-a', kind: 'started', bounds: { after: '09:00' }, text: 'Departed after nine; exact time unknown', source } }, 'actual');
    const r = analyseItinerary(current(s), { asOf: source.observedAt }); expect(r.actual).toHaveLength(1); expect(r.actual[0]).toMatchObject({ exactTimeKnown: false, departureDelayLowerBoundMinutes: 90, lowerBoundExclusive: true }); expect(r.actual[0].at).toBeUndefined();
    expect((await preview(s, edit([{ action: 'remove', activityId: 'drive-a' }]), s.revision)).reasonCodes).toContain('actual_activity_change');
  });
  it('ongoing planned timing can change without rewriting reported actuals; contradictory finish is rejected', async () => {
    const s = await save(await imported(), { type: 'record_actual', record: { id: 'started', dateId: '2030-05-11', activityId: 'drive-a', kind: 'started', bounds: { after: '09:00' }, text: 'Exact departure unknown', source } }, 'started');
    const next = await save(s, edit([{ action: 'update', activityId: 'drive-a', patch: { timing: {}, note: 'Arrival estimate unknown; original destination intent retained' } }]), 'ongoing');
    expect((await preview(next, { type: 'record_actual', record: { id: 'after-bound', dateId: '2030-05-11', activityId: 'drive-a', kind: 'finished', at: '2030-05-11T09:00:00.001+08:00', text: 'Strictly after bound; millisecond retained', source } }, 3)).canApply).toBe(true);
    expect(current(next).actual).toEqual(current(s).actual); expect(activity(current(next), 'drive-a').timing).toEqual({});
    await expect(preview(next, { type: 'record_actual', record: { id: 'finished', dateId: '2030-05-11', activityId: 'drive-a', kind: 'finished', at: '2030-05-11T08:59:00+08:00', text: 'Contradictory report', source } }, 3)).rejects.toMatchObject({ code: 'invalid_actual_sequence' });
  });
  it('records late-day uncertain change without claiming completion, and validates Shanghai dates', async () => {
    let s = await imported(); s = await save(s, { type: 'record_actual', record: { id: 'change', dateId: '2030-05-11', kind: 'changed_plan', text: 'After meal diverted to an unverified park; no arrival time reported', source } }, 'change');
    expect(current(s).actual.some((a) => a.kind === 'finished')).toBe(false);
    await expect(preview(s, { type: 'record_actual', record: { id: 'bad-date', dateId: '2030-05-11', activityId: 'drive-a', kind: 'started', at: '2030-05-11T20:00:00Z', text: 'Wrong local day', source: { ...source, observedAt: '2030-05-12T12:00:00Z' } } }, 2)).rejects.toMatchObject({ code: 'invalid_actual_time' });
    const p = await preview(s, { type: 'record_actual', record: { id: 'ok-date', dateId: '2030-05-11', activityId: 'drive-a', kind: 'started', at: '2030-05-10T23:30:00Z', text: 'Explicit 07:30 Shanghai timestamp', source } }, 2); expect(p.canApply).toBe(true);
  });
  it('provider evidence never establishes actuals, plans or option choices', async () => {
    const s = await imported(); await expect(preview(s, { type: 'record_actual', record: { id: 'provider', dateId: date, activityId: 'drive-e', kind: 'finished', text: 'Model guess', source: { ...source, kind: 'provider' } } }, 1)).rejects.toMatchObject({ code: 'unconfirmed_intent' });
  });
  it('baseline cannot be overwritten, and legacy mutations cannot fork projection', async () => {
    const s = await imported(); await expect(preview(s, fixture.operation, 1)).rejects.toMatchObject({ code: 'baseline_exists' });
    await expect(preview(s, { type: 'edit_activity', dateId: date, planId: 'day-b', stopId: 'visit-b', patch: { title: 'Bypass' }, source }, 1)).rejects.toMatchObject({ code: 'itinerary_operation_required' });
    const blank = initialize(fixture.snapshot); blank.content.snapshot.trip.plans.push({ id: 'backup', name: 'Backup' }); let x = await save(blank, fixture.operation, 'i');
    expect((await preview(x, { type: 'assign', dateId: date, planId: 'backup' }, 1)).reasonCodes).toContain('itinerary_operation_required');
    x = structuredClone(s); x.content.snapshot.trip.plans[0].stops![0] = { id: 'drive-a', title: 'Corrupt' }; x.history[0].after = x.content; expect(() => parseState(x)).toThrow();
  });
  it('keeps old journey/history compatible and undoes optional import as a new revision', async () => {
    const old = initialize(fixture.snapshot); const s = await save(old, fixture.operation, 'import'); const next = await save(s, { type: 'undo', commitId: 'import' }, 'undo');
    expect(next.revision).toBe(2); expect(next.content).toEqual(old.content); expect(next.content.itinerary).toBeUndefined(); expect(parseState(next)).toEqual(next);
  });
  it('revision/stale token and idempotency remain enforced for itinerary changes', async () => {
    const s = await imported(); const op = edit([{ action: 'update', activityId: 'drive-e', patch: { timing: { start: '14:30', end: '16:59' } } }]); const p = await preview(s, op, 1);
    await expect(preview(s, op, 0)).rejects.toMatchObject({ code: 'revision_conflict' }); const request = mutationFromPreview(p, { idempotencyKey: 'time', actor: 'test', reason: 'Test', at: source.observedAt });
    await expect(apply(s, { ...request, previewToken: `sha256:${'0'.repeat(64)}` })).rejects.toMatchObject({ code: 'stale_preview' }); const next = (await apply(s, request)).state; expect((await apply(next, request)).receipt.replayed).toBe(true);
  });
  it('fixed/reserved commitments and completed memory prevent changes', async () => {
    const op = structuredClone(fixture.operation); op.commitments.push({ id: 'reservation', dateId: date, activityId: 'visit-b', kind: 'reservation', text: 'User-reported reserved entry; order unverified', source } as never);
    const s = await save(initialize(fixture.snapshot), op, 'i'); expect((await preview(s, edit([{ action: 'remove', activityId: 'visit-b' }]), 1)).reasonCodes).toContain('fixed_or_reserved_activity_change');
    const completed = await save(await imported(), { type: 'progress', record: { id: 'done', planId: 'day-b', dateId: date, status: 'done', reason: 'Explicit reported completion', source } }, 'done');
    expect((await preview(completed, edit([{ action: 'update', activityId: 'hotel-b', patch: { title: 'Changed' } }]), 2)).reasonCodes).toContain('completed_plan_change');
  });
  it('route estimates are bound, expire, retain failure and never prove feasibility', async () => {
    let s = await imported(); const e = evidence(current(s)); s = await save(s, { type: 'itinerary_evidence', record: e }, 'route');
    const r = analyseItinerary(current(s), { asOf: source.observedAt }); expect(r.requirements.find((r) => r.activityId === 'drive-e')).toMatchObject({ canUseForComparison: true, estimateFit: 'estimate_fits_slot' }); expect(r.feasibility).toBe('not_proven');
    expect(assessItineraryEvidence(current(s), current(s).evidence[0], '2030-05-11T13:00:00+08:00').status).toBe('stale');
    const failed = evidence(current(s), { id: 'failed', status: 'unavailable', durationMinutes: undefined, mode: undefined, source: { ...e.source, observedAt: '2030-05-11T12:00:01+08:00' } }); s = await save(s, { type: 'itinerary_evidence', record: failed }, 'failure');
    expect(analyseItinerary(current(s), { asOf: '2030-05-11T12:00:02+08:00' }).requirements.find((r) => r.activityId === 'drive-e')).toMatchObject({ status: 'unavailable', canUseForComparison: false });
  });
  it.each(['fixture', 'future', 'wrongmode', 'changed'])('evidence %s cannot be used', async (which) => {
    const s = await imported(); const i = current(s); const e = evidence(i); if (which === 'fixture') e.captureKind = 'fixture'; if (which === 'future') e.source.observedAt = '2030-05-11T12:01:00+08:00'; if (which === 'wrongmode') e.mode = 'walking'; if (which === 'changed') e.activityToken = `sha256:${'0'.repeat(64)}`;
    const parsed = itineraryOperationSchema.parse({ type: 'itinerary_evidence', record: e }); if (parsed.type !== 'itinerary_evidence') throw new Error(); expect(assessItineraryEvidence(i, parsed.record, source.observedAt).canUseForComparison).toBe(false);
  });
  it('location changes invalidate old observations, explicit references invalidate adjacent legs', async () => {
    let s = await imported(); s = await save(s, { type: 'itinerary_evidence', record: evidence(current(s)) }, 'route');
    const next = await save(s, edit([{ action: 'update', activityId: 'drive-e', patch: { route: { mode: 'driving', from: { label: 'Changed origin' }, to: { label: 'Town B' } } } }]), 'location');
    expect(analyseItinerary(current(next), { asOf: source.observedAt }).requirements.find((r) => r.activityId === 'drive-e')?.status).toBe('mismatch');
  });
  it('conditional choices and known/unknown deadlines remain advisory, no booking side effect', async () => {
    let s = await imported(); let r = analyseItinerary(current(s), { asOf: '2030-05-13T18:00:00+08:00' }); expect(r.decisions.find((d) => d.id === 'hotel-choice')?.deadlineStatus).toBe('due'); expect(r.decisions.find((d) => d.id === 'entry-choice')?.deadlineStatus).toBe('unknown');
    const snapshot = canonical(s.content.snapshot); s = await save(s, { type: 'choose_option', record: { id: 'choice', decisionPointId: 'hotel-choice', optionId: 'option-b', reason: 'Explicit user preference pending conditions', source } }, 'choice'); r = analyseItinerary(current(s), { asOf: source.observedAt });
    expect(r.decisions[0]).toMatchObject({ status: 'decision_recorded', scheduleApplied: false, cancellationPerformed: false }); expect(canonical(s.content.snapshot)).toBe(snapshot);
  });
  it('extends future days and adds explicit typed constraints/commitments without rewriting baseline', async () => {
    let s = await imported(); const baseline = canonical(current(s).baseline);
    s = await save(s, edit([{ action: 'add_day', day: { dateId: '2030-05-13', planId: 'day-c', title: 'Future conditional day', activities: [{ id: 'future-visit', kind: 'visit', title: 'Entry subject to reservation', timing: { start: '10:00', end: '12:00' }, source }] } }]), 'future');
    s = await save(s, { type: 'itinerary_constraint', record: { id: 'walk-cap', dateId: date, kind: 'max_walking_meters', limit: 500, strength: 'hard', text: 'Explicit user walking cap', source } }, 'cap');
    expect(analyseItinerary(current(s), { asOf: source.observedAt }).numericConstraints[0].status).toBe('unknown');
    s = await save(s, { type: 'itinerary_commitment', record: { id: 'future-ticket', dateId: '2030-05-13', activityId: 'future-visit', kind: 'reservation', text: 'Reported ticket; no authenticated order', source } }, 'ticket');
    expect((await preview(s, edit([{ action: 'remove', activityId: 'future-visit' }]), s.revision)).canApply).toBe(false); expect(canonical(current(s).baseline)).toBe(baseline);
  });
  it('booked links/locked lodgings remain protective for structured edits', async () => {
    let initial = initialize(fixture.snapshot); initial.content.snapshot.trip.lodgings.push({ id: 'stay', name: 'Anonymous hotel' }); initial.content.snapshot.trip.schedule[date] = { planId: '', lodgingId: 'stay', lodgingLocked: true };
    let s = await save(initial, fixture.operation, 'i');
    expect((await preview(s, edit([{ action: 'update', activityId: 'hotel-b', patch: { title: 'Different stay' } }]), 1)).reasonCodes).toContain('locked_lodging_change');
    initial = initialize(fixture.snapshot); s = await save(initial, fixture.operation, 'i');
    // Existing booked metadata can be supplied through the original snapshot/import workflow.
    s.content.snapshot.trip.plans[1].bookings = [{ id: 'booked', title: 'Reserved visit', status: 'done', dateId: date, stopIds: ['visit-b'], stopLinkSource: source }]; s.history[0].after = structuredClone(s.content);
    expect((await preview(s, edit([{ action: 'remove', activityId: 'visit-b' }]), 1)).reasonCodes).toContain('booked_activity_locked');
    expect((await preview(s, edit([{ action: 'update', activityId: 'hotel-b', patch: { note: 'Dinner preference' } }]), 1)).canApply).toBe(true);
  });
  it('fresh blocked weather requires explicit risk acceptance; stale weather becomes unknown', async () => {
    let s = await imported(); const e = { ...evidence(current(s)), id: 'weather', kind: 'weather', activityId: 'visit-b', activityToken: itineraryActivityToken(current(s), 'visit-b'), durationMinutes: undefined, mode: undefined, risk: 'blocked', forecastDateId: date };
    s = await save(s, { type: 'itinerary_evidence', record: e }, 'w');
    const p = await preview(s, edit([{ action: 'update', activityId: 'hotel-b', patch: { note: 'Review dinner' } }]), s.revision); expect(p.weatherOverride).toBe(true);
    await expect(apply(s, mutationFromPreview(p, { idempotencyKey: 'risk', actor: 'synthetic', reason: 'Test', at: source.observedAt }))).rejects.toMatchObject({ code: 'weather_acceptance_required' });
    const r = analyseItinerary(current(s), { asOf: e.expiresAt }); expect(r.requirements.find((r) => r.activityId === 'visit-b' && r.kind === 'weather')?.risk).toBe('unknown');
  });
  it('adopts an existing booked plan without rewriting fields, history, IDs or checklists', async () => {
    const full = await imported(); const old = initialize(full.content.snapshot); old.content.snapshot.trip.plans[1].bookings = [{ id: 'reserved', title: 'Unverified ticket', status: 'done' }];
    const before = canonical(old.content.snapshot); const p = await preview(old, { ...fixture.operation, adoptExistingPlanIds: ['day-a', 'day-b'] }, 0);
    expect(p.canApply).toBe(true); expect(canonical(p.nextContent.snapshot)).toBe(before); expect(p.nextContent.itinerary?.baseline.days).toEqual(fixture.operation.days);
    await expect(preview(old, { ...fixture.operation, days: [{ ...fixture.operation.days[1], title: 'Changed' }], adoptExistingPlanIds: ['day-b'] }, 0)).rejects.toMatchObject({ code: 'adoption_mismatch' });
  });
  it('renders a readonly human report with escaped untrusted text and no writes', async () => {
    const s = await imported(); const i = structuredClone(current(s)); i.current[0].title = '<script>alert(1)</script>'; const before = canonical(i);
    const r = renderItineraryReport(i, { asOf: source.observedAt }); expect(r).toMatchObject({ readOnly: true, saved: false }); expect(r.markdown).toContain('可行性尚未证实'); expect(r.html).not.toContain('<script>'); expect(r.html).toContain('default-src'); expect(canonical(i)).toBe(before);
  });
  it('new overlapping timetable is refused while unresolved imported overlap remains visible', async () => {
    const s = await imported(); const p = await preview(s, edit([{ action: 'update', activityId: 'visit-b', patch: { timing: { start: '08:00', end: '10:30' } } }]), 1); expect(p.reasonCodes).toContain('timeline_overlap');
  });
  it('import never silently displaces existing assignments or reservations', async () => {
    const s = initialize(fixture.snapshot); s.content.snapshot.trip.plans.push({ id: 'old', name: 'Existing day', bookings: [{ id: 'ticket', title: 'Existing ticket', status: 'done' }] }); s.content.snapshot.trip.schedule[date] = { planId: 'old' };
    expect((await preview(s, fixture.operation, 0)).reasonCodes).toContain('existing_assignment_review_required');
    const p = await preview(s, { ...fixture.operation, replaceAssignedDays: [date] }, 0); expect(p.canApply).toBe(false); expect(p.reasonCodes).toContain('booking_activity_link_required');
  });
});
