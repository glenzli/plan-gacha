# Operator flow and packaging (guard revision 7)

The useful entrypoint is an offline Node CLI/library with a small operator skill. A parent assistant can interpret chat or voice, load the authoritative journey, invoke the core, explain the diff and save an authorized change. This needs no new server or model-specific wrapper. The original **four** stateless MCP tools remain real SDK-tested snapshot interfaces; rich itinerary/date operations currently use `tripctl`, not a stateful MCP server. No WebMCP/browser API support is claimed.

| Layer | Responsibility | Boundary |
| --- | --- | --- |
| Shared core / tool | Strict inputs, date/conflict/weather rules, ranking, structured itinerary, preview/apply, audit and undo | No model, credentials, implicit provider calls or order execution |
| Operator skill | Interpret intent, preserve uncertainty, select operations, assess sources, explain effects | A model guess never becomes a confirmed fact or actual visit |
| Private data | One journey identity; separate baseline/current/actual, preferences, evidence, commitments, options and deadlines | Public source and fixtures contain synthetic data only |
| Storage | Local locked CAS, or parent materialization → stage → same-ID Library CAS → readback | `stage.saved:false`; Library version, journey revision and schema version differ |
| UI | Browser editing/confirmation and read-only report | Browser localStorage is separate; no automatic cross-device or Library pull |
| Notifications | Parent's separately authorized reminder mechanism | Decision advisories do not create tasks, poll providers or cancel bookings |

The parent already runs the portable CLI and Library persistence flow. It can remove repeated JSON handling from the **user's** chat workflow because the parent performs that handoff. The CLI/MCP itself does not discover the browser's state. Moving changes into the existing website still requires an explicit reviewed data handoff; do not claim browser/cloud synchronization. Existing browser AI-copy/paste tools, offline local data, checklist and optional Drive adapter remain available. Drive get-version/write is not atomic CAS and is not the operator's collaboration store.

## Discover and call

```sh
node tripctl.mjs schema
node tripctl.mjs schema --operation set_plan_dates
node tripctl.mjs context --store journey.json --as-of 2031-06-04T12:00:00Z --date 2031-06-04 --limit 5
node tripctl.mjs preview --store journey.json --revision 0 --input - <<'JSON'
{"type":"set_plan_dates","planId":"peak","closeDates":["2031-06-04"],"reason":"User reports today's closure","source":{"kind":"user","reference":"current user message","observedAt":"2031-06-04T12:00:00Z"}}
JSON
```

Substitute the actual plan/date/revision and timestamp from the latest journey. JSON Schema is generated from the runtime schema; refinements, references and state guards remain enforced by preview. `--input -` (or `--request -` for a route descriptor) consumes one JSON value on stdin. Using both is refused. Context requires explicit `asOf`; `todayId` changes only through the existing reviewed `set_context` operation.

`context` omits full audit snapshots, baseline activities and resolved issues, while keeping all open issues, date-evidence records, bookings, lodging, checklist, actual reports and global decision points/options. The selected date scopes current activities and analysis when that day has an imported itinerary. Future dates still show global deadlines. Candidate output is bounded (default 5, maximum 20) with counts and a truncation flag; `read`/`history` provide complete data.

A candidate's `canAssign` is the shared structural ranking result. Its separate `application` comes from the **actual operator preview**, including remembered decisions, completed activities and imported-itinerary guards. `canApply:true` still requires normal preview binding and any weather-risk acceptance; readiness remains `not_verified`. An imported day often needs `edit_itinerary`, not whole-day `assign`. The prototype does not automatically turn a ranked plan into an itinerary edit or activate a conditional branch.

## Date restrictions, not verified live availability

`set_plan_dates` accepts `planId`, `reason`, `source`, and one or more of:

- `closeDates`: add explicit closed dates, preserving unrelated closures.
- `reopenDates`: remove only those explicit closures. It does not widen an existing whitelist or establish live provider availability.
- `availableDates`: replace the exhaustive whitelist **only when the source explicitly supplies an exhaustive set**. “Runs on day five” does not imply all other days are closed.

Lists must be nonempty, unique, real trip dates. Empty whitelists are rejected because legacy normalization treats `available_dates:[]` as unrestricted. Close every explicit trip date to represent no permitted dates. Closing and reopening the same date in one request is invalid. New data uses the existing `available_dates`/`closed_dates` consumed by web, MCP and CLI; there is no parallel availability store.

A current cancellation/closure report can establish a dated restriction. A user's report stays `source.kind:"user"`, not an officially verified provider fact. A forecast of possible closure, a tentative tour or unknown status belongs in an uncertain fact/issue/option (or typed forecast evidence); it must not be converted into a final dated closure. Provider identity and timestamps are caller-supplied, not authenticated by this tool.

For the same plan and overlapping dates, incoming `source.observedAt` must be strictly newer than accepted date-change history. Whitelist changes conservatively overlap all dates. Older/equal-time reports return `stale_date_evidence`, leave content unchanged and cannot be applied. An exact committed mutation still replays idempotently. History retained after undo keeps this evidence barrier; undo does not manufacture a newer reopening report. Legacy/raw snapshots have no dated provenance to compare until their first date operation. These restrictions persist until an explicit later change; there is no expiry or optimistic auto-reopening.

