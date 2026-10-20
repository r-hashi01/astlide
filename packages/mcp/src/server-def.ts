/**
 * The MCP server: Astlide's tools, described for agents.
 *
 * @module
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { checkDeck } from "./check";
import { importPptx } from "./import";
import { renderDeck } from "./render";
import { templateLayoutsFromFile } from "./template";

const VERSION = "0.0.0";

/** A tool's result: a JSON text block (and the same as structured content). */
function json(value: object): CallToolResult {
	return {
		content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
		structuredContent: value as Record<string, unknown>,
	};
}

/** Errors go back to the agent as a tool error, not a protocol error. */
async function guarded(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
	try {
		return await fn();
	} catch (err) {
		return {
			isError: true,
			content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
		};
	}
}

const projectRoot = z
	.string()
	.describe("Absolute path of the Astro project (the folder with src/content/decks)");
const deck = z.string().describe("Deck name: its folder under src/content/decks");

/** Create the Astlide MCP server (connect it to a transport to serve it). */
export function createServer(): McpServer {
	const server = new McpServer(
		{ name: "astlide", version: VERSION },
		{
			instructions:
				"Astlide decks are folders of numbered slide files (.md / .mdx / .html) under src/content/decks/<deck>/ in an Astro project. " +
				"After writing or editing slides, call check_deck and fix every issue (shorten text, split the slide, or pick another layout), then render_deck. " +
				"Use template_layouts to see the slideLayout names a PowerPoint template offers.",
		},
	);

	server.registerTool(
		"template_layouts",
		{
			title: "PowerPoint template layouts",
			description:
				"List a PowerPoint template's slide layouts (.pptx, .potx or .thmx): each layout's id (use it as `slideLayout` in a slide's frontmatter), PowerPoint name and type, whether it has a title placeholder, how many content placeholders and a slide number — and which built-in Astlide layouts (cover, section, default, two-column, code) are drawn with it. Also returns the theme colors and fonts.",
			inputSchema: {
				templatePath: z.string().describe("Path of the .pptx / .potx / .thmx file"),
			},
			annotations: { readOnlyHint: true },
		},
		({ templatePath }) => guarded(async () => json(await templateLayoutsFromFile(templatePath))),
	);

	server.registerTool(
		"import_pptx",
		{
			title: "Import a PowerPoint deck",
			description:
				"Read a .pptx (PowerPoint, or Google Slides / Keynote saved as PowerPoint): every slide's title, speaker notes and text as Markdown. With projectRoot, also write it as an editable Astlide deck (one .html slide per page in src/content/decks/<deck>/, pictures in public/pptx/<deck>/), like `astlide import`.",
			inputSchema: {
				path: z.string().describe("Path of the .pptx file"),
				projectRoot: projectRoot
					.optional()
					.describe("Astlide project to write the deck into; omit to only read the slides"),
				deck: z.string().optional().describe("Deck folder name (default: from the file name)"),
				force: z.boolean().optional().describe("Replace an existing deck folder"),
				includeHtml: z
					.boolean()
					.optional()
					.describe("Also return each slide's HTML (large; pictures as media/<name>)"),
			},
		},
		(args) => guarded(async () => json(await importPptx(args))),
	);

	server.registerTool(
		"render_deck",
		{
			title: "Export a deck",
			description:
				"Export a deck to an editable PowerPoint (.pptx, laid out without a browser) and / or PDF (needs Playwright's Chromium: `bunx playwright install chromium`). Builds the site first. Returns the written files' paths.",
			inputSchema: {
				projectRoot,
				deck,
				formats: z
					.array(z.enum(["pptx", "pdf"]))
					.min(1)
					.describe("Formats to write"),
				outDir: z.string().optional().describe("Output folder (default: <projectRoot>/exports)"),
				build: z
					.boolean()
					.optional()
					.describe("Build the site first (default true); false reuses dist/"),
			},
		},
		(args) => guarded(async () => json(await renderDeck(args))),
	);

	server.registerTool(
		"check_deck",
		{
			title: "Check a deck's layout",
			description:
				"Lay out a deck's slides (1920×1080, the same layout engine as the PowerPoint export) and report text and boxes that don't fit: cut off by the slide or an `overflow: hidden` box (text-clipped / box-clipped), spilling out of their box or the slide's content area (text-overflow / box-overflow), or outside the slide (off-slide) — with the slide number and title, the text, and by how many px on which side. Fix each one (shorten the text, split the slide, use a roomier layout) and check again. Builds the site when dist/ is missing or older than the deck's files.",
			inputSchema: {
				projectRoot,
				deck,
				build: z
					.union([z.boolean(), z.literal("auto")])
					.optional()
					.describe('Build first: true always, false never, "auto" (default) when out of date'),
			},
			annotations: { readOnlyHint: true },
		},
		(args) =>
			guarded(async () => {
				const r = await checkDeck(args);
				const summary =
					r.issues.length === 0
						? `All ${r.slides} slides fit.`
						: `${r.issues.length} problem(s) in ${new Set(r.issues.map((i) => i.slide)).size} of ${r.slides} slides:\n${r.issues.map((i) => `- ${i.message}`).join("\n")}`;
				const notes = r.warnings.length
					? `\n\nNotes:\n${r.warnings.map((w) => `- ${w}`).join("\n")}`
					: "";
				return {
					content: [{ type: "text", text: `${summary}${notes}` }],
					structuredContent: { ...r },
				};
			}),
	);

	return server;
}
