# tripctl: an operator's local journey tool

Node >=22.13 runs the portable `tripctl.mjs` without npm installation, network access, API keys or a web server. `tripctl-lib.mjs` also exports the pure engine, schemas, file store and map adapter for direct imports. `node verify.mjs` verifies the delivered hashes and runs synthetic multi-process persistence, constraint, concurrency and recovery checks. Source builds use `npm run tripctl:build`; source CLI uses `npm run tripctl -- ...`.

## Operator workflow

Every turn: read the current authoritative journey, its revision, decisions/exclusions, actual progress, unresolved issues and reasons. Use `check`/`rank` as needed. Preview an explicit operation, inspect effects, then save it. Claim a change is saved only after the applicable durable store acknowledges success.

```sh
node tripctl.mjs init --store journey.json --input synthetic.snapshot.json
node tripctl.mjs read --store journey.json
node tripctl.mjs check --store journey.json
node tripctl.mjs rank --store journey.json --date 2026-10-11
node tripctl.mjs preview --store journey.json --input operation.json --revision 0
node tripctl.mjs apply --store journey.json --input mutation.json
node tripctl.mjs history --store journey.json
node tripctl.mjs verify --store journey.json
```

`operation.json`: `{"type":"assign","dateId":"2026-10-11","planId":"museum"}`. A mutation contains the **same** operation, `expectedRevision`, the returned `previewToken`, caller-supplied unique `idempotencyKey`, `actor`, `reason`, ISO `at`, and optional `acceptWeatherRisk:true`. The operator must use an actual user request as its reason/source, not convert a model guess into a confirmed decision.

`apply` acknowledges **local filesystem** persistence only: `saved:true, durability:"local_filesystem", externalCheckpointVerified:false`. It uses exclusive writer locking, read/revision validation inside the lock, fsynced before-state checkpoint, temporary-file fsync, atomic rename and directory fsync. A crash can retain the lock: inspect the process and checkpoints; never auto-delete a retained lock. Do not run on an unverified network filesystem. File permissions are private. A write/fsync failure returns `saved:false`; read/verify the store before retrying because a rename may already have happened.

## Ephemeral cloud computers and Library persistence

A temporary container file is not the sole durable source. With a Library-backed journey, obtain the latest file and its native Library version first, then use:

```sh
node tripctl.mjs stage --store working.json --input mutation.json --output candidate.json
```

This returns `saved:false, durability:"candidate_only"`, base revision/hash and candidate hash, without modifying the working file. The parent operator then replaces **the same** Library file identity with `candidate.json`, guarded by the retained `expected_current_version`. Only native success makes the external `apply` workflow saved. Keep the native Library file ID, version and persistence receipt; never replace a version conflict with an unguarded write. Materialize current content, re-read/re-preview and retry with fresh authority. After an unknown response, read the current state's idempotency history before deciding whether to retry. Repeated identical requests return their original committed revision and never create a second event.

Native Library version is the external CAS; journey revision is the domain version; schemaVersion is the format. These are distinct. The CLI holds no Library credentials. A parent tool orchestration must perform and acknowledge this outer CAS. This package alone cannot make a temp container durable.

Validated on this Mac: native create and guarded replacement succeeded; a stale version was rejected. The signed-download materializer failed twice and was stopped. Native full JSON `read` returned complete version-pinned content; reconstructing that JSON and running `verify` reproduced the staged canonical hash and issue history. This provides a verified text-JSON recovery route for the small prototype. If full reads are paginated, retain the exact native version, concatenate all content chunks with their original line boundaries, require `has_more:false`, parse and verify before use. Never accept truncated or mixed-version content. Large-state byte materialization remains an environment-dependent limitation and must be tested on the parent's cloud executor.

## Data and supported operations

One explicit journey JSON stores a planning snapshot plus separate facts (reported/verified/uncertain), preferences, candidates (snapshot plans), confirmed/excluded/withdrawn decisions, actual progress, issues, and timestamped map facts. Each memory record requires explicit provenance. Provider observations cannot establish user preferences/decisions/progress. Decisions may be appended to supersede the same plan/date scope (use `withdrawn` to explicitly release a prior confirmation/exclusion); a dated confirmation must match the saved schedule. Exclusions cannot silently contradict the current schedule.

