#!/usr/bin/env bun
/**
 * `astlide` — the Astlide command line.
 *
 *   astlide export <deck> [--pdf] [--pptx] [--png]
 *   astlide export --all --pdf --pptx
 *   astlide import talk.pptx [--deck my-talk]
 *   astlide template list | add | show | download | remove [--store <location>]
 *
 * Every format starts from the built site — a build of its own, in
 * node_modules/.astro/astlide-export (never dist/), with speaker notes. PDF
 * and PNG are rendered by a browser: unless `--base-url` points at a running
 * server, that build is served on a free port for the export, then stopped.
 * PPTX needs no browser: the built slides are laid out by the layout engine (src/engine).
 */

import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { exportBuildDir } from "@astlide/core/utils/export-build";
import { getDecks } from "./pptx/export";

type Format = "pdf" | "png" | "pptx";

interface Options {
	decks: string[];
	all: boolean;
	formats: Set<Format>;
	output?: string;
	outDir: string;
	baseUrl?: string;
	build: boolean;
	width: number;
	height: number;
	cwd: string;
	/** --cwd was given: don't infer the project from deck paths. */
	cwdSet: boolean;
	/** No Astro project: the decks come from the site at --base-url. */
	fromSite?: boolean;
}

const HELP = `
astlide — slides that live in your Astro site

Usage:
  astlide export <deck...> [formats] [options]
    <deck> is a deck name, or a path to it (src/content/decks/my-talk,
    dist/my-talk, …) — the project is then found from that path
  astlide export --all [formats] [options]
  astlide import <file.pptx | Google Slides URL> [--deck <name>] [--force]
    Turn a PowerPoint (or Google Slides / Keynote saved as PowerPoint) into
    an editable deck: src/content/decks/<deck>/*.html, pictures in public/pptx/.
    A Google Slides URL works when the deck is shared as "Anyone with the link".
    (To show a .pptx as is, just put it in a deck folder.)
  astlide template <list | add | show | download | remove> [--store <location>]
    Manage the PowerPoint templates in a template store (a folder, s3://,
    gs:// or azure://), the one the render service and astlide({ templates })
    read. Run \`astlide template --help\` for details.
  astlide mcp [--root <dir>]... [--template-store <location>]
    Run the Astlide MCP server over stdio, for coding agents:
    claude mcp add astlide -- bunx astlide mcp
    Its tools build and export only projects inside the client's MCP roots,
    the --root folders (or ASTLIDE_MCP_ROOTS), or else the folder it was
    started in — never by default the filesystem root or home folder.

Formats (combine as needed; default --pdf):
  --pdf                 One multi-page PDF per deck
  --pptx                Editable PowerPoint (no browser needed)
  --png                 One PNG per slide

Options:
  -a, --all             Export every deck
  -o, --output <path>   Output file / directory (one deck and one format only)
  --out-dir <dir>       Where exports go (default: ./exports)
  --no-build            Reuse the last export build (else dist/, without notes
                        unless notes: "public") instead of building first
  --base-url <url>      PDF / PNG: render from a running dev / preview server
                        (include Astro's base, e.g. http://localhost:4321/my-repo).
                        Outside an Astro project (a Next.js, Nuxt … site), every
                        format comes from that site; run its production server
                        for PPTX
  --width <px>          PDF / PNG: slide width (default: 1920)
  --height <px>         PDF / PNG: slide height (default: 1080)
  --cwd <dir>           Project root (default: current directory)
  -h, --help            Show this help

Examples:
  astlide export my-talk                 # → exports/my-talk.pdf
  astlide export my-talk --pptx          # → exports/my-talk.pptx
  astlide export --all --pdf --pptx
  astlide export my-talk --base-url http://localhost:4321
  astlide export my-talk --pdf --pptx --base-url http://localhost:3000   # a Next.js site
  astlide import ~/Downloads/kickoff.pptx --deck kickoff
`;

function fail(message: string): never {
	console.error(`Error: ${message}\n${HELP}`);
	process.exit(1);
}

