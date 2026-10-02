#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { apply, initialize, inspect, preview, parseState, hash } from './engine';
import { createStore, loadState, commitStore, stageStore } from './store';
import { TripError } from './schema';
import { prepareWalkingQuery, importWalkingObservation, inspectWalkingRoutes, RouteEvidenceError } from './routeEvidence';
const json = async (path: string | undefined) => { if (!path) throw new TripError('missing_argument', 'A JSON input path is required'); return JSON.parse(await readFile(path, 'utf8')); };
async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { store: { type: 'string' }, input: { type: 'string' }, output: { type: 'string' }, revision: { type: 'string' }, date: { type: 'string' }, request: { type: 'string' }, help: { type: 'boolean' } } });
  const command = positionals[0]; const path = values.store;
  if (values.help || !command) return { ok: true, commands: ['init', 'read', 'check', 'rank', 'preview', 'apply', 'stage', 'history', 'verify', 'route-query', 'route-import', 'routes'], usage: 'tripctl <command> --store journey.json [--input request.json] [--revision N] [--output candidate.json] [--date YYYY-MM-DD]', policy: 'Read current state first. Preview every mutation. In ephemeral environments use stage and acknowledge durable CAS backup before claiming success. No network calls or credential handling.' };
  if (!path) throw new TripError('missing_argument', '--store is required');
  if (command === 'init') { const state = initialize(await json(values.input)); await createStore(path, state); return { ok: true, revision: 0, saved: true, durability: 'local_filesystem', externalCheckpointVerified: false, stateHash: hash(state) }; }
  const state = await loadState(path);
  if (command === 'read') return { ok: true, operatorPolicy: ['Read current state before each planning turn', 'Keep uncertainty and explicit sources', 'Preview before apply', 'Only acknowledge durable persistence after its receipt', 'Never treat estimates as guarantees'], revision: state.revision, stateHash: hash(state), ...state.content, lastChange: state.history.at(-1) ? { id: state.history.at(-1)!.id, reason: state.history.at(-1)!.reason, at: state.history.at(-1)!.at } : null };
  if (command === 'verify') return { ok: true, revision: parseState(state).revision, stateHash: hash(state), historyCount: state.history.length, externalCheckpointVerified: false };
  if (command === 'history') return { ok: true, revision: state.revision, events: state.history.map(({ before: _before, after: _after, ...event }) => ({ ...event, beforeHash: hash(_before), afterHash: hash(_after) })) };
  if (command === 'check' || command === 'rank') return { revision: state.revision, result: await inspect(state, command === 'check' ? 'evaluate_plan' : 'rank_candidates', values.date) };
  if (command === 'route-query') return { ok: true, revision: state.revision, saved: false, descriptor: prepareWalkingQuery(state.content.snapshot, await json(values.input)) };
  if (command === 'route-import') return { ok: true, revision: state.revision, saved: false, operation: { type: 'map_fact', fact: await importWalkingObservation(await json(values.request), await json(values.input)) } };
  if (command === 'routes') return { ok: true, revision: state.revision, saved: false, result: inspectWalkingRoutes(state.content.snapshot, state.content.memory.mapFacts, await json(values.input)) };
  if (command === 'preview') { const revision = Number(values.revision); if (values.revision === undefined || !Number.isSafeInteger(revision) || revision < 0) throw new TripError('missing_revision', '--revision must be an explicit nonnegative integer'); return { ok: true, ...await preview(state, await json(values.input), revision) }; }
  if (command === 'apply') return { ok: true, ...await commitStore(path, await json(values.input)) };
  if (command === 'stage') { if (!values.output) throw new TripError('missing_argument', '--output is required'); return { ok: true, ...await stageStore(path, values.output, await json(values.input)) }; }
  if (command === 'validate-request') return { ok: true, receipt: (await apply(state, await json(values.input))).receipt, saved: false };
  throw new TripError('unknown_command', 'Use --help to discover supported commands');
}
main().then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => {
  process.stdout.write(`${JSON.stringify({ ok: false, saved: false, error: { code: error instanceof TripError || error instanceof RouteEvidenceError ? error.code : 'invalid_input_or_io', message: error instanceof TripError || error instanceof RouteEvidenceError ? error.message : 'Input validation or filesystem operation failed' } })}\n`);
  process.exitCode = 1;
});
