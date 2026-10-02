import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { planningToolResponseSchema } from '../src/domain/planningTools';

const snapshot = JSON.parse(await readFile(resolve(process.argv[2] || 'fixtures/planning-tools.snapshot.json'), 'utf8'));
const client = new Client({ name: 'plan-gacha-demo-client', version: '0.1.0' });
const transport = new StdioClientTransport({ command: process.execPath, args: ['--import', 'tsx', 'src/mcp/stdio.ts'], cwd: process.cwd(), stderr: 'pipe' });
let stderr = '';
transport.stderr?.on('data', (part) => { stderr += String(part); });
try {
  await client.connect(transport);
  const listing = await client.listTools();
  const calls: Array<{ name: string; arguments: Record<string, unknown>; result: unknown }> = [];
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    calls.push({ name, arguments: args, result });
    const response = planningToolResponseSchema.parse(result.structuredContent);
    if (!response.ok) throw new Error(response.error.message);
    return response;
  };
  const context = await call('get_context', { snapshot });
  await call('evaluate_plan', { snapshot, expectedSnapshotToken: context.snapshotToken });
  await call('rank_candidates', { snapshot, dateId: '2026-10-11', expectedSnapshotToken: context.snapshotToken });
  const preview = await call('preview_changes', { snapshot, expectedSnapshotToken: context.snapshotToken, operation: { type: 'assign', dateId: '2026-10-11', planId: 'museum' } });
  const report = { transport: 'stdio', client: '@modelcontextprotocol/client', server: client.getServerVersion(), listing, calls, stderr };
  if (process.argv[3]) await writeFile(resolve(process.argv[3]), JSON.stringify(report, null, 2) + '\n');
  if (process.argv[4] && preview.data.kind === 'preview') await writeFile(resolve(process.argv[4]), JSON.stringify(preview.data.proposal, null, 2) + '\n');
  console.log(JSON.stringify({ tools: listing.tools.map((tool) => tool.name), snapshotToken: context.snapshotToken, preview: preview.data, evidencePath: process.argv[3] || null }, null, 2));
} finally { await client.close(); }