function positiveInt(value: string | undefined, flag: string): number {
	const n = Number.parseInt(value ?? "", 10);
	if (Number.isNaN(n) || n <= 0) fail(`${flag} must be a positive integer`);
	return n;
}

function parseExportArgs(args: string[]): Options {
	const options: Options = {
		decks: [],
		all: false,
		formats: new Set(),
		outDir: "exports",
		build: true,
		width: 1920,
		height: 1080,
		cwd: process.cwd(),
		cwdSet: false,
	};
	for (let i = 0; i < args.length; i++) {
		const arg = args[i] as string;
		// After `--`, everything is a deck name (even one starting with "-").
		if (arg === "--") {
			options.decks.push(...args.slice(i + 1));
			break;
		}
		switch (arg) {
			case "--pdf":
			case "--png":
			case "--pptx":
				options.formats.add(arg.slice(2) as Format);
				break;
			case "-a":
			case "--all":
				options.all = true;
				break;
			case "-o":
			case "--output":
				options.output = args[++i] ?? fail("--output needs a path");
				break;
			case "--out-dir":
				options.outDir = args[++i] ?? fail("--out-dir needs a directory");
				break;
			case "--base-url":
				options.baseUrl = (args[++i] ?? fail("--base-url needs a URL")).replace(/\/+$/, "");
				break;
			case "--no-build":
				options.build = false;
				break;
			case "--width":
				options.width = positiveInt(args[++i], "--width");
				break;
			case "--height":
				options.height = positiveInt(args[++i], "--height");
				break;
			case "--cwd":
				options.cwd = resolve(args[++i] ?? fail("--cwd needs a directory"));
				options.cwdSet = true;
				break;
			default:
				if (arg.startsWith("-")) fail(`unknown option ${arg}`);
				options.decks.push(arg);
		}
	}
	if (options.formats.size === 0) options.formats.add("pdf");
	return options;
}

/** Where one deck's export in one format goes. */
function outputFor(options: Options, deck: string, format: Format): string {
	if (options.output) return resolve(options.cwd, options.output);
	const dir = resolve(options.cwd, options.outDir);
	if (format === "png") return join(dir, `${deck}-slides`);
	return join(dir, `${deck}.${format}`);
}

