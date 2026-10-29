#!/usr/bin/env bun
/**
 * `astlide` in an Astro project: the CLI that ships with `@astlide/core`
 * (export, import, render, MCP server), with the same arguments.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const core = dirname(fileURLToPath(import.meta.resolve("@astlide/core")));
await import(join(core, "cli", "astlide.ts"));
