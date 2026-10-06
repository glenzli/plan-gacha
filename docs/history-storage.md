# Formal history storage (core 12)

Product retention now targets useful business memory and concise change reasons, with the latest20 changes for recovery. Complete format2 events are the current technical migration foundation, not a promise to keep every intermediate adjustment forever. `history-maintenance` provides an implemented read-only semantic consolidation preview; see [history-maintenance.md](history-maintenance.md). No history is deleted in this phase.

Format 1 remains readable and writable with its existing 200-event and 16 MiB limits. Reading, `capacity`, `preview`, `stage` and ordinary `apply` do not implicitly migrate it. Format 2 is a single local offline JSON document. It retains the initial content, current content, every original event ID/revision/operation/actor/reason/timestamp/request hash, reversible content patches and a content/audit hash chain. It does not rerun historical business operations or remove events. Domain schemaVersion stays 1; storageFormat=2 and codecVersion=1 identify the representation.

## Guarded migration

Use the downloaded authority copy and runtime from the same verified Library retrieval. First run:

```sh
node tripctl.mjs verify --store authority.json
node tripctl.mjs capacity --store authority.json
```

Create a migration request using the returned journey identity (from `read`), revision, stateHash and exact fileHash:

```json
{
  "targetFormat": 2,
  "expectedJourneyId": "synthetic-journey",
  "expectedRevision": 100,
  "expectedStateHash": "sha256:<verify-state-hash>",
  "expectedFileHash": "sha256:<verify-file-hash>",
  "at": "2033-10-05T08:00:00Z",
  "sourceLibrary": {
    "libraryFileId": "<same-authority-Library-ID>",
    "expectedCurrentVersion": 23,
    "retrievedAt": "2033-10-05T08:00:00Z"
  }
}
```

These are illustrative values, not real authority guards. Supply the freshly retrieved values and an explicit timestamp.

```sh
node tripctl.mjs migrate --store authority.json --input migration-request.json --output candidate.format2.json
node tripctl.mjs verify --store candidate.format2.json
```

`migrate` holds the source local lock, checks identity/revision/logical hash/exact file hash, verifies all events forward and backward, reconstructs and compares the entire original logical history, and writes exclusive new outputs in this order:

1. `candidate.format2.json.format1.backup.json`: exact original file bytes, including original whitespace.
2. `candidate.format2.json.migration.json`: complete proof, paths, hashes, byte counts and caller-supplied Library guard.
3. `candidate.format2.json`: fully validated format2 candidate.

It returns saved:false. The authoritative input is untouched. Existing outputs are never overwritten; source/candidate/backup/report aliases, symlinks, hardlinks and retained writer locks are refused. A failure may leave completed backup/report artifacts. Keep them, inspect the error and use fresh candidate paths. Candidate publication occurs last. No command writes Library or accesses a provider.

For local-only adoption, explicitly run:

```sh
node tripctl.mjs commit-migration --store authority.json --input candidate.format2.json.migration.json
```

The lock rechecks source bytes and logical identity, exact backup, candidate bytes and chain, report correspondence and full lossless proof. It atomically replaces and fsyncs the local authority, then verifies readback. This adds no domain event or revision. If rename occurred but fsync/readback did not acknowledge success, treat `save_outcome_unknown` as unknown: verify fileHash and retained backup before retrying.

For a Library authority, the host must retain/upload the original backup and report as recoverable artifacts first, then replace the **same authority Library ID** with the candidate using the freshly read native expected version, and read back that same ID/version/file bytes. The core's sourceLibrary metadata is caller-supplied; it is not authentication, native CAS or an external save receipt. Do not write a second authoritative ID. On any CAS conflict, reread the actual authority and regenerate; do not replay an old candidate over newer data. Unknown save outcomes require same-ID readback. Parent orchestration performs this step; the local CLI does not.

## Continuing edits and hash scopes

After adoption, use normal `preview` → `stage` → host same-identity CAS/readback, or local `apply`. Format2 stays format2. Old committed mutation envelopes replay before preview-epoch/event-cap checks; original commit IDs and request hashes are retained. Uncommitted previews from core <=11 or before migration require a new preview under core12. Existing undo guards still apply; undo adds an event and never erases evidence. Source watermarks remain in full event metadata, including composite operations and undone changes. Historical projections crop their audit/identity indexes to the requested revision.

`verify`/`read`/migration/stage distinguish:

| Field | Scope |
| --- | --- |
| stateHash, format1 | canonical complete legacy logical document; scope canonical-format-1-state |
| stateHash, format2 | domain schema, journey ID, revision, current contentHash, complete auditHeadHash; scope content-and-audit-head-v2 |
| contentHash | canonical current domain content only |
| auditHeadHash | anchor plus every ordered original event, reversible patches and before/after hashes |
| containerHash | canonical physical JSON representation; it differs from logical stateHash in format2 |
| fileHash | SHA-256 of exact UTF-8 file bytes, including whitespace |
| proof.legacyStateHash | explicit full legacy reconstruction used only for migration/downgrade equivalence |

Hashes detect accidental modification and bind reviewed candidates; they are not signed provenance. JSON serialization/structuredClone of format2 produces the physical delta document; lazy event.before/after getters are non-enumerable. Use `exportLegacyState` only for a bounded explicit complete downgrade/proof. Ordinary readers use the verified immutable current state, bounded lazy revision cache and retained historical identity snapshots, rather than eagerly rebuilding every full snapshot. First file load still validates every delta and current business contract. Current-domain scans and historical metadata scans remain; this is not an unbounded low-cost log.

## Bounds, corruption and recovery

Physical files remain <=16 MiB. Format2 independently permits <=2048 events, <=2 MiB encoded event, <=4096 forward and <=4096 inverse patches per event, patch paths <=64 keys, JSON nesting <=128 and <=1,000,000 nodes per value. The 512 MiB replay budget charges anchor/current plus **every forward and inverse patch result** (one result for a no-op event), before allocation; intermediate results also count. Node/depth/result-byte and unsafe-path checks precede patch allocation. These budgets may reject a large edit before the event limit. Memory/linkage/business limits still apply. No cap is silently raised on legacy data; migration is explicit.

Opening validates schema/version/order/unique IDs, previous-head chain, before/after hashes, forward output, exact inverse recovery, current/head correspondence and domain rules. Private fast paths only accept deeply immutable objects produced by verified codec and domain checks. Corrupt, truncated, reordered, unknown-version or over-budget files are refused, never normalized or repaired in place.

The exact original backup is a byte-for-byte rollback source **only if no later business edits need preservation**, under a guarded host CAS or separately reviewed local recovery. After new edits, exporting the latest complete history is the only lossless old-runtime route:

```sh
node tripctl.mjs export-format1 --store latest.format2.json --input downgrade-guards.json --output latest.format1.json
```

Input is {expectedRevision,expectedStateHash}. This creates a candidate saved:false with all current and historical content, or refuses `downgrade_unrepresentable` when the complete latest history exceeds 200 events or the old 16 MiB representation. Never roll back to the original backup over later edits. Runtime core <=11 refuses storageFormat2. Keep the previous runtime and original bytes for recovery, and use core12 for migrated authorities.

## Reproducible synthetic evidence

```sh
node history-capacity.verify.mjs .
node verify.mjs
```

The first exercises a dense 100-event legacy authority, exact backup/proof/CAS conflict, formal CLI migration/local adoption, receipt replay, next stage, protected undo, format2 history beyond200, corruption rejection, complete downgrade and old-runtime refusal where a previous runtime is supplied. It reports real bytes and measured timings. All fixtures are synthetic. It does not touch real data or write an external app.
