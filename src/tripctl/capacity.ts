import { isStorage2, storageIdentity, storage2Stats } from './storage2';
import { parseState } from './engine';
import { MAX_STORE_BYTES, MAX_HISTORY_EVENTS, MAX_STORAGE2_EVENTS } from './limits';
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8');
/** Pure diagnostics for the existing format. No trimming, rewriting or migration. */
export function analyseCapacity(input: unknown) {
  const state = parseState(input);
  const serializedStateBytes = Buffer.byteLength(`${JSON.stringify(state, null, 2)}\n`, 'utf8');
  const compactStateBytes = bytes(state); const currentContentBytes = bytes(state.content);
  let historyContentBytes = 0; let historyMetadataBytes = 0;
  for (const event of state.history) {
    if (isStorage2(state)) historyMetadataBytes += bytes(event);
    else { const { before, after, ...metadata } = event; historyContentBytes += bytes(before) + bytes(after); historyMetadataBytes += bytes(metadata); }
  }
  return { ok: true, saved: false, schemaVersion: 1, journeyId: state.content.snapshot.trip.id, revision: state.revision, ...storageIdentity(state), ...(isStorage2(state) ? { storage2: storage2Stats(state) } : {}),
    measurement: 'UTF-8 JSON.stringify(parsedState, null, 2) plus final newline; exactly the local writer format, not necessarily the input file bytes',
    serializedStateBytes, compactStateBytes,
    bytes: { limit: MAX_STORE_BYTES, remaining: Math.max(0, MAX_STORE_BYTES - serializedStateBytes), overLimitBy: Math.max(0, serializedStateBytes - MAX_STORE_BYTES), withinLimit: serializedStateBytes <= MAX_STORE_BYTES },
    commits: { count: state.history.length, limit: isStorage2(state) ? MAX_STORAGE2_EVENTS : MAX_HISTORY_EVENTS, remaining: (isStorage2(state) ? MAX_STORAGE2_EVENTS : MAX_HISTORY_EVENTS) - state.history.length },
    compactBreakdown: { currentContentBytes, historyContentBytes, historyMetadataBytes, containerAndFieldBytes: compactStateBytes - currentContentBytes - historyContentBytes - historyMetadataBytes },
    retainedContentOccurrences: isStorage2(state) ? 2 : 2 * state.history.length + 1,
    nextMutationFits: 'unknown_until_exact_candidate_is_serialized',
    limitsUnchanged: true, migrationPerformed: false,
    limitations: ['This report does not reserve capacity or authorize a write', 'Current memory/linkage array limits still apply independently', 'No days-remaining forecast: payload growth depends on future operations', 'Pure apply/validate-request checks domain history; successful stage is still required to validate local candidate byte capacity', isStorage2(state) ? 'Format2 retains every event; event, patch, replay and physical byte budgets still apply' : 'Whitespace reduction or a larger byte limit would not remove repeated full history snapshots'],
  };
}
