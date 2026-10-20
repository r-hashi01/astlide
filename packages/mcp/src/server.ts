#!/usr/bin/env bun
/**
 * `astlide-mcp` — the Astlide MCP server over stdio.
 *
 *   claude mcp add astlide -- bun /path/to/astlide/packages/mcp/src/server.ts
 *
 * @module
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server-def";

await createServer().connect(new StdioServerTransport());
