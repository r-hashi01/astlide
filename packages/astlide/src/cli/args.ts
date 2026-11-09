/**
 * The `astlide export` and `astlide import` arguments, parsed without side
 * effects: a usage mistake throws {@link CliUsageError}, which the command
 * line prints with its help.
 *
 * @module
 */

import { resolve } from "node:path";

export type Format = "pdf" | "png" | "pptx";

/** A mistake in the arguments (not a failure while running). */
export class CliUsageError extends Error {}

const usage = (message: string): never => {
	throw new CliUsageError(message);
};

/** An option's value: there, and not the next option (`--base-url --pdf`). */
const optionValue = (value: string | undefined, message: string): string =>
	value === undefined || value.startsWith("-") ? usage(message) : value;

/** A Google Slides deck's URL (its id in group 1): the only URLs `astlide import` reads. */
export const GOOGLE_SLIDES = /^https:\/\/docs\.google\.com\/presentation\/d\/([\w-]+)/;

export interface ExportOptions {
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

function positiveInt(value: string | undefined, flag: string): number {
	// Digits only: `1e3` or `720px` aren't sizes.
	const n = /^\d+$/.test(value ?? "") ? Number(value) : Number.NaN;
	if (Number.isNaN(n) || n <= 0) usage(`${flag} must be a positive integer`);
	return n;
}

/** `astlide export`'s arguments; `cwd` is the working directory relative paths start from. */
export function parseExportArgs(args: string[], cwd: string): ExportOptions {
	const options: ExportOptions = {
		decks: [],
		all: false,
		formats: new Set(),
		outDir: "exports",
		build: true,
		width: 1920,
		height: 1080,
		cwd,
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
				// Relative to where the command runs, not the project root found later.
				options.output = resolve(cwd, optionValue(args[++i], "--output needs a path"));
				break;
			case "--out-dir":
				options.outDir = resolve(cwd, optionValue(args[++i], "--out-dir needs a directory"));
				break;
			case "--base-url":
				options.baseUrl = optionValue(args[++i], "--base-url needs a URL").replace(/\/+$/, "");
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
				options.cwd = resolve(cwd, optionValue(args[++i], "--cwd needs a directory"));
				options.cwdSet = true;
				break;
			default:
				if (arg.startsWith("-")) usage(`unknown option ${arg}`);
				options.decks.push(arg);
		}
	}
	if (options.formats.size === 0) options.formats.add("pdf");
	return options;
}

export interface ImportOptions {
	/** A .pptx file (resolved against the working directory) or a URL. */
	source: string;
	deck?: string;
	/** Where to look for the project. */
	cwd: string;
	force: boolean;
}

/** `astlide import`'s arguments; `cwd` is the working directory relative paths start from. */
export function parseImportArgs(args: string[], cwd: string): ImportOptions {
	let source: string | undefined;
	let deck: string | undefined;
	let projectDir = cwd;
	let force = false;
	for (let i = 0; i < args.length; i++) {
		const arg = args[i] as string;
		if (arg === "--deck") deck = optionValue(args[++i], "--deck needs a name");
		else if (arg === "--cwd")
			projectDir = resolve(cwd, optionValue(args[++i], "--cwd needs a directory"));
		else if (arg === "--force") force = true;
		else if (arg.startsWith("-")) usage(`unknown option ${arg}`);
		else if (source) usage("import takes one file or URL");
		else source = arg;
	}
	if (!source) return usage("name a .pptx file or a Google Slides URL");
	if (/^https?:/i.test(source) && !GOOGLE_SLIDES.test(source))
		usage(
			"only Google Slides URLs (https://docs.google.com/presentation/d/…) can be imported — download other decks as .pptx and import the file",
		);
	return {
		source: /^https?:/.test(source) ? source : resolve(cwd, source),
		...(deck === undefined ? {} : { deck }),
		cwd: projectDir,
		force,
	};
}
