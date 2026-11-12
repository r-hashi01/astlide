/**
 * `check_deck`: build a project's deck and check its slides' layout (see
 * `check/layout`), so an agent can shorten text or split a slide before
 * exporting.
 *
 * @module
 */

import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
	type CheckOptions,
	checkLayouts,
	type LayoutIssue,
	layoutBuiltPage,
} from "../check/layout";
import { buildSite, checkBuildDir, deckDir, printView, projectRoot } from "./project";

export interface CheckDeckOptions extends CheckOptions {
	projectRoot: string;
	deck: string;
	/**
	 * Build the site first (into its own folder, {@link checkBuildDir}):
	 * `true` always, `false` never (use the last build, else `dist/`), `"auto"`
	 * (default) when the deck's print view is missing or older than its source
	 * files.
	 */
	build?: boolean | "auto";
}

export interface CheckDeckResult {
	slides: number;
	issues: LayoutIssue[];
	warnings: string[];
	/** The page checked. */
	page: string;
}

/** Newest modification time among the deck's files (and the project config). */
function newestSource(root: string, deck: string): number {
	let newest = 0;
	const dir = deckDir(root, deck);
	const visit = (d: string) => {
		for (const name of readdirSafe(d)) {
			const p = join(d, name);
			const s = statSync(p);
			if (s.isDirectory()) visit(p);
			else newest = Math.max(newest, s.mtimeMs);
		}
	};
	visit(dir);
	for (const f of ["astro.config.mjs", "astro.config.ts", "astro.config.js"]) {
		const p = join(root, f);
		if (existsSync(p)) newest = Math.max(newest, statSync(p).mtimeMs);
	}
	return newest;
}

function readdirSafe(d: string): string[] {
	try {
		return readdirSync(d);
	} catch {
		return [];
	}
}

/**
 * The built site as its pages link to it. Under Astro's `base`
 * (`/my-repo/_astro/…`), dist/ holds the files without it: a temporary
 * folder with `my-repo` linked to dist/ resolves those links.
 */
export function siteView(page: string, dist: string): { dir: string; dispose(): void } {
	const same = { dir: dist, dispose() {} };
	const href = readFileSync(page, "utf-8").match(
		/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="(\/[^"?#]+)"|<link\b[^>]*\bhref="(\/[^"?#]+)"[^>]*\brel="stylesheet"/,
	);
	const path = href?.[1] ?? href?.[2];
	if (!path || existsSync(join(dist, path))) return same;
	const segments = path.split("/").filter(Boolean);
	// Only plain folder names: nothing may be linked outside the temporary folder.
	if (segments.some((s) => s === "." || s === ".." || s.includes("\\"))) return same;
	for (let n = 1; n < segments.length; n++) {
		if (!existsSync(join(dist, ...segments.slice(n)))) continue;
		const dir = mkdtempSync(join(tmpdir(), "astlide-check-"));
		const link = join(dir, ...segments.slice(0, n));
		mkdirSync(dirname(link), { recursive: true });
		symlinkSync(dist, link, "dir");
		return { dir, dispose: () => rmSync(dir, { recursive: true, force: true }) };
	}
	return same;
}

export async function checkDeck(options: CheckDeckOptions): Promise<CheckDeckResult> {
	const root = projectRoot(options.projectRoot);
	deckDir(root, options.deck);
	// Its own build (whatever the project's outDir); without one and not building, dist/.
	const own = checkBuildDir(root);
	const mode = options.build ?? "auto";
	const site = mode === false && !existsSync(own) ? join(root, "dist") : own;
	let page = printView(site, options.deck);
	const stale = !existsSync(page) || statSync(page).mtimeMs < newestSource(root, options.deck);
	if (mode === true || (mode === "auto" && stale)) {
		await buildSite(root, own);
		page = printView(site, options.deck);
	}
	if (!existsSync(page))
		throw new Error(`no built deck at ${page} — build the site (astro build) first`);
	// The layout check needs no speaker notes: a plain build, not the export's (utils/export-build).
	const view = siteView(page, site);
	let result: Awaited<ReturnType<typeof layoutBuiltPage>>;
	try {
		result = await layoutBuiltPage(
			page,
			view.dir,
			join(root, "node_modules", ".cache", "astlide-fonts"),
		);
	} finally {
		view.dispose();
	}
	const { layouts, warnings } = result;
	if (readFileSync(page, "utf-8").includes("astlide-mermaid"))
		warnings.push("Mermaid diagrams are not checked");
	return { slides: layouts.length, issues: checkLayouts(layouts, options), warnings, page };
}
