# Import historical feedback without unarchiving

`init` now retains the optional original `trip.dayReviews`, `stopOutcomes`, `placeFeedback`, `archiveSummary` fields, their snake_case aliases and `timeZone`/`timezone`/`time_zone`. JSON values and unknown nested fields are preserved, not normalized or silently interpreted. Absent fields stay absent, keeping previously saved journey hashes stable. This is not an automatic experience migration. Keep the complete original source as a separate private artifact as well.

## Explicit contract

Discover `schema --operation import_history`. The operation is:

```json
{
  "type":"import_history",
  "sourceTripId":"the-exact-saved-trip-id",
  "confirmedUserHistory":true,
  "timeZone":"Asia/Tokyo",
  "source":{"kind":"user","reference":"exact-private-source-identity-and-version","observedAt":"2026-10-04T06:00:00Z"},
  "feedback":{
    "dayReviews":{"source-key":{"dateId":"2024-07-10","planId":"existing-plan-id","rating":"unsatisfied","note":"Original user report","updatedAt":"2024-07-11T00:30:00+09:00"}},
    "stopOutcomes":{},"placeFeedback":{},"archiveSummary":null
  }
}
```

The snippet is illustrative; use actual source metadata, stable journey identity and explicit original feedback. `confirmedUserHistory:true` asserts these are the user's historical reports, not provider claims. `sourceTripId` must equal the saved trip ID. The source reference should identify the exact source artifact/version; never invent a Library ID. The source time is the actual import observation time. `timeZone` is required, with explicit `null` when unknown; it must agree with any saved timezone field. The operation only accepts the eight named feedback fields and a bounded payload (256 KiB of serialized JSON characters). Arrays and unusual entries are preserved. Empty collections/null contain no experience records and produce `no_history_records`; they remain in the source/snapshot.

`import_history` works only on `archived:true` journeys and only appends existing `memory.facts`. Snapshot, original feedback, schedule, plans, itinerary, bookings, preferences, progress and checklist are unchanged. Provider sources, mismatched journey/timezone, over-capacity imports and unconfirmed input are refused without partial changes. Ordinary `fact`, assignment, itinerary edits and ordinary `undo` remain guarded on archived journeys. No general write bypass is added.

Use the standard read → preview with current revision → exact returned mutation envelope → stage/apply → authoritative same-identity CAS → readback path. `preview` is read-only; `stage` is a candidate with `saved:false`, never proof that Library saved it. For a v8 archive whose init already omitted the feedback, supply the four raw feedback fields from its separately retained source; do not overwrite the journey/history or recreate it. Read-only metadata does not prove you retrieved the complete source bytes.

Each fact has `experience.historical` with the exact source reference/kind, source trip ID, original field/key, complete raw JSON, content hash, original timestamp, original timezone, import time and time-handling status. Search includes the full raw JSON even if a long display synopsis is shortened. Explicit rating/note is available as `recap.userEvaluation`; actual outcome remains unknown. Abandoned/active stops, blacklist/allowed status, held tickets and archive status do not prove a completed visit or establish permanent preferences. Unknown original IDs remain in raw records and are not guessed into typed activity references. All imported experience requires contextual/current-rule review before reuse.

## Reimport and recovery

Stable fact IDs derive from source trip, exact source reference, field and original key (array index for arrays). Reimporting unchanged records, even with a later import time or overlapping batch, does not duplicate facts. A wholly repeated preview returns `canApply:false` with `history_already_imported`; treat this as already indexed, not a reason to invent new IDs. Replaying an already committed exact request returns the ordinary idempotent receipt. Different content under the same source identity/key fails `history_import_conflict` atomically. A genuinely newer source version must use its real new reference and retains both versions for explicit review; search does not automatically decide which old report it supersedes. Array reordering is a source change, not a reliable entity identity.

`undo_history_import` with the exact latest import commit ID restores only the pre-import facts while keeping archive and all planning fields unchanged. It creates a new audit revision. It cannot undo an ordinary operation, jump over later events, or undo its own rollback. This narrow recovery operation does not enable ordinary `undo` on archived trips. Existing 500-fact, 200-commit and 16-MiB limits still apply; split a large source into explicit source-key batches only where identities remain stable, and never truncate or drop feedback to fit.

## Japanese local dates and times

This version **preserves rather than converts** legacy local time. `Asia/Tokyo`, a source date such as `2024-07-10`, a stop clock such as `00:30`, and `2024-07-11T00:30:00+09:00` remain unchanged. Event date comes only from a valid explicit source `dateId`/`date_id`; it is never guessed from the review timestamp. A valid offset timestamp remains the fact's source timestamp. A local timestamp without offset is retained verbatim but not interpreted as an instant: `observedAtBasis:"import_time_only"` and an unknown explain the fact's fallback import timestamp. Missing timezone/date remains unknown. A review written after midnight can concern the previous local day.

Typed itinerary still supports only `Asia/Shanghai`. Known non-Shanghai or conflicting saved timezones now refuse typed conversion with `unsupported_time_zone_conversion`; passing `Asia/Tokyo` to that strict operation remains unsupported. Do not strip the timezone or substitute Shanghai to get past this guard. No Tokyo minute-level feasibility, deadline conversion or timezone inference is claimed. Historical feedback indexing and source-local date retrieval work without a typed itinerary.

## Retrieval and guide drafting

`experiences` and explicit-state `experience-search` include these imported facts. The parent must first retrieve relevant journey versions; there is no hidden cross-Library index. Select returned fact IDs for `guide-draft`. With no separate lesson, historical records produce review placeholders rather than copying raw feedback. To prepare a usable general draft without modifying an archived journey, pass optional `lessonDrafts:[{experienceId,lesson}]` alongside `experienceIds` and `asOf`. These are request-only drafts, not saved facts, source quotations or user-approved lessons. The result marks `lessonOrigin:"request_draft"`.

The guide allowlist excludes raw historical records, source references, original notes, names/addresses, orders and amounts by default. Dedicated free text can still contain names, addresses or sensitive inferences: `anonymized:false`, `needsUserReview:true`, `published:false`. Pattern checks are advisory and may miss or over-withhold text; they are not an anonymizer. Export does not publish or authorize sharing.

## Synthetic reproduction

`history-import-scenario.json` is wholly synthetic. `node verify.mjs` initializes the archive, previews/stages/applies the import, restarts, replays and checks deduplication, searches all four categories, creates a request-only guide, rejects ordinary writes, and performs the narrow rollback. Run it offline with Node >=22.13. No provider calls or real archive access is needed.
