import { McpServer } from '@modelcontextprotocol/server';
import { planningToolSchemas, planningToolResponseSchema, callPlanningTool, toolNames } from '../domain/planningTools';

export function createPlanningServer() {
  const server = new McpServer({ name: 'plan-gacha', version: '0.1.0' });
  const descriptions = {
    get_context: 'Summarize the supplied snapshot and rule engine limits. Does not read the browser or Drive. Return snapshotToken for subsequent calls.',
    evaluate_plan: 'Evaluate date, closure, explicit conflict, duplication, weather and booking risks in the supplied snapshot. No minute-level transit solving.',
    rank_candidates: 'Rank plans for one trip date with the same deterministic formula as the web. Weather blocks require human review; canAssign covers structural rules.',
    preview_changes: 'Preview one assignment, moves, conflicting clears, lodging impact and new risks. Requires expectedSnapshotToken. Returns a proposal for web confirmation; never writes.',
  };
  for (const name of toolNames) server.registerTool(name, {
    description: descriptions[name], inputSchema: planningToolSchemas[name], outputSchema: planningToolResponseSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (input: unknown) => {
    const result = await callPlanningTool(name, input);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: result, isError: !result.ok };
  });
  return server;
}