Operations: `assign`; `link_booking_activities` / `edit_activity` (see the fixed-time editing contract below); `fact`/`preference` with a `record:{id,text,source}` (`fact` also has `certainty`); `decision` with `record:{id,planId,dateId?,disposition,reason,source}`; `progress` with `record:{id,planId,dateId,status,reason,source}`; `issue` with `record:{id,text,source,relatedPlanId?}`; `resolve_issue` with `id,resolution,source`; `map_fact`; `set_context` with explicit `todayId`; `undo` with latest `commitId`. `source:{kind:"user"|"provider"|"synthetic",reference,observedAt}` identifies evidence supplied by the caller, not independently authenticated evidence. Actor is audit attribution supplied by the authorized operator, not a login system.

Existing date, closure, occupancy/conflict, visited and weather rules remain shared with web/MCP. Confirmed exclusions and completed/displaced decisions add operator memory constraints. Preferences and free-text facts remain evidence to reason with; they are not all machine-enforced constraints. No minute-level transportation solver, purchases, messages, real trip migration or automatic Drive writes are provided.

History retains full before/after contents, actor, reason, explicit timestamp, operation and request hash. Undo is an explicit new revision restoring the latest event's prior content; earlier undo requests fail instead of overwriting newer changes. Local `.rev-N.json` checkpoints can be copied to a fresh path and verified; they do not replace external backups. Prototype limit: 200 commits, 16 MiB state; hitting limits preserves data and fails clearly. History consistency checks detect accidental corruption; this is not a cryptographic authenticity system.

## Maps

`src/tripctl/mapFacts.ts` accepts an approved replaceable transport and explicit clock. Inputs label GCJ02/WGS84, mode, provider and endpoints; mixed coordinate systems are rejected, never silently converted. Outputs include source, observation/expiry, estimate/uncertainty or bounded failure. Success and failures cache with separate TTLs; calls have explicit rate and budget caps. No credentials, provider exception text or raw URL enter the fact schema. Estimates are not promises; hours, reservations and real-time traffic require separate evidence. Current tests use fixtures; no live AMap connection is bundled.

