#!/usr/bin/env node
import { MAX_STORE_BYTES } from './limits';
import { exportPresentationView } from './presentation';
import { analyseCapacity } from './capacity';
import { analyseEvidenceImpact } from './evidenceImpact';
import { reconcileReminders } from './reminderReconcile';
import { exportReadonlyView } from './readonlyView';
import { observationPlanToken } from './observations';
import { linkageQuerySchema } from './linkageSchema';
import { assessItineraryOptions } from './optionPlanning';
import { experienceSearchRequestSchema } from './experienceSchema';
import { searchExperiences, createGuideDraft } from './experiences';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { apply, initialize, inspect, preview, parseState, hash } from './engine';
import { createStore, loadState, commitStore, stageStore } from './store';
import { renderItineraryReport } from './itineraryReport';
import { analyseItinerary, itineraryActivityToken } from './itinerary';
import { ItineraryError } from './itinerarySchema';
import { getOperatorSchema, readOperatorContext } from './operator';
import { TripError } from './schema';
import { prepareWalkingQuery, importWalkingObservation, inspectWalkingRoutes, RouteEvidenceError } from './routeEvidence';
const json = async (path: string | undefined) => { if (!path) throw new TripError('missing_argument', 'A JSON input path is required'); if (path === '-') { process.stdin.setEncoding('utf8'); let text = ''; for await (const chunk of process.stdin) { text += chunk; if (Buffer.byteLength(text) > MAX_STORE_BYTES) throw new TripError('input_too_large', 'JSON stdin exceeds 16 MiB'); } return JSON.parse(text); } return JSON.parse(await readFile(path, 'utf8')); };
async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { store: { type: 'string' }, input: { type: 'string' }, output: { type: 'string' }, revision: { type: 'string' }, date: { type: 'string' }, request: { type: 'string' }, help: { type: 'boolean' }, operation: { type: 'string' }, 'as-of': { type: 'string' }, limit: { type: 'string' } } });
  const command = positionals[0]; const path = values.store;
  if (values.help || !command) return { ...getOperatorSchema(), usage: 'tripctl <command> --store journey.json [--input request.json|-] [--revision N] [--output candidate.json]; schema [--operation TYPE]; context --store journey.json --as-of ISO [--date YYYY-MM-DD] [--limit N]' };
  if (values.input === '-' && values.request === '-') throw new TripError('ambiguous_stdin', 'Only one JSON argument may consume stdin');
  if (command === 'schema') return getOperatorSchema(values.operation);
  if (command === 'experience-search') { const parsed = experienceSearchRequestSchema.safeParse(await json(values.input)); if (!parsed.success) throw new TripError('invalid_experience_query', 'Use {journeys,query} with explicit current states and asOf'); return searchExperiences(parsed.data.journeys, parsed.data.query); }
  if (!path) throw new TripError('missing_argument', '--store is required');
  if (command === 'init') { const state = initialize(await json(values.input)); await createStore(path, state); return { ok: true, revision: 0, saved: true, durability: 'local_filesystem', externalCheckpointVerified: false, stateHash: hash(state) }; }
  const state = await loadState(path);
  if (command === 'presentation-view') return exportPresentationView(state, await json(values.input));
  if (command === 'capacity') return analyseCapacity(state);
  if (command === 'evidence-impact') return analyseEvidenceImpact(state, await json(values.input));
  if (command === 'reminder-reconcile') { const q = linkageQuerySchema.safeParse(await json(values.input)); if (!q.success) throw new TripError('invalid_linkage_query', 'Supply explicit asOf'); return reconcileReminders(state, q.data.asOf); }
  if (command === 'readonly-view') return exportReadonlyView(state, await json(values.input));
  if (command === 'observation-token') { const input = await json(values.input); return { ok: true, saved: false, revision: state.revision, planId: input.planId, planToken: observationPlanToken(state.content, input.planId) }; }
  if (command === 'experiences') return searchExperiences([state], await json(values.input));
  if (command === 'guide-draft') return createGuideDraft(state, await json(values.input));
  if (command === 'context') return readOperatorContext(state, { asOf: values['as-of'], ...(values.date ? { dateId: values.date } : {}), ...(values.limit !== undefined ? { candidateLimit: Number(values.limit) } : {}) });
  if (command === 'read') return { ok: true, operatorPolicy: ['Read current state before each planning turn', 'Keep uncertainty and explicit sources', 'Preview before apply', 'Only acknowledge durable persistence after its receipt', 'Never treat estimates as guarantees'], revision: state.revision, stateHash: hash(state), ...state.content, lastChange: state.history.at(-1) ? { id: state.history.at(-1)!.id, reason: state.history.at(-1)!.reason, at: state.history.at(-1)!.at } : null };
  if (command === 'verify') return { ok: true, revision: parseState(state).revision, stateHash: hash(state), historyCount: state.history.length, externalCheckpointVerified: false };
  if (command === 'history') return { ok: true, revision: state.revision, events: state.history.map(({ before: _before, after: _after, ...event }) => ({ ...event, beforeHash: hash(_before), afterHash: hash(_after) })) };
  if (command === 'check' || command === 'rank') return { revision: state.revision, result: await inspect(state, command === 'check' ? 'evaluate_plan' : 'rank_candidates', values.date), ...(command === 'check' && state.content.itinerary ? { optionAnalysis: assessItineraryOptions(state.content.itinerary, state.content) } : {}) };
  if (command === 'route-query') return { ok: true, revision: state.revision, saved: false, descriptor: prepareWalkingQuery(state.content.snapshot, await json(values.input)) };
  if (command === 'route-import') return { ok: true, revision: state.revision, saved: false, operation: { type: 'map_fact', fact: await importWalkingObservation(await json(values.request), await json(values.input)) } };
  if (command === 'routes') return { ok: true, revision: state.revision, saved: false, result: inspectWalkingRoutes(state.content.snapshot, state.content.memory.mapFacts, await json(values.input)) };
  if (command === 'itinerary') { if (!state.content.itinerary) throw new TripError('itinerary_missing', 'Import an itinerary first'); return { ok: true, revision: state.revision, saved: false, result: analyseItinerary(state.content.itinerary, await json(values.input), state.content) }; }
  if (command === 'itinerary-report') { if (!state.content.itinerary) throw new TripError('itinerary_missing', 'Import an itinerary first'); return { ok: true, revision: state.revision, ...renderItineraryReport(state.content.itinerary, await json(values.input), state.content) }; }
  if (command === 'itinerary-token') { if (!state.content.itinerary) throw new TripError('itinerary_missing', 'Import an itinerary first'); const input = await json(values.input); return { ok: true, revision: state.revision, saved: false, activityToken: itineraryActivityToken(state.content.itinerary, input.activityId) }; }
  if (command === 'preview') { const revision = Number(values.revision); if (values.revision === undefined || !Number.isSafeInteger(revision) || revision < 0) throw new TripError('missing_revision', '--revision must be an explicit nonnegative integer'); return { ok: true, ...await preview(state, await json(values.input), revision) }; }
  if (command === 'apply') return { ok: true, ...await commitStore(path, await json(values.input)) };
  if (command === 'stage') { if (!values.output) throw new TripError('missing_argument', '--output is required'); return { ok: true, ...await stageStore(path, values.output, await json(values.input)) }; }
  if (command === 'validate-request') return { ok: true, receipt: (await apply(state, await json(values.input))).receipt, saved: false };
  throw new TripError('unknown_command', 'Use --help to discover supported commands');
}
main().then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => {
  process.stdout.write(`${JSON.stringify({ ok: false, saved: false, error: { code: error instanceof TripError || error instanceof RouteEvidenceError || error instanceof ItineraryError ? error.code : 'invalid_input_or_io', message: error instanceof TripError || error instanceof RouteEvidenceError || error instanceof ItineraryError ? error.message : 'Input validation or filesystem operation failed' } })}\n`);
  process.exitCode = 1;
});
