# Shared planning core and optional MCP transport

The primary operator workflow is now the portable [tripctl](tripctl.md), with versioned journey state, explicit memory/issues, preview, history and undo. The stateless MCP interface uses the same pure planning core. The retired web client is archived at `legacy-web-final` and removed from `main`.

`planningCore.ts`, `planCandidates.ts` and `planWeather.ts` own deterministic domain behavior. `planningTools.ts` defines runtime snapshot/input/output schemas and reason codes. Planning date and IDs are supplied explicitly; candidate scoring retains priority ×3 + weather − clearout penalty − new-risk penalty. These are date/conflict/weather rules, not a general minute-level transport solver.

## Real MCP proof

`npm run mcp` starts the official SDK stdio server. It exposes `get_context`, `evaluate_plan`, `rank_candidates`, `preview_changes` with input/output schemas and read-only annotations. `npm run mcp:demo` uses a separate real SDK Client process for tools/list and all tools/call. `src/mcp/stdio.test.ts` verifies SDK discovery, results against the core and errors. `planning-tools-evidence.json` preserves actual discovery schemas, call arguments and results from a synthetic browser-exported snapshot. The server has no storage or HTTP listener and does not write trips or Drive.

## Archived web handoff

The archived AI planner modal exports a canonical snapshot and imports a token-bound assignment operation. It re-evaluates the operation against live state before preview and before human confirmation, ignoring imported effects. Its browser smoke script checks invalid input, stale snapshots, close/reopen draft retention, tampered effects, cancel/no-write and matching confirmed schedule. Both the modal and script remain in the archive tag. This was a manual export/import adapter; a stateless local server does not automatically share browser data.

## Validation and limits

The initial shared-core/MCP/UI phase at 3dc8f7c8d90ef40a1d24f0308fcbcbf153a50eac passed 163 tests, lint, typecheck, build and synthetic browser handoff/checklist-sync regressions. Those browser checks describe the archived implementation. CLI validation and delivery evidence are in [tripctl-evidence.json](tripctl-evidence.json).

Content hashes bind stateless snapshots; they are not remote revisions or CAS. The retired browser's localStorage and optional Drive implementations are archived at `legacy-web-final`; the existing deployment remains unchanged. Legacy data still needs an explicit export from its original browser/origin. Drive getVersion-before-write is not atomic collaboration storage. No remote MCP deployment, hosting publication, OAuth setup, real-data import, purchases or messages are included.
