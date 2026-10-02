# Shared planning core and optional MCP transport

The primary operator workflow is now the portable [tripctl](tripctl.md), with versioned journey state, explicit memory/issues, preview, history and undo. The web and stateless MCP interface remain compatible clients of the same pure planning core.

`planningCore.ts`, `planCandidates.ts` and `planWeather.ts` own deterministic domain behavior. `planningTools.ts` defines runtime snapshot/input/output schemas and reason codes. Planning date and IDs are supplied explicitly; candidate scoring retains priority ×3 + weather − clearout penalty − new-risk penalty. These are date/conflict/weather rules, not a general minute-level transport solver.

## Real MCP proof

`npm run mcp` starts the official SDK stdio server. It exposes `get_context`, `evaluate_plan`, `rank_candidates`, `preview_changes` with input/output schemas and read-only annotations. `npm run mcp:demo` uses a separate real SDK Client process for tools/list and all tools/call. `src/mcp/stdio.test.ts` verifies SDK discovery, results against the core and errors. `planning-tools-evidence.json` preserves actual discovery schemas, call arguments and results from a synthetic browser-exported snapshot. The server has no storage or HTTP listener and does not write trips or Drive.

## Optional web handoff

The existing AI planner modal can export a canonical snapshot and import a token-bound assignment operation. It re-evaluates the operation against live state before preview and before human confirmation, ignoring imported effects. The browser smoke script checks invalid input, stale snapshots, close/reopen draft retention, tampered effects, cancel/no-write and matching confirmed schedule. This is a manual export/import adapter; a stateless local server does not automatically share browser data. It is not the primary AI-operator product workflow.

## Validation and limits

Latest repository baseline is 3dc8f7c8d90ef40a1d24f0308fcbcbf153a50eac. The initial shared-core/MCP/UI phase passed 163 tests, lint, typecheck, build and synthetic browser handoff/checklist-sync regressions. Current CLI validation and delivery evidence are in [tripctl-evidence.json](tripctl-evidence.json).

Content hashes bind stateless snapshots; they are not remote revisions or CAS. Existing browser localStorage and optional Drive snapshots keep their established behavior. Drive getVersion-before-write is not atomic collaboration storage. No remote MCP deployment, hosting publication, OAuth setup, real-data import, purchases or messages are included.
