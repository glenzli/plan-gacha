import { assessItineraryOptions, type OptionPlanningContext } from './optionPlanning';
import type { PlanningMemory } from './planMemory';
import { hash, canonical } from './identity';
import { itinerarySchema, itineraryOperationSchema, itineraryActivitySchema, ItineraryError, type Itinerary, type ItineraryActivity, type ItineraryDay, type ItineraryOperation } from './itinerarySchema';
import { preparePlanningContext, planningSnapshotSchema, type PlanningSnapshot } from '../domain/planningTools';
const fail = (code: string, message: string): never => { throw new ItineraryError(code, message); };
const mins = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));
const end = (a: ItineraryActivity) => a.timing.end === undefined ? undefined : mins(a.timing.end) + 1440 * (a.timing.endDayOffset || 0);
const human = (s: ItineraryActivity['source']) => { if (s.kind === 'provider') fail('unconfirmed_intent', 'Provider observations cannot establish plans, actual progress or decisions'); };
const unique = (ids: string[]) => { if (new Set(ids).size !== ids.length) fail('duplicate_id', 'Itinerary IDs must be unique within each category'); };
const localClockMillis = (stamp: string) => { const t = new Date(stamp); const clock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(t); return mins(clock.slice(0, 5)) * 60000 + Number(clock.slice(6)) * 1000 + t.getUTCMilliseconds(); };
const localDate = (stamp: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(stamp));
const find = (i: Itinerary, id: string) => { for (const d of i.current) { const index = d.activities.findIndex((a) => a.id === id); if (index >= 0) return { day: d, activity: d.activities[index], index }; } return fail('unknown_id', 'Unknown current activity ID'); };
const day = (i: Itinerary, date: string) => i.current.find((d) => d.dateId === date) || fail('unknown_date', 'No imported day at that date');
export function itineraryActivityToken(i: Itinerary, activityId: string) {
  const f = find(i, activityId); const a = f.activity;
  return hash({ dateId: f.day.dateId, planId: f.day.planId, activity: a, from: a.route?.fromActivityId ? find(i, a.route.fromActivityId).activity : null, to: a.route?.toActivityId ? find(i, a.route.toActivityId).activity : null });
}
function projectedStop(a: ItineraryActivity, old: unknown = {}) {
  const prior: Record<string, unknown> = typeof old === 'object' && old ? old as Record<string, unknown> : {};
  const rawLocation = prior.location;
  const oldLabel = typeof rawLocation === 'string' ? rawLocation : rawLocation && typeof rawLocation === 'object' ? (rawLocation as { label?: string; address?: string; query?: string }).label : undefined;
  if (prior.id === a.id && prior.title === a.title && prior.time === a.timing.start && (prior.note ?? prior.description ?? '') === (a.note ?? '') && (prior.weatherRelevant ?? prior.weather_relevant ?? false) === (a.weatherSensitive ?? false) && oldLabel === a.location?.label) return structuredClone(prior);
  const stop: Record<string, unknown> = { ...prior, id: a.id, title: a.title, note: a.note || '', weatherRelevant: a.weatherSensitive ?? false };
  // Remove stale aliases/coordinates/routes, then project only supplied current fields.
  for (const key of ['time', 'description', 'location', 'place', 'weather_relevant', 'transfer', 'transfer_from_previous', 'transferFromPrevious', 'travel_from_previous', 'travelFromPrevious', 'opening_hours', 'openingHours', 'business_hours', 'businessHours', 'hours']) delete stop[key];
  if (a.timing.start) stop.time = a.timing.start;
  if (a.location) stop.location = oldLabel === a.location.label && rawLocation ? rawLocation : { label: a.location.label, query: a.location.label, address: a.location.label };
  return stop;
}
export function projectItinerary(snapshot: PlanningSnapshot, i: Itinerary, previous?: Itinerary, validate = true): PlanningSnapshot {
  const next = structuredClone(snapshot);
  for (const d of i.current) {
    const index = next.trip.plans.findIndex((p) => p.id === d.planId);
    const old = index >= 0 ? next.trip.plans[index] : undefined;
    const oldDay = previous?.current.find((x) => x.dateId === d.dateId);
    const invalidated = new Set<string>();
    for (const [position, a] of d.activities.entries()) {
      const before = oldDay?.activities.find((x) => x.id === a.id);
      if (oldDay && (canonical(before?.location) !== canonical(a.location) || canonical(before?.route) !== canonical(a.route) || oldDay.activities[position]?.id !== a.id)) { invalidated.add(a.id); if (d.activities[position + 1]) invalidated.add(d.activities[position + 1].id); }
    }
    const plan = { ...old, id: d.planId, name: d.title, stops: d.activities.map((a) => {
      const stop = projectedStop(a, old?.stops?.find((s) => typeof s === 'object' && s.id === a.id));
      if (invalidated.has(a.id)) for (const key of ['transfer', 'transfer_from_previous', 'transferFromPrevious', 'travel_from_previous', 'travelFromPrevious']) delete stop[key];
      return stop;
    }) };
    if (index < 0) next.trip.plans.push(plan); else next.trip.plans[index] = plan;
    next.trip.schedule[d.dateId] = { ...next.trip.schedule[d.dateId], planId: d.planId };
    delete next.trip.schedule[d.dateId].status;
  }
  planningSnapshotSchema.parse(next); if (validate) preparePlanningContext(next); return next;
}
export function validateItinerary(input: unknown, snapshot: PlanningSnapshot): Itinerary {
  const parsed = itinerarySchema.safeParse(input); if (!parsed.success) return fail('invalid_itinerary', 'Itinerary schema is invalid');
  const i = parsed.data; const dates = new Set(preparePlanningContext(snapshot).tripDates.map((d) => d.id));
  const registered = new Set(i.registeredActivityIds); unique(i.registeredActivityIds);
  for (const days of [i.baseline.days, i.current]) {
    unique(days.map((d) => d.dateId)); unique(days.map((d) => d.planId)); unique(days.flatMap((d) => d.activities.map((a) => a.id)));
    for (const d of days) {
      if (!dates.has(d.dateId)) fail('unknown_date', 'Itinerary day is outside the journey');
      for (const a of d.activities) { human(a.source); if (!registered.has(a.id)) fail('invalid_reference', 'Unregistered stable activity ID'); }
    }
  }
  human(i.baseline.source);
  for (const records of [i.constraints, i.commitments, i.actual, i.options, i.decisionPoints, i.optionDecisions, i.evidence]) unique(records.map((r) => r.id));
  for (const r of [...i.constraints, ...i.commitments, ...i.actual]) {
    human(r.source); if (!dates.has(r.dateId)) fail('unknown_date', 'Record date is outside the journey');
    if (r.activityId && !registered.has(r.activityId)) fail('unknown_id', 'Record references an unknown stable activity ID');
  }
  for (const d of i.current) for (const a of d.activities) for (const id of [a.route?.fromActivityId, a.route?.toActivityId]) if (id) {
    const endpoint = find(i, id); if (endpoint.day.dateId !== d.dateId || id === a.id || endpoint.activity.kind === 'transfer') fail('invalid_reference', 'Route endpoints must be other place activities on the same day');
  }
  for (const r of [...i.constraints, ...i.commitments]) if (r.activityId) {
    const f = find(i, r.activityId); if (f.day.dateId !== r.dateId) fail('invalid_reference', 'Commitment/constraint date must match the current activity');
  }
  const actualStarts = new Map<string, Itinerary['actual'][number]>();
  for (const r of i.actual) {
    const start = r.activityId ? actualStarts.get(r.activityId) : undefined;
    if (r.kind === 'finished' && r.at && start && (start.at && Date.parse(r.at) < Date.parse(start.at) || start.bounds?.after && localDate(r.at) === start.dateId && localClockMillis(r.at) <= mins(start.bounds.after) * 60000)) fail('invalid_actual_sequence', 'Reported finish precedes a known/exclusive start bound');
    if (r.kind === 'started' && r.activityId) actualStarts.set(r.activityId, r);
    if (r.at && (localDate(r.at) !== r.dateId || Date.parse(r.at) > Date.parse(r.source.observedAt))) fail('invalid_actual_time', 'Actual timestamp must match the local day and cannot follow its report');
  }
  for (const r of i.evidence) {
    if (!registered.has(r.activityId) || !dates.has(r.dateId)) fail('invalid_reference', 'Evidence references an unknown activity/date');
  }
  for (const o of i.options) {
    human(o.source); if (o.dateIds.some((d) => !dates.has(d))) fail('unknown_date', 'Option date is outside the journey');
    if (o.requirements) {
      human(o.requirements.source);
      for (const r of o.requirements.plans) {
        if (!snapshot.trip.plans.some((p) => p.id === r.planId)) fail('unknown_id', 'Option requires an unknown plan');
        if (!o.dateIds.includes(r.dateId)) fail('invalid_reference', 'Required plan dates must belong to this option');
      }
    }
  }
  for (const p of i.decisionPoints) { human(p.source); unique(p.optionIds); if (p.optionIds.some((id) => !i.options.some((o) => o.id === id))) fail('unknown_id', 'Decision references an unknown option'); }
  for (const p of i.decisionPoints) if (p.lifecycle) {
    human(p.lifecycle.source);
    if (Date.parse(p.lifecycle.source.observedAt) <= Date.parse(p.source.observedAt)) fail('invalid_decision_state', 'Decision status evidence must follow creation');
    if (p.lifecycle.status !== 'open' && i.optionDecisions.some((c) => c.decisionPointId === p.id && Date.parse(c.source.observedAt) >= Date.parse(p.lifecycle!.source.observedAt))) fail('invalid_decision_state', 'Closed decisions cannot have a later choice; reopen first');
  }
  for (const c of i.optionDecisions) { human(c.source); const p = i.decisionPoints.find((p) => p.id === c.decisionPointId); if (!p || !p.optionIds.includes(c.optionId)) fail('invalid_reference', 'Choice must belong to its decision point'); }
  if (canonical(projectItinerary(snapshot, i)) !== canonical(snapshot)) fail('projection_mismatch', 'Current itinerary and legacy snapshot projection differ; use itinerary preview/apply');
  return i;
}
export function assessItineraryEvidence(i: Itinerary, e: Itinerary['evidence'][number], asOf: string) {
  const reasons: string[] = [];
  const f = i.current.flatMap((d) => d.activities.map((a) => ({ d, a }))).find(({ a }) => a.id === e.activityId);
  let status: 'fresh_estimate' | 'unknown' | 'stale' | 'unavailable' | 'mismatch' = 'fresh_estimate';
  if (!f || f.d.dateId !== e.dateId || itineraryActivityToken(i, e.activityId) !== e.activityToken) { status = 'mismatch'; reasons.push('activity_changed'); }
  else if (e.kind === 'route' && (f.a.kind !== 'transfer' || f.a.route?.mode !== e.mode) && e.status === 'estimate') { status = 'mismatch'; reasons.push('route_mode_mismatch'); }
  else if (e.kind === 'weather' && e.forecastDateId !== e.dateId && e.status === 'estimate') { status = 'mismatch'; reasons.push('forecast_date_mismatch'); }
  else if (Date.parse(e.source.observedAt) > Date.parse(asOf)) { status = 'unknown'; reasons.push('future_observation'); }
  else if (Date.parse(e.expiresAt) <= Date.parse(asOf)) { status = 'stale'; reasons.push('expired_evidence'); }
  else if (e.status !== 'estimate') { status = e.status; reasons.push('provider_result_not_available'); }
  else if (e.kind === 'place' && e.identity !== 'matched' || e.kind === 'weather' && e.risk === 'unknown') { status = 'unknown'; reasons.push('unresolved_identity_or_weather'); }
  const synthetic = e.captureKind === 'fixture' || e.source.kind !== 'provider' || /^(fixture|synthetic):/i.test(e.source.reference);
  if (synthetic) reasons.push('fixture_or_nonprovider');
  return { id: e.id, kind: e.kind, status, reasonCodes: reasons, canUseForComparison: status === 'fresh_estimate' && !synthetic, source: e.source, expiresAt: e.expiresAt, synthetic };
}
function clockConstraints(i: Itinerary) {
  return i.constraints.filter((c) => ['start_at', 'end_before', 'end_by'].includes(c.kind)).map((c) => {
    const a = i.current.find((d) => d.dateId === c.dateId)?.activities.find((a) => a.id === c.activityId);
    const value = c.kind === 'start_at' ? a?.timing.start ? mins(a.timing.start) : undefined : a ? end(a) : undefined;
    const target = mins(c.clock!);
    const excess = value === undefined ? undefined : c.kind === 'start_at' ? Math.abs(value - target) : c.kind === 'end_before' ? Math.max(0, value - target + 1) : Math.max(0, value - target);
    return { id: c.id, dateId: c.dateId, activityId: c.activityId, strength: c.strength, kind: c.kind, status: excess === undefined ? 'unknown' : excess > 0 ? 'violated' : 'matches_declared_times', excessMinutes: excess ?? null, clock: c.clock, text: c.text };
  });
}
function overlaps(i: Itinerary) {
  return i.current.flatMap((d) => {
    const results: Array<{ dateId: string; activityId: string; previousActivityId: string; overlapMinutes: number }> = [];
    let latest: { id: string; end: number } | undefined;
    for (const a of d.activities) {
      const start = a.timing.start ? mins(a.timing.start) : undefined; const finish = end(a);
      if (start !== undefined && latest && start < latest.end) results.push({ dateId: d.dateId, activityId: a.id, previousActivityId: latest.id, overlapMinutes: latest.end - start });
      if (finish !== undefined && (!latest || finish > latest.end)) latest = { id: a.id, end: finish };
      else if (start !== undefined && (!latest || start > latest.end)) latest = { id: a.id, end: start };
    } return results;
  });
}
export function analyseItinerary(i: Itinerary, input: unknown, scope?: OptionPlanningContext) {
  const parsed = zAnalysis.safeParse(input); if (!parsed.success) fail('invalid_analysis', 'Analysis requires an explicit ISO asOf and optional imported date');
  const { asOf, dateId } = parsed.data!; if (dateId) day(i, dateId);
  const days = i.current.filter((d) => !dateId || d.dateId === dateId);
  const constraints = clockConstraints(i).filter((c) => !dateId || c.dateId === dateId);
  const assessments = i.evidence.map((e) => assessItineraryEvidence(i, e, asOf));
  const requirements = days.flatMap((d) => d.activities.flatMap((a) => {
    const kinds = [...(a.kind === 'transfer' ? ['route'] : a.location ? ['place'] : []), ...(a.weatherSensitive ? ['weather'] : [])];
    return kinds.map((kind) => {
      const e = i.evidence.filter((e) => e.activityId === a.id && e.dateId === d.dateId && e.kind === kind).sort((a, b) => Date.parse(b.source.observedAt) - Date.parse(a.source.observedAt) || i.evidence.indexOf(b) - i.evidence.indexOf(a))[0];
      const assessment = e ? assessments.find((x) => x.id === e.id)! : null;
      const usable = Boolean(assessment?.canUseForComparison);
      const slot = a.timing.start && end(a) !== undefined ? end(a)! - mins(a.timing.start) : undefined;
      return { dateId: d.dateId, activityId: a.id, kind, evidenceId: e?.id ?? null, status: assessment?.status ?? 'unknown', reasonCodes: assessment?.reasonCodes ?? ['missing_evidence'], canUseForComparison: usable,
        estimateFit: kind === 'route' && usable && slot !== undefined && e?.durationMinutes ? e.durationMinutes.max <= slot ? 'estimate_fits_slot' : 'estimate_exceeds_slot' : 'unknown',
        risk: kind === 'weather' && usable ? e?.risk ?? 'unknown' : 'unknown' };
    });
  }));
  const numericConstraints = i.constraints.filter((c) => c.kind.startsWith('max_') && (!dateId || c.dateId === dateId)).map((c) => {
    const transfers = day(i, c.dateId).activities.filter((a) => a.route?.mode === (c.kind === 'max_driving_minutes' ? 'driving' : 'walking') && (!c.activityId || a.id === c.activityId));
    let total = 0; let complete = transfers.length > 0;
    for (const a of transfers) { const r = requirements.find((r) => r.activityId === a.id && r.kind === 'route'); const e = i.evidence.find((e) => e.id === r?.evidenceId); const value = c.kind === 'max_driving_minutes' ? e?.durationMinutes?.max : e?.distanceMeters; if (!r?.canUseForComparison || value === undefined) complete = false; else total += value; }
    return { id: c.id, kind: c.kind, strength: c.strength, status: complete ? total <= c.limit! ? 'estimate_within_limit' : 'estimate_exceeds_limit' : 'unknown', estimatedTotal: complete ? total : null, limit: c.limit };
  });
  const actual = i.actual.filter((a) => !dateId || a.dateId === dateId).map((r) => {
    const planned = i.baseline.days.find((d) => d.dateId === r.dateId)?.activities.find((a) => a.id === r.activityId);
    const earliest = r.bounds?.after ? mins(r.bounds.after) : undefined;
    return { ...r, exactTimeKnown: Boolean(r.at), departureDelayLowerBoundMinutes: r.kind === 'started' && earliest !== undefined && planned?.timing.start ? Math.max(0, earliest - mins(planned.timing.start)) : null, lowerBoundExclusive: Boolean(r.bounds?.after) };
  });
  const optionAnalysis = assessItineraryOptions(i, scope);
  const decisions = i.decisionPoints.map((p) => {
    const closed = p.lifecycle && p.lifecycle.status !== 'open';
    // A reopening starts a new decision round; earlier choices remain audit data.
    const previousChoice = i.optionDecisions.filter((c) => c.decisionPointId === p.id).at(-1);
    const choice = closed ? undefined : i.optionDecisions.filter((c) => c.decisionPointId === p.id && (!p.lifecycle || Date.parse(c.source.observedAt) > Date.parse(p.lifecycle.source.observedAt))).at(-1);
    const invalidChoice = choice && optionAnalysis.inactiveOptions.some((o) => o.id === choice.optionId);
    const status = closed ? p.lifecycle!.status : invalidChoice ? 'choice_invalidated' : choice ? 'decision_recorded' : 'open';
    return { ...p, currentOptionIds: optionAnalysis.options.filter((o) => p.optionIds.includes(o.id)).map((o) => o.id), unassessedOptionIds: optionAnalysis.unassessedOptions.filter((o) => p.optionIds.includes(o.id)).map((o) => o.id), inactiveOptionIds: optionAnalysis.inactiveOptions.filter((o) => p.optionIds.includes(o.id)).map((o) => o.id), deadlineStatus: closed ? 'inactive' : p.deadline ? Date.parse(p.deadline) <= Date.parse(asOf) ? 'due' : 'upcoming' : 'unknown', status,
      requiresAction: status === 'open' || status === 'choice_invalidated', choice: invalidChoice ? null : choice || null, choiceEligibility: choice ? [...optionAnalysis.options, ...optionAnalysis.unassessedOptions, ...optionAnalysis.inactiveOptions].find((o) => o.id === choice.optionId)?.eligibility || null : null, previousChoice: previousChoice || null, scheduleApplied: false, cancellationPerformed: false, refundVerified: false };
  });
  return { schemaVersion: 1, timeZone: i.timeZone, asOf, feasibility: 'not_proven', clockConstraints: constraints, numericConstraints, overlaps: overlaps(i).filter((r) => !dateId || r.dateId === dateId), requirements, evidence: assessments, actual, ...optionAnalysis, decisions,
    advisoryEvents: decisions.filter((p) => p.requiresAction).map((p) => ({ code: 'decision_needed', decisionPointId: p.id, deadline: p.deadline ?? null, deadlineStatus: p.deadlineStatus, text: p.text, automaticAction: false })),
    preferences: i.constraints.filter((c) => c.kind === 'preference'), limitations: ['Caller-supplied estimates and evidence are not authenticated guarantees', 'No automatic traffic/weather polling, branch activation, booking or cancellation', 'Actual reports never imply unreported arrival, completion or check-in'] };
}
import * as z from 'zod/v4';
const zAnalysis = z.strictObject({ asOf: z.iso.datetime({ offset: true }), dateId: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
function append<T extends { id: string }>(items: T[], record: T) { if (items.some((r) => r.id === record.id)) fail('duplicate_id', 'Record ID already exists'); items.push(record); }
export function previewItineraryOperation(snapshot: PlanningSnapshot, previous: Itinerary | undefined, input: unknown, memory?: PlanningMemory) {
  const parsed = itineraryOperationSchema.safeParse(input); if (!parsed.success) return fail('invalid_operation', 'Itinerary operation schema is invalid');
  const op = parsed.data; const blocks: string[] = []; let next: Itinerary; const changedDays: string[] = [];
  if (op.type === 'import_itinerary') {
    human(op.source); if (previous) fail('baseline_exists', 'Baseline already exists; use explicit edits, never replace it');
    for (const d of op.days) {
      const old = snapshot.trip.plans.find((p) => p.id === d.planId);
      if (old) {
        if (!op.adoptExistingPlanIds?.includes(d.planId)) fail('duplicate_id', 'Explicit adoption is required for an existing plan ID');
        if (snapshot.trip.schedule[d.dateId]?.planId !== d.planId || snapshot.trip.schedule[d.dateId]?.status === 'abandoned' || old.name !== d.title || canonical(old.stops) !== canonical(d.activities.map((a) => projectedStop(a, old.stops?.find((s) => typeof s === 'object' && s.id === a.id))))) fail('adoption_mismatch', 'Adoption must preserve the active plan, ordered stable IDs and existing projected fields exactly');
      } else if (op.adoptExistingPlanIds?.includes(d.planId)) fail('unknown_id', 'Cannot adopt an unknown plan');
      const entry = snapshot.trip.schedule[d.dateId]; if (entry?.planId && entry.planId !== d.planId && !op.replaceAssignedDays?.includes(d.dateId)) blocks.push('existing_assignment_review_required');
      changedDays.push(d.dateId);
    }
    if (op.replaceAssignedDays?.some((date) => !op.days.some((d) => d.dateId === date) || !snapshot.trip.schedule[date]?.planId)) fail('invalid_reference', 'Replacement acknowledgements must name affected assigned days');
    if (op.adoptExistingPlanIds?.some((id) => !op.days.some((d) => d.planId === id))) fail('invalid_reference', 'Adoption list must name imported existing plans');
    next = { schemaVersion: 1, timeZone: op.timeZone, baseline: { source: op.source, days: structuredClone(op.days) }, current: structuredClone(op.days), registeredActivityIds: op.days.flatMap((d) => d.activities.map((a) => a.id)), actual: [], constraints: structuredClone(op.constraints), commitments: structuredClone(op.commitments), options: structuredClone(op.options), decisionPoints: structuredClone(op.decisionPoints), optionDecisions: [], evidence: [] };
  } else {
    if (!previous) return fail('itinerary_missing', 'Import an explicit itinerary first'); next = structuredClone(previous);
    if (op.type === 'edit_itinerary') {
      human(op.source);
      for (const c of op.changes) {
        if (c.action === 'add_day') {
          if (next.current.some((d) => d.dateId === c.day.dateId || d.planId === c.day.planId) || snapshot.trip.plans.some((p) => p.id === c.day.planId)) fail('duplicate_id', 'New day requires a new date and plan ID');
          if (snapshot.trip.schedule[c.day.dateId]?.planId) blocks.push('existing_assignment_review_required');
          for (const a of c.day.activities) { human(a.source); if (next.registeredActivityIds.includes(a.id)) fail('duplicate_id', 'New day activity IDs cannot be reused'); next.registeredActivityIds.push(a.id); }
          next.current.push(c.day); next.current.sort((a, b) => a.dateId.localeCompare(b.dateId)); changedDays.push(c.day.dateId);
        } else if (c.action === 'insert') {
          human(c.activity.source); if (next.registeredActivityIds.includes(c.activity.id)) fail('duplicate_id', 'Stable IDs cannot be reused, including removed activities');
          const d = day(next, c.dateId); if (c.index > d.activities.length) fail('invalid_index', 'Insert index is outside the day'); d.activities.splice(c.index, 0, c.activity); next.registeredActivityIds.push(c.activity.id); changedDays.push(d.dateId);
        } else if (c.action === 'reorder') {
          const d = day(next, c.dateId); unique(c.activityIds); if (c.activityIds.length !== d.activities.length || c.activityIds.some((id) => !d.activities.some((a) => a.id === id))) fail('invalid_order', 'Reorder must be an exact permutation'); d.activities = c.activityIds.map((id) => d.activities.find((a) => a.id === id)!); changedDays.push(d.dateId);
        } else {
          const f = find(next, c.activityId); changedDays.push(f.day.dateId);
          if (c.action === 'remove') f.day.activities.splice(f.index, 1);
          else if (c.action === 'update') { const patched = itineraryActivitySchema.safeParse({ ...f.activity, ...c.patch, source: op.source }); if (!patched.success) fail('invalid_activity', 'Patched activity violates the timing/route schema'); f.day.activities[f.index] = patched.data!; }
          else { const target = day(next, c.dateId); f.day.activities.splice(f.index, 1); if (c.index > target.activities.length) fail('invalid_index', 'Move index is outside the target day'); target.activities.splice(c.index, 0, f.activity); changedDays.push(c.dateId); }
        }
      }
      for (const d of previous.current) for (const a of d.activities) {
        const afterDay = next.current.find((other) => other.activities.some((x) => x.id === a.id)); const after = afterDay?.activities.find((x) => x.id === a.id);
        const changed = !after || afterDay?.dateId !== d.dateId || canonical(after) !== canonical(a);
        const reordered = op.changes.some((c) => c.action === 'reorder' && c.dateId === d.dateId) && afterDay?.activities.findIndex((x) => x.id === a.id) !== d.activities.indexOf(a);
        if ((changed || reordered) && previous.commitments.some((c) => c.dateId === d.dateId && (!c.activityId || c.activityId === a.id))) blocks.push('fixed_or_reserved_activity_change');
        const finished = previous.actual.some((r) => r.activityId === a.id && r.kind === 'finished');
        const started = previous.actual.some((r) => r.activityId === a.id && r.kind === 'started');
        const startedIdentityChanged = !after || afterDay?.dateId !== d.dateId || after.kind !== a.kind || after.title !== a.title || canonical(after.location) !== canonical(a.location) || canonical(after.route) !== canonical(a.route);
        if ((finished && (changed || reordered)) || (started && (startedIdentityChanged || reordered))) blocks.push('actual_activity_change');
      }
      for (const c of next.constraints.filter((c) => c.strength === 'hard' && c.activityId)) if (!next.current.some((d) => d.dateId === c.dateId && d.activities.some((a) => a.id === c.activityId))) blocks.push('hard_constraint_activity_removed');
      const before = clockConstraints(previous);
      for (const c of clockConstraints(next).filter((c) => c.strength === 'hard')) { const old = before.find((x) => x.id === c.id)!; if (c.status === 'unknown' && old.status !== 'unknown' || c.status === 'violated' && (old.status !== 'violated' || c.excessMinutes! > old.excessMinutes!)) blocks.push('hard_time_constraint_worsened'); }
      const oldOverlaps = overlaps(previous); if (overlaps(next).some((r) => !oldOverlaps.some((old) => old.activityId === r.activityId && old.previousActivityId === r.previousActivityId && old.overlapMinutes >= r.overlapMinutes))) blocks.push('timeline_overlap');
    } else if (op.type === 'set_option_requirements') {
      human(op.source); const option = next.options.find((o) => o.id === op.optionId);
      if (!option) return fail('unknown_id', 'Unknown option ID');
      if (Date.parse(op.source.observedAt) <= Date.parse(option.requirements?.source.observedAt || option.source.observedAt)) blocks.push('stale_option_evidence');
      if (!blocks.length) option.requirements = { plans: op.plans, reason: op.reason, source: op.source };
    } else if (op.type === 'record_actual') { human(op.record.source); if (op.record.activityId && find(next, op.record.activityId).day.dateId !== op.record.dateId) fail('actual_date_mismatch', 'Actual report must reference the activity on its current dated plan'); append(next.actual, op.record); }
    else if (op.type === 'choose_option' || op.type === 'set_decision_status') {
      const decisionPointId = op.type === 'choose_option' ? op.record.decisionPointId : op.decisionPointId;
      const source = op.type === 'choose_option' ? op.record.source : op.source; human(source);
      const point = next.decisionPoints.find((p) => p.id === decisionPointId);
      if (!point) return fail('unknown_id', 'Unknown decision point ID');
      const latestEvidence = Math.max(Date.parse(point.source.observedAt), point.lifecycle ? Date.parse(point.lifecycle.source.observedAt) : -Infinity,
        ...next.optionDecisions.filter((c) => c.decisionPointId === point.id).map((c) => Date.parse(c.source.observedAt)));
      // Legacy choices without lifecycle keep their accepted format. New lifecycle evidence
      // and every choice in a managed lifecycle must be strictly newer than prior evidence.
      if ((op.type === 'set_decision_status' || point.lifecycle) && Date.parse(source.observedAt) <= latestEvidence) blocks.push('stale_decision_evidence');
      if (op.type === 'choose_option') {
        if (point.lifecycle && point.lifecycle.status !== 'open') blocks.push('decision_closed');
        if (!point.optionIds.includes(op.record.optionId)) return fail('invalid_reference', 'Choice must belong to its decision point');
        if (assessItineraryOptions(next, { snapshot, memory }).inactiveOptions.some((o) => o.id === op.record.optionId)) blocks.push('option_unavailable');
        if (!blocks.length) append(next.optionDecisions, op.record);
      } else if (!blocks.length) point.lifecycle = { status: op.status, confirmation: op.confirmation, reason: op.reason, source: op.source };
    }
    else if (op.type === 'itinerary_constraint') { human(op.record.source); append(next.constraints, op.record); }
    else if (op.type === 'itinerary_commitment') { human(op.record.source); append(next.commitments, op.record); }
    else if (op.type === 'itinerary_option') { human(op.record.source); append(next.options, op.record); }
    else if (op.type === 'itinerary_decision_point') { human(op.record.source); append(next.decisionPoints, op.record); }
    else {
      const assessment = assessItineraryEvidence(next, op.record, op.record.source.observedAt);
      if (assessment.status === 'mismatch') blocks.push('evidence_binding_mismatch'); append(next.evidence, op.record);
    }
  }
  const changed = [...new Set(changedDays)].filter((date) => op.type === 'import_itinerary' && op.adoptExistingPlanIds?.includes(next.current.find((d) => d.dateId === date)!.planId) ? false : canonical(previous?.current.find((d) => d.dateId === date)) !== canonical(next.current.find((d) => d.dateId === date)));
  for (const date of changed) {
    const entry = snapshot.trip.schedule[date]; const oldPlan = snapshot.trip.plans.find((p) => p.id === entry?.planId);
    if (entry?.planLocked) blocks.push('locked_plan_change');
    if (previous && date < snapshot.todayId) blocks.push('historical_activity_change');
    for (const b of oldPlan?.bookings?.filter((b) => b.status === 'done') || []) {
      if (op.type === 'import_itinerary' || !b.stopIds?.length || !b.stopLinkSource || b.stopLinkSource.kind === 'provider') blocks.push('booking_activity_link_required');
      else for (const id of b.stopIds) {
        const old = previous?.current.find((d) => d.dateId === date)?.activities.find((a) => a.id === id); const after = next.current.find((d) => d.dateId === date)?.activities.find((a) => a.id === id);
        const reordered = op.type === 'edit_itinerary' && op.changes.some((c) => c.action === 'reorder' && c.dateId === date) && previous?.current.find((d) => d.dateId === date)?.activities.findIndex((a) => a.id === id) !== next.current.find((d) => d.dateId === date)?.activities.findIndex((a) => a.id === id);
        if (!old || !after || canonical(old) !== canonical(after) || reordered) blocks.push('booked_activity_locked');
      }
    }
    if (entry?.lodgingLocked && previous) {
      const old = previous.current.find((d) => d.dateId === date)?.activities.filter((a) => a.kind === 'lodging'); const after = next.current.find((d) => d.dateId === date)?.activities.filter((a) => a.kind === 'lodging'); if (canonical(old) !== canonical(after)) blocks.push('locked_lodging_change');
    }
  }
  const projected = projectItinerary(snapshot, next, previous, false);
  if (!blocks.length) validateItinerary(next, projected);
  const observedAt = 'source' in op ? op.source.observedAt : op.record.source.observedAt;
  const analysis = analyseItinerary(next, { asOf: observedAt }, { snapshot: blocks.length ? snapshot : projected, memory });
  return { nextItinerary: next, nextSnapshot: projected, blocks: [...new Set(blocks)], changedDays: changed, detail: { kind: op.type, ...(op.type === 'set_decision_status' ? { decisionChange: { decisionPointId: op.decisionPointId, before: previous?.decisionPoints.find((p) => p.id === op.decisionPointId)?.lifecycle || null, after: next.decisionPoints.find((p) => p.id === op.decisionPointId)?.lifecycle || null, cancellationPerformed: false, refundVerified: false } } : {}), changedDays: changed, changes: changed.map((date) => ({ dateId: date, before: previous?.current.find((d) => d.dateId === date) || null, after: next.current.find((d) => d.dateId === date) || null })), analysis }, weatherOverride: op.type === 'edit_itinerary' && analysis.requirements.some((r) => changed.includes(r.dateId) && r.kind === 'weather' && r.risk === 'blocked') };
}
export type { ItineraryOperation, ItineraryDay };
