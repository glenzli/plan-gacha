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

Operations: `assign`; `fact`/`preference` with a `record:{id,text,source}` (`fact` also has `certainty`); `decision` with `record:{id,planId,dateId?,disposition,reason,source}`; `progress` with `record:{id,planId,dateId,status,reason,source}`; `issue` with `record:{id,text,source,relatedPlanId?}`; `resolve_issue` with `id,resolution,source`; `map_fact`; `set_context` with explicit `todayId`; `undo` with latest `commitId`. `source:{kind:"user"|"provider"|"synthetic",reference,observedAt}` identifies evidence supplied by the caller, not independently authenticated evidence. Actor is audit attribution supplied by the authorized operator, not a login system.

Existing date, closure, occupancy/conflict, visited and weather rules remain shared with web/MCP. Confirmed exclusions and completed/displaced decisions add operator memory constraints. Preferences and free-text facts remain evidence to reason with; they are not all machine-enforced constraints. No minute-level transportation solver, purchases, messages, real trip migration or automatic Drive writes are provided.

History retains full before/after contents, actor, reason, explicit timestamp, operation and request hash. Undo is an explicit new revision restoring the latest event's prior content; earlier undo requests fail instead of overwriting newer changes. Local `.rev-N.json` checkpoints can be copied to a fresh path and verified; they do not replace external backups. Prototype limit: 200 commits, 16 MiB state; hitting limits preserves data and fails clearly. History consistency checks detect accidental corruption; this is not a cryptographic authenticity system.

## Maps

`src/tripctl/mapFacts.ts` accepts an approved replaceable transport and explicit clock. Inputs label GCJ02/WGS84, mode, provider and endpoints; mixed coordinate systems are rejected, never silently converted. Outputs include source, observation/expiry, estimate/uncertainty or bounded failure. Success and failures cache with separate TTLs; calls have explicit rate and budget caps. No credentials, provider exception text or raw URL enter the fact schema. Estimates are not promises; hours, reservations and real-time traffic require separate evidence. Current tests use fixtures; no live AMap connection is bundled.

Shadow's actual credential backend is a user-private local INI file, not Keychain. Both AMap Web Service and JS entry metadata were found in its configured application-data location with mode 0600. One public-place Web Service request was attempted using the existing credential in Mac memory only; it returned a bounded request failure, with no successful provider response. No retry was made; remaining account quota is unknown. No key was printed, copied, configured for this package or transferred to the cloud. Future live connection needs an approved safe credential path on that execution host. Provider quota/rate errors follow [AMap's official error-code documentation](https://lbs.amap.com/api/webservice/guide/tools/info/).