/** The nearest directory at or above `from` with src/content/decks. */
function findProjectRoot(from: string): string | null {
	let dir = resolve(from);
	for (;;) {
		if (existsSync(join(dir, "src", "content", "decks"))) return dir;
		const parent = dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

/** Subdirectories of `dir` that are Astlide projects (to suggest --cwd). */
function nearbyProjects(dir: string): string[] {
	try {
		return readdirSync(dir, { withFileTypes: true })
			.filter((e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules")
			.filter((e) => existsSync(join(dir, e.name, "src", "content", "decks")))
			.map((e) => e.name);
	} catch {
		return [];
	}
}

/**
 * Deck arguments may be names or paths. A path names the deck by its last
 * segment and, unless --cwd was given, locates the project. Without paths,
 * the project is the nearest one at or above the working directory.
 */
function resolveProject(options: Options): void {
	options.decks = options.decks.map((arg) => {
		if (!/[\\/]/.test(arg)) return arg;
		const target = resolve(options.cwd, arg);
		const root = options.cwdSet ? null : findProjectRoot(target);
		if (root) options.cwd = root;
		return basename(target);
	});
	// The same deck named twice (e.g. by name and by path) is exported once.
	options.decks = [...new Set(options.decks)];
	if (existsSync(join(options.cwd, "src", "content", "decks"))) return;
	const root = options.cwdSet ? null : findProjectRoot(options.cwd);
	if (root) {
		options.cwd = root;
		return;
	}
	// A running site has the decks: no Astro project needed (Next.js, Nuxt …).
	if (options.baseUrl && !options.all) {
		options.fromSite = true;
		return;
	}
	if (options.cwdSet) return;
	const hints = nearbyProjects(options.cwd).map((d) => `--cwd ${d}`);
	fail(
		`no Astlide project here (no src/content/decks in ${options.cwd} or above).` +
			(hints.length > 0
				? ` Try: ${hints.join(" or ")}`
				: " Run it in your project, or pass --cwd."),
	);
}

/**
 * Export from one of two places: an Astro project (decks in
 * src/content/decks; PPTX from its build, PDF / PNG from it served or from
 * --base-url), or, outside one, the running site at --base-url (any
 * framework; every format from the site).
 */
async function runExport(options: Options): Promise<void> {
	resolveProject(options);
	if (options.fromSite) return exportFromSite(options, options.baseUrl as string);
	return exportFromProject(options);
}

async function exportFromProject(options: Options): Promise<void> {
	if (options.cwd !== process.cwd())
		console.log(`Project: ${relative(process.cwd(), options.cwd) || "."}`);
	const known = await getDecks(options.cwd).catch(() => [] as string[]);
	const decks = options.all ? known : options.decks;
	if (decks.length === 0) {
		fail(options.all ? "no decks found in src/content/decks" : "name a deck, or pass --all");
	}
	for (const deck of decks) {
		if (!known.includes(deck)) fail(`no deck "${deck}" (known: ${known.join(", ") || "none"})`);
	}
	checkOutput(options, decks);

	// PPTX first: it needs the build but no browser or server.
	if (options.formats.has("pptx")) {
		const { exportPptx } = await import("./pptx/export");
		for (const [n, deck] of decks.entries()) {
			console.log(`\nPPTX: ${deck}`);
			await exportPptx(deck, {
				root: options.cwd,
				output: outputFor(options, deck, "pptx"),
				// Build once; later decks (and PDF / PNG) reuse that build.
				build: options.build && n === 0,
			});
		}
		options.build = false;
	}
	if (!options.formats.has("pdf") && !options.formats.has("png")) return;

	if (options.baseUrl) return renderFromSite(options, decks, options.baseUrl);
	if (
		!options.build &&
		!existsSync(exportBuildDir(options.cwd)) &&
		!existsSync(join(options.cwd, "dist"))
	) {
		fail("--no-build needs an earlier export build or a dist/ (run astro build first)");
	}
	console.log(options.build ? "\nBuilding the site…" : "\nServing the built site…");
	const { startSite } = await import("./site-server");
	const server = await startSite({ root: options.cwd, build: options.build });
	try {
		await renderFromSite(options, decks, server.url);
	} finally {
		await server.stop();
	}
}

async function exportFromSite(options: Options, baseUrl: string): Promise<void> {
	const decks = options.decks;
	if (decks.length === 0) fail("name a deck (--all needs an Astro project)");
	checkOutput(options, decks);
	// A deck is one the site has a print view of.
	for (const deck of decks) {
		const url = `${baseUrl}/${encodeURIComponent(deck)}/all`;
		const status = await fetch(url).then(
			(r) => r.status,
			(e: Error) => fail(`can't reach ${url}: ${e.message}`),
		);
		if (status !== 200) fail(`no deck "${deck}" at ${baseUrl} (${url}: HTTP ${status})`);
	}

	// PPTX from the site's print view, saved as the exporter reads a build.
	if (options.formats.has("pptx")) {
		const { pptxFromPrintView } = await import("./pptx/export");
		const { savePrintView } = await import("./pptx/site-print-view");
		for (const deck of decks) {
			console.log(`\nPPTX: ${deck} (from ${baseUrl})`);
			const dir = await mkdtemp(join(tmpdir(), "astlide-site-"));
			try {
				const view = await savePrintView(baseUrl, deck, dir);
				await pptxFromPrintView({
					...view,
					root: options.cwd,
					deck,
					output: outputFor(options, deck, "pptx"),
				});
			} finally {
				await rm(dir, { recursive: true, force: true });
			}
		}
	}
	await renderFromSite(options, decks, baseUrl);
}

function checkOutput(options: Options, decks: string[]): void {
	if (options.output && (decks.length > 1 || options.formats.size > 1)) {
		fail("--output works with one deck and one format; use --out-dir otherwise");
	}
}

/** PDF / PNG of `decks`, rendered by a browser from the site at `baseUrl`. */
async function renderFromSite(options: Options, decks: string[], baseUrl: string): Promise<void> {
	const formats = (["pdf", "png"] as const).filter((f) => options.formats.has(f));
	if (formats.length === 0) return;
	// Imported only now so PPTX-only exports work without Playwright installed.
	const { exportDeck } = await import("./render");
	for (const deck of decks) {
		for (const format of formats) {
			await exportDeck(deck, {
				format,
				baseUrl,
				output: outputFor(options, deck, format),
				width: options.width,
				height: options.height,
			});
		}
	}
}

async function runImport(args: string[]): Promise<void> {
	let source: string | undefined;
	let deck: string | undefined;
	let cwd = process.cwd();
	let force = false;
	for (let i = 0; i < args.length; i++) {
		const arg = args[i] as string;
		if (arg === "--deck") deck = args[++i] ?? fail("--deck needs a name");
		else if (arg === "--cwd") cwd = resolve(args[++i] ?? fail("--cwd needs a directory"));
		else if (arg === "--force") force = true;
		else if (arg.startsWith("-")) fail(`unknown option ${arg}`);
		else if (source) fail("import takes one file or URL");
		else source = arg;
	}
	if (!source) fail("name a .pptx file or a Google Slides URL");
	const root = findProjectRoot(cwd);
	if (!root)
		fail(
			`no Astlide project here (no src/content/decks in ${cwd} or above) — run it in your project, or pass --cwd`,
		);
	const { importDeck } = await import("./import");
	const isUrl = /^https?:/.test(source);
	const result = await importDeck({
		source: isUrl ? source : resolve(process.cwd(), source),
		root,
		deck,
		force,
	});
	console.log(`✓ Imported ${result.slides} slides → ${result.dir}`);
}

async function main(): Promise<void> {
	const [command, ...rest] = process.argv.slice(2);
	if (!command || command === "-h" || command === "--help") {
		console.log(HELP);
		return;
	}
	if (command === "mcp") {
		// Runs until the client closes stdin; nothing else may write to stdout.
		const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
		const { createServer } = await import("../mcp/server-def");
		const { explicitRoots, isBroadFolder } = await import("../mcp/project");
		const roots = explicitRoots(rest);
		// stdout is the MCP channel: notes go to stderr.
		for (const root of roots.filter((r) => isBroadFolder(r)))
			console.error(
				`astlide mcp: ${root} allows every project under it — name the project folder instead if you can`,
			);
		const { templateStoreArg } = await import("../mcp/project");
		const location = templateStoreArg(rest) ?? process.env.ASTLIDE_TEMPLATE_STORE;
		const { openTemplateStore } = await import("../templates/index");
		const templateStore = location
			? openTemplateStore(/^[a-z][a-z0-9+.-]*:\/\//i.test(location) ? location : resolve(location))
			: undefined;
		const transport = new StdioServerTransport();
		transport.onclose = () => process.exit(0);
		await createServer({
			...(roots.length ? { allowedRoots: roots } : {}),
			...(templateStore ? { templateStore } : {}),
		}).connect(transport);
		return new Promise<never>(() => {});
	}
	if (command === "template") {
		const { runTemplateCommand, TEMPLATE_HELP, TemplateUsageError } = await import("./template");
		if (rest.length === 0 || rest.includes("-h") || rest.includes("--help")) {
			console.log(TEMPLATE_HELP);
			return;
		}
		try {
			await runTemplateCommand(rest, { log: console.log, env: process.env, cwd: process.cwd() });
		} catch (e) {
			if (!(e instanceof TemplateUsageError)) throw e;
			console.error(`Error: ${e.message}\n${TEMPLATE_HELP}`);
			process.exit(1);
		}
		return;
	}
	if (command !== "export" && command !== "import") fail(`unknown command "${command}"`);
	if (rest.includes("-h") || rest.includes("--help")) {
		console.log(HELP);
		return;
	}
	if (command === "import") {
		await runImport(rest);
		return;
	}
	await runExport(parseExportArgs(rest));
	console.log("\n✓ Export complete");
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		// The message only: Bun would print the Error with a source excerpt.
		const what = process.argv[2] === "template" ? "Error" : "Export failed";
		console.error(`${what}: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(1);
	});
