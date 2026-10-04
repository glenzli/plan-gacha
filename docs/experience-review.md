# Experience review without a second memory store

A useful review connects the original plan, an observation, the reason for a change, and the reported outcome/user evaluation. These remain separate: neither a ticket, an edited plan nor a forecast proves that an activity happened. The operator can capture this from short chat or voice, carry out authorized research and validation, and leave only unresolved choices or ambiguous facts for the user.

The prototype extends **existing `memory.facts`** with optional `experience` metadata. It keeps the original fact text, certainty and source, and references existing plan/activity IDs and history commit IDs. The ordinary `fact` → preview → stage/apply → authoritative CAS → readback path is the only persistence mechanism. There is no second database, automatic embedding index, hidden filesystem crawl or permanent preference learner.

## Record and complete a review

Discover the runtime structure with `schema --operation fact`. An experience has:

- `kind:"firsthand"|"external_guide"`; source remains the fact's existing `source` and observation time.
- `eventDateId`, explicitly `null` when unknown; it is distinct from the source observation/publication timestamp.
- `topics`, `conditions`, `unknowns`, `reviewBeforeReuse`; temporary weather, holiday queues, opening, reservations, prices and transport are contextual evidence, not permanent preferences.
- Optional `planId` / `activityId`; `changeCommitIds` links the adjustment reasons in existing history.
- Optional `outcome` / `userEvaluation`, only for firsthand records and only when explicitly reported. Absence remains unknown.
- Optional `draftLesson`, a separately written, generalizable draft suitable for later user privacy/accuracy review. It must not copy order details, contacts or private lodging information.
- Optional `supersedesFactId` for a later correction or completion of the same experience. It must retain kind/event date/plan, use newer source evidence and refer to the latest correction. Old facts and history remain accessible. Activity references can resolve through retained history, so a recorded experience does not freeze later itinerary edits.

Provider guidance cannot be recorded as firsthand user experience. External guides cannot contain personal outcome/evaluation fields. Source labels and certainty are caller assertions, not authentication; the skill must preserve that distinction. Never invent a positive outcome or a permanent preference from silence. For a historical unstructured fact, append an explicit sourced experience record if the user authorizes that interpretation; reading does not automatically classify or migrate it.

## Retrieve analogous experience

```sh
node tripctl.mjs experiences --store journey.json --input - <<'JSON'
{"asOf":"2032-06-04T12:00:00Z","query":"holiday queue","topics":["crowds"],"limit":10}
JSON
```

Search returns private, source-linked review records with the baseline/current plan, original observation, referenced change reasons, actual reports and explicit outcome/evaluation. It includes journey ID, current revision/hash, matched terms, unknowns and reuse warnings. Corrections hide superseded records by default; `includeSuperseded:true` exposes them for audit. Ordinary facts remain untouched and their count is reported.

`experience-search --input -` accepts `{journeys:[<complete current state>, ...],query:{...}}` for 1–10 explicitly supplied journeys. It does not discover or read other files. The parent resolves relevant private Library journeys, materializes each current version, and passes those states. Keep the authoritative Library identity/version alongside each journey revision/hash; never mix versions. This is deterministic topic/term matching, not a claim of semantic search across all past chats or all Library files. Broader recall depends on the parent locating those saved journeys.

Weather, queues, booking/opening rules, transport and prices always require fresh checks before reuse. All other experience still requires matching the new trip's conditions. Future-dated source observations are flagged unusable for current advice. The original source, event date and unknowns remain visible; the tool neither fetches a provider nor turns an anecdote into a hard planning rule.

## Export a user-reviewable guide draft

```sh
node tripctl.mjs guide-draft --store journey.json --input - <<'JSON'
{"asOf":"2032-06-04T12:00:00Z","experienceIds":["queue-review","external-advice"]}
JSON
```

The result is read-only JSON with Markdown, `saved:false`, `published:false`, `needsUserReview:true`. Export is not permission to share, publish or create a public link.

The default guide is an allowlist: only dedicated `draftLesson` text, source category/date, event date, certainty, fixed topic/recheck labels and unknown counts enter the draft. Raw observations, source references/URLs, plan/activity details, actual reports, conditions text, contacts, order data and lodging fields are omitted. Known current/historical lodging labels and addresses, common contact/number/order patterns or links in a lesson cause that lesson to be withheld. If no lesson exists, a review placeholder appears rather than copying private data.

This conservative filter is not a guarantee that arbitrary free text is anonymous. User review remains necessary for names, places, sensitive inferences, correctness and scope before any separately authorized sharing. A superseded experience cannot be exported as the current guide entry. The private full recap remains available to prepare a better general lesson through an explicit sourced correction.

## Reproducibility and compatibility

`experience-scenario.json` is entirely synthetic. It exercises an initial plan, a queue observation, a later start, an explicit completion report, a user evaluation, a corrected experience and an external guide with uncertain current rules. `EXPERIENCE-DEMO.md` is a synthetic review draft. `node verify.mjs` checks real CLI processes, candidate staging, persistence/replay, private recap, retrieval and no-write/no-share guide generation.

Legacy facts and v5/v6/v7 journeys retain their content hashes and history without migration. New experience metadata is optional and does not populate old records on read. Use the new runtime after recording it; older strict runtimes need not understand new fields. Storage remains bounded by the existing 200-commit/16-MiB prototype limits. This increment does not compact history, move real data, install credentials or synchronize browser data automatically.