Preview lists before/after constraints, affected scheduled dates and the shared evaluation. Recording bad news is permitted even when it creates a visible conflict with the current schedule. It does not clear that schedule, mark progress, cancel an order or alter baseline/current/actual. Resolving the conflict is a separate explicit operation.

## Decision lifecycle

`set_decision_status` records an explicitly confirmed **administrative matter** as `completed`, `withdrawn` (no longer needed), or `open` (reopened). It updates an optional `decisionPoints[].lifecycle` record, retaining source, observation time and reason. The existing preview, expected revision, idempotency receipt, guarded storage and latest-commit undo apply unchanged. No new store, transport or reminder service is introduced.

```json
{
  "type": "set_decision_status",
  "decisionPointId": "hotel-deadline",
  "status": "completed",
  "confirmation": "explicit",
  "reason": "The user confirms this matter is handled; order and refund remain unverified by the tool",
  "source": {
    "kind": "user",
    "reference": "the current explicit user message",
    "observedAt": "2031-06-04T20:00:00Z"
  }
}
```

Use an actual message reference and timestamp, not this fixture's values. An uncertain report stays a fact/issue; missing/uncertain confirmation and unknown statuses are refused. Provider observations alone cannot close or reopen the user's decision. `confirmation:"explicit"` is a caller assertion, not natural-language understanding or authentication; the operator must not set it for “maybe” or an assumption.

Completion/withdrawal returns `requiresAction:false` and `deadlineStatus:"inactive"`. It disappears from `advisoryEvents`, and the human report moves it out of pending work. Conditional options referenced only by closed decisions move to `inactiveOptions`; options shared with an active decision or not linked to a decision remain available. Context consumers should use these typed fields, not scan historical text for reminders. Underlying daily plan ranking is unchanged: finishing an administrative matter does not imply excluding a plan, cancelling a reservation or completing an activity.

Reopening requires a strictly newer explicit report. It restores applicable deadline advisories and conditional options, and earlier choices no longer count as a current selection. `previousChoice` preserves them as history. A new `choose_option` is refused while the decision is closed; reopen first and then supply newer evidence. Choosing still only records a decision and does not execute a branch.

Lifecycle evidence must be strictly newer than decision creation, the current lifecycle and recorded choices. The engine also checks retained history after undo, rejecting old/equal-time replay with `stale_decision_evidence`. Exact committed mutation retries remain idempotent: the receipt identifies the original commit, while current state must still be reread. Undo restores content in a new revision without erasing the evidence barrier. Existing legacy choices remain readable without retroactive migration.

`completed` is not a verified refund, cancelled order or booking-state update. Results explicitly retain `cancellationPerformed:false` and `refundVerified:false`. Snapshot reservations, baseline/current/actual, commitments, checklist and unrelated decisions remain unchanged. Existing parent notifications must be managed separately; the core only changes the advisory data they should consult.

## Reproducible synthetic demonstration

Build with `node scripts/build-tripctl.mjs /absolute/output`, then run `node /absolute/output/verify.mjs`. The packaged `operator-scenario.json` contains an anonymous day-four closure, forest tour cancelled on day four/reopened on day five, a cancelled day-six backup, a tentative cross-city option and a lodging decision deadline. The verifier uses independent real CLI processes for schema discovery, stdin, preview, candidate staging, local CAS/replay and compact context. It verifies that a structurally eligible alternative can still require `edit_itinerary`, deadlines stay advisory, stale date evidence is refused, and reads/refusals do not write. It also verifies decision completion, inactive deadlines/options, unknown/stale refusals, reopening, withdrawal and undo across real processes.

No migration is required for v5/v6 journeys: optional field absence and existing history are preserved. Preview guard version 7 invalidates pending v5/v6 previews; generate a new preview. Already committed v5/v6 request receipts still replay. Optional lifecycle fields are absent until an explicit status change; historical snapshots are not rewritten. After saving a new lifecycle operation, use v7 or newer to read/write that journey; this is forward compatibility for old data, not a guarantee that old runtimes understand new fields. Tests use synthetic histories; private production journey compatibility must be checked by its authorized parent before writing.

## Remaining work and evidence limits

No new map/weather permissions or live API connection is established by this version. Existing route/evidence APIs accept authorized observations; provider access on each host, credential handling, POI identity and freshness remain external requirements. Cached snapshot weather has no verified freshness contract. Route estimates and matching clocks never prove end-to-end feasibility. Itinerary times currently support Asia/Shanghai only.

A stateful MCP facade is useful only when a target assistant cannot execute this CLI or safely orchestrate storage; it must reuse this engine and the single persistence owner. It is deferred. Automated branch execution, browser state reconciliation and a richer human review UI also need explicit contracts. The current report is a read-only artifact, not a second save endpoint.
