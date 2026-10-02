import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createPlanningServer } from './server';

// stdout is reserved for MCP JSON-RPC. No HTTP listener, browser access or storage adapter.
await createPlanningServer().connect(new StdioServerTransport());
