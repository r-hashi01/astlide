#!/usr/bin/env bun
/**
 * `astlide` — the Astlide command line.
 *
 *   astlide export <deck> [--pdf] [--pptx] [--png]
 *   astlide export --all --pdf --pptx
 *
 * Every format starts from the built site. PDF and PNG are rendered by a
 * browser: unless `--base-url` points at a running server, dist/ is served on
 * a free port for the export, then stopped. PPTX needs no browser: the built
 * slides are laid out by @astlide/engine.
 */

import { existsSync, readdirSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
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
}

const HELP = `
astlide — slides that live in your Astro site

Usage:
  astlide export <deck...> [formats] [options]
    <deck> is a deck name, or a path to it (src/content/decks/my-talk,
    dist/my-talk, …) — the project is then found from that path
  astlide export --all [formats] [options]

Formats (combine as needed; default --pdf):
  --pdf                 One multi-page PDF per deck
  --pptx                Editable PowerPoint (no browser needed)
  --png                 One PNG per slide

Options:
  -a, --all             Export every deck
  -o, --output <path>   Output file / directory (one deck and one format only)
  --out-dir <dir>       Where exports go (default: ./exports)
  --no-build            Use the existing dist/ instead of building first
  --base-url <url>      PDF / PNG: render from a running dev / preview server
                        (include Astro's base, e.g. http://localhost:4321/my-repo)
  --width <px>          PDF / PNG: slide width (default: 1920)
  --height <px>         PDF / PNG: slide height (default: 1080)
  --cwd <dir>           Project root (default: current directory)
  -h, --help            Show this help

Examples:
  astlide export my-talk                 # → exports/my-talk.pdf
  astlide export my-talk --pptx          # → exports/my-talk.pptx
  astlide export --all --pdf --pptx
  astlide export my-talk --base-url http://localhost:4321
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
	if (options.cwdSet || existsSync(join(options.cwd, "src", "content", "decks"))) return;
	const root = findProjectRoot(options.cwd);
	if (root) {
		options.cwd = root;
		return;
	}
	const hints = nearbyProjects(options.cwd).map((d) => `--cwd ${d}`);
	fail(
		`no Astlide project here (no src/content/decks in ${options.cwd} or above).` +
			(hints.length > 0
				? ` Try: ${hints.join(" or ")}`
				: " Run it in your project, or pass --cwd."),
	);
}

async function runExport(options: Options): Promise<void> {
	resolveProject(options);
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
	if (options.output && (decks.length > 1 || options.formats.size > 1)) {
		fail("--output works with one deck and one format; use --out-dir otherwise");
	}

	// PPTX first: it needs the build but no browser or server.
	if (options.formats.has("pptx")) {
		const { exportPptx } = await import("./pptx/export");
		for (const [n, deck] of decks.entries()) {
			console.log(`\nPPTX: ${deck}`);
			await exportPptx(deck, {
				root: options.cwd,
				output: outputFor(options, deck, "pptx"),
				// Build once; later decks (and PDF / PNG) reuse dist/.
				build: options.build && n === 0,
			});
		}
		options.build = false;
	}

	const rendered = (["pdf", "png"] as const).filter((f) => options.formats.has(f));
	if (rendered.length === 0) return;

	// Imported only now so PPTX-only exports work without Playwright installed.
	const { exportDeck } = await import("./render");
	let server: { url: string; stop(): Promise<void> } | undefined;
	let baseUrl = options.baseUrl;
	if (!baseUrl) {
		if (!options.build && !existsSync(join(options.cwd, "dist"))) {
			fail("--no-build needs an existing dist/ (run astro build first)");
		}
		console.log(options.build ? "\nBuilding the site…" : "\nServing dist/…");
		const { startSite } = await import("./site-server");
		server = await startSite({ root: options.cwd, build: options.build });
		baseUrl = server.url;
	}
	try {
		for (const deck of decks) {
			for (const format of rendered) {
				await exportDeck(deck, {
					format,
					baseUrl,
					output: outputFor(options, deck, format),
					width: options.width,
					height: options.height,
				});
			}
		}
	} finally {
		await server?.stop();
	}
}

async function main(): Promise<void> {
	const [command, ...rest] = process.argv.slice(2);
	if (!command || command === "-h" || command === "--help") {
		console.log(HELP);
		return;
	}
	if (command !== "export") fail(`unknown command "${command}"`);
	if (rest.includes("-h") || rest.includes("--help")) {
		console.log(HELP);
		return;
	}
	await runExport(parseExportArgs(rest));
	console.log("\n✓ Export complete");
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		// The message only: Bun would print the Error with a source excerpt.
		console.error(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(1);
	});