Shadow's actual credential backend is a user-private local INI file, not Keychain. Both AMap Web Service and JS entry metadata were found in its configured application-data location with mode 0600. Separate bounded diagnostics were performed under explicit authorization. The default task sandbox failed DNS resolution for all tested domains, while ordinary Mac Chrome loaded the public AMap documentation. A formally approved keyless diagnostic restored tool-side DNS resolution. The subsequently authorized single public-place query failed TLS certificate verification before receiving an HTTP or provider response. No automatic retry, TLS bypass or network-setting change was made; key validity and remaining account quota remain unknown. No key was printed, copied, configured for this package or transferred to the cloud. Future live connection needs an approved safe credential path on that execution host. Provider quota/rate errors follow [AMap's official error-code documentation](https://lbs.amap.com/api/webservice/guide/tools/info/).


## Booked and locked arrangements (guard revision 2)

`bookings.status:"done"` means the reservation/ticket procedure is complete. It does **not** mean a visit happened. Actual progress remains in `memory.progress`. Assignment now blocks displacement of any current arrangement containing a done booking (`booked_plan_displaced`) or `schedule[dateId].planLocked:true` (`locked_plan_displaced`). This applies to replacing the selected day, moving the same plan, and clearing conflicting plans elsewhere. A blocked preview is atomic and returns the original schedule; blocked apply writes nothing. Locked lodging remains independent.

Legacy bookings with no separate date conservatively protect their currently assigned **whole-day plan**. `commitmentImpacts` identifies the date, plan, booking IDs/titles, lock and `bookingDateUncertain`. Optional `bookings[].dateId` records an explicit reservation date and survives normalization/export. Evaluation warns if a done booking has no active plan (`booked_plan_unscheduled`) or its explicit date is not covered (`booked_date_mismatch`). These warnings identify missing itinerary coverage; they do not claim that an order was cancelled, or that a past activity did not happen.

A caller with an actual explicit instruction can preview an exception naming each affected original arrangement and the reason:

```json
{
  "type": "assign",
  "dateId": "2026-10-11",
  "planId": "indoor",
  "commitmentChanges": [{
    "dateId": "2026-10-11",
    "planId": "museum",
    "reason": "Synthetic user explicitly permits this itinerary change; reservation still requires separate review"
  }]
}
```

A missing acknowledgment still blocks its arrangement. Wrong, duplicate or unaffected IDs/dates fail `invalid_reference`; blank reasons fail `invalid_schema`. This exception does not bypass date/closure/visited rules, memory exclusions, confirmed decisions or actual-progress constraints. It preserves booking records/status, returns explicit accepted impacts and any coverage warning, and uses normal preview/CAS/audit/undo. It does not contact a booking provider. Old CLI preview tokens must be regenerated under guard revision 2; idempotent receipts from already committed history remain readable.

The ordinary web assignment controller, clear-day and abandon-day actions use the same guard. It rechecks a pending confirmation against current arrangements. The optional proposal panel shows affected commitments and requires its existing traveller save confirmation even for an explicit exception. Direct catalog/JSON editing and imports remain broader editing surfaces: this guard is not a complete protected-stop editor. The schema has no independently authenticated user intent; optional explicit stop-level reservation linkage is described below. See `planning-evolution.md` for the next compatible choices; do not silently infer a walking limit or an afternoon-only edit from free text.


## Fixed-time activity edits (preview core revision 3)

The operator CLI/library now supports a narrow local edit. First explicitly associate the existing reservation with stable activities. A user/synthetic source supplies the association; titles and times never infer it. This adds metadata and keeps the booking status/order details intact:

```json
{
  "type": "link_booking_activities",
  "dateId": "2026-10-11",
  "planId": "museum",
  "bookingId": "dinner-booking",
  "stopIds": ["dinner-stop"],
  "source": {"kind":"synthetic","reference":"synthetic:explicit-association","observedAt":"2026-10-02T12:00:00Z"}
}
```

Then preview and apply one unprotected afternoon activity using the normal mutation/revision/token contract:

```json
{
  "type": "edit_activity",
  "dateId": "2026-10-11",
  "planId": "museum",
  "stopId": "afternoon-stop",
  "patch": {
    "title": "Synthetic indoor afternoon",
    "location": {"label":"Synthetic indoor venue","address":"Fixture only","query":"fixture-indoor"},
    "weatherRelevant": false
  },
  "source": {"kind":"synthetic","reference":"synthetic:explicit-afternoon-edit","observedAt":"2026-10-02T12:00:00Z"}
}
```

Only `title`, `note`, `weatherRelevant` and an explicit text `location:{label,address,query?}` are accepted. The same date/plan must be actively assigned. All stops need explicit unique IDs; legacy positional/string stops are refused instead of auto-migrated. Other schedule references to this plan, even abandoned dates, block the edit to protect their shared catalog content. A separately dated reservation cannot be rebound to another date. Existing confirmed booking links cannot silently change activities. A done booking with absent/unconfirmed links conservatively blocks all edits; confirmed linked activities stay locked. Whole-plan locks/decisions, completed progress, archived journeys and past dates continue to block editing. Provider observations cannot establish edit intent. Linking is explicitly supplied metadata, not evidence of cancellation, rescheduling or a completed visit.

Time, ID, order, insertion/deletion and precise coordinate edits are rejected. A location change drops the activity's old precise location/opening hours and both adjacent incoming transfer records, including legacy aliases. The preview lists every affected activity and `invalidatedTransferStopIds`; a booked dinner's incoming route may be cleared for recheck while its identity/time/reservation stay intact. It emits `activity_location_unverified`, `adjacent_routes_require_recheck`, `opening_hours_require_recheck`. Existing unassociated map facts remain stored and are listed as `unassociatedMapFactIds`; they never establish a valid route to the new location. No provider lookup or temporal/route feasibility proof is performed. Re-preview under core revision 3; already committed idempotent receipts and old state/history remain readable.

Run the portable `verify.mjs` for the repeatable synthetic loop: unlinked edit blocked → explicit dinner link → afternoon preview → unsaved candidate staging → save → protected dinner check → undo to the linked original afternoon. It verifies zero writes on refusal and preserves the unresolved issue, morning, 18:30 dinner and locked hotel. The stateless MCP's four assignment tools and the web proposal panel have not gained these activity operations; current use is the CLI/library engine. Web normalization/AI export preserves the new optional linkage metadata. Native Library CAS still belongs to the parent operator; this package does not automatically acquire the browser snapshot or save a remote journey.
