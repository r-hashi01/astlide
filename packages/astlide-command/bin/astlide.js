#!/usr/bin/env bun
/**
 * `astlide` — so that `bunx astlide …` works where `@astlide/core` isn't
 * installed (a global MCP config, a fresh folder). Runs the CLI that ships
 * with `@astlide/core`, with the same arguments.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const core = dirname(fileURLToPath(import.meta.resolve("@astlide/core")));
await import(join(core, "cli", "astlide.ts"));
