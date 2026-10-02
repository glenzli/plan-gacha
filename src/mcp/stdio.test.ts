import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import fixture from '../../fixtures/planning-tools.snapshot.json';
import bookedFixture from '../../fixtures/booked-day.snapshot.json';
import { callPlanningTool, getSnapshotToken, planningSnapshotSchema, planningToolResponseSchema, toolNames } from '../domain/planningTools';

describe('real MCP stdio discovery and calls', () => {
  it('discovers schemas and calls all four tools through an SDK client process', async () => {
    const client = new Client({ name: 'planning-contract-test', version: '0.1.0' });
    const transport = new StdioClientTransport({ command: process.execPath, args: ['--import', 'tsx', 'src/mcp/stdio.ts'], cwd: process.cwd(), stderr: 'pipe' });
    const input = planningSnapshotSchema.parse(fixture);
    const expectedSnapshotToken = await getSnapshotToken(input);
    const before = structuredClone(input);
    try {
      await client.connect(transport);
      const list = await client.listTools();
      expect(list.tools.map((tool) => tool.name)).toEqual([...toolNames]);
      for (const tool of list.tools) {
        expect(tool.annotations?.readOnlyHint).toBe(true);
        expect(tool.inputSchema.properties?.snapshot).toBeDefined();
        expect(tool.outputSchema).toBeDefined();
      }
      const args = { snapshot: input, expectedSnapshotToken };
      const inputs = [args, args, { ...args, dateId: '2026-10-11' }, { ...args, operation: { type: 'assign', dateId: '2026-10-11', planId: 'museum' } }];
      for (const [index, name] of toolNames.entries()) {
        const result = await client.callTool({ name, arguments: inputs[index] });
        expect(result.isError).toBe(false);
        expect(planningToolResponseSchema.parse(result.structuredContent)).toEqual(await callPlanningTool(name, inputs[index]));
      }
      const unknown = await client.callTool({ name: 'preview_changes', arguments: { ...args, operation: { type: 'assign', dateId: '2026-10-11', planId: 'missing' } } });
      expect(unknown.isError).toBe(true);
      expect(unknown.structuredContent).toMatchObject({ ok: false, error: { code: 'unknown_id' } });
      const stale = await client.callTool({ name: 'preview_changes', arguments: { ...args, snapshot: { ...input, todayId: '2026-10-03' }, operation: { type: 'assign', dateId: '2026-10-11', planId: 'museum' } } });
      expect(stale.structuredContent).toMatchObject({ ok: false, error: { code: 'stale_snapshot' } });
      const invalid = await client.callTool({ name: 'rank_candidates', arguments: { snapshot: { ...input, schemaVersion: 2 }, dateId: '2026-10-11' } });
      expect(invalid.isError).toBe(true);
      const booked = planningSnapshotSchema.parse(bookedFixture);
      const bookedArguments = { snapshot: booked, expectedSnapshotToken: await getSnapshotToken(booked), operation: { type: 'assign', dateId: '2026-10-11', planId: 'indoor' } };
      const bookedResult = await client.callTool({ name: 'preview_changes', arguments: bookedArguments });
      expect(bookedResult.structuredContent).toMatchObject({ ok: true, data: { canApply: false, reasonCodes: ['booked_plan_displaced'] } });
      expect(planningToolResponseSchema.parse(bookedResult.structuredContent)).toEqual(await callPlanningTool('preview_changes', bookedArguments));
      const acknowledgment = { ...bookedArguments, operation: { ...bookedArguments.operation, commitmentChanges: [{ dateId: '2026-10-11', planId: 'museum', reason: 'Synthetic explicit itinerary change instruction' }] } };
      expect((await client.callTool({ name: 'preview_changes', arguments: acknowledgment })).structuredContent).toMatchObject({ ok: true, data: { canApply: true, commitmentImpacts: [{ accepted: true }], newRisks: [{ code: 'booked_plan_unscheduled' }] } });
      expect(input).toEqual(before);
    } finally { await client.close(); }
  }, 30000);
});
