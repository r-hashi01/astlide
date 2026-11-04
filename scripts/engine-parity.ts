#!/usr/bin/env bun
/**
 * The layout engine against Chromium, deck by deck: every element with a box
 * on every slide of a built deck's print view (`/<deck>/all`), laid out by
 * Chromium and by the engine (with `check_deck`'s fonts), compared position
 * and size. Elements are matched by their index in the slide
 * (`querySelectorAll("*")` order, which is the engine's element id).
 *
 * Usage (after a build):
 *   bun scripts/engine-parity.ts [--dist playground/dist] [--deck tour] [--deck …]
 *     [--tolerance 2] [--top 10] [--json report.json]
 *
 * Without --deck, every deck in dist (each folder with all/index.html).
 * Prints, per deck, how many boxes differ by more than the tolerance and the
 * largest differences.
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize, resolve } from "node:path";
import { parseArgs } from "node:util";
import { type Browser, chromium } from "playwright";
import { checkLayouts, layoutBuiltPage } from "../packages/astlide/src/mcp/check";

/** One element whose box differs from Chromium's. */
export interface Difference {
	slide: number;
	/** Index in the slide (`querySelectorAll("*")` order). */
	index: number;
	/** `tag.class`. */
	element: string;
	/** Largest difference of x, y, width or height, px. */
	amount: number;
	/**
	 * Whether the difference starts here: the box differs in size, or in
	 * position relative to its nearest ancestor with a box — not only moved
	 * along with an ancestor that differs.
	 */
	own: boolean;
	engine: [number, number, number, number];
	chromium: [number, number, number, number];
}

export interface DeckReport {
	deck: string;
	/** Boxes compared (elements with a box in both). */
	compared: number;
	differences: Difference[];
	/** How many of the differences start at their box (see {@link Difference.own}). */
	own: number;
	/** check_deck's findings on the deck (from the engine's layout). */
	findings: number;
}

const TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".css": "text/css",
	".js": "text/javascript",
	".mjs": "text/javascript",
	".json": "application/json",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".webp": "image/webp",
	".woff2": "font/woff2",
	".woff": "font/woff",
	".ttf": "font/ttf",
};

/** Serve `dist` on a free local port. */
export async function serve(dist: string): Promise<{ url: string; server: Server }> {
	const root = resolve(dist);
	const server = createServer((req, res) => {
		const path = normalize(join(root, decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/")));
		const file = [path, join(path, "index.html")].find(
			(f) => f.startsWith(root) && existsSync(f) && statSync(f).isFile(),
		);
		if (!file) {
			res.writeHead(404);
			res.end();
			return;
		}
		res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
		res.end(readFileSync(file));
	});
	await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
	return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}

/** The decks in a built site: folders with a print view. */
export function decksIn(dist: string): string[] {
	return readdirSync(dist)
		.filter((d) => existsSync(join(dist, d, "all", "index.html")))
		.sort();
}

type Rect = [number, number, number, number];

/** Compare one deck. */
export async function compareDeck(
	browser: Browser,
	baseUrl: string,
	dist: string,
	deck: string,
	options: { tolerance?: number; cacheDir?: string } = {},
): Promise<DeckReport> {
	const tolerance = options.tolerance ?? 2;
	const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
	await page.goto(`${baseUrl}/${encodeURIComponent(deck)}/all/`, { waitUntil: "networkidle" });
	await page.evaluate(() => document.fonts.ready);
	await page
		.waitForFunction(() => document.documentElement.hasAttribute("data-diagrams-ready"), null, {
			timeout: 15_000,
		})
		.catch(() => {});
	// Per slide, per element index: its box relative to the slide, or null without one.
	const chromiumBoxes = await page.evaluate(() =>
		[...document.querySelectorAll("body > .slide")].map((slide) => {
			const s = slide.getBoundingClientRect();
			return [...slide.querySelectorAll("*")].map((el) => {
				const cs = getComputedStyle(el);
				if (cs.display === "none" || cs.display === "contents" || /^inline$/.test(cs.display))
					return null;
				const r = el.getBoundingClientRect();
				return [r.x - s.x, r.y - s.y, r.width, r.height] as [number, number, number, number];
			});
		}),
	);
	await page.close();

	const html = join(dist, deck, "all", "index.html");
	const { layouts } = await layoutBuiltPage(
		html,
		dist,
		options.cacheDir ?? join("node_modules", ".cache", "astlide-fonts"),
	);
	const differences: Difference[] = [];
	let compared = 0;
	for (const [i, layout] of layouts.entries()) {
		const theirs = chromiumBoxes[i] ?? [];
		const ours = new Map(layout.boxes.map((b) => [b.eid, b]));
		const eidOf = new Map(layout.elements.map((el, k) => [el, k]));
		/** The nearest ancestor with a box on both sides, as [engine, Chromium] rects. */
		const ancestor = (eid: number): [Rect, Rect] | undefined => {
			for (let p = layout.elements[eid]?.parent; p; p = p.parent) {
				const k = eidOf.get(p as never);
				if (k === undefined) return undefined;
				const b = ours.get(k);
				const c = theirs[k];
				if (b && c) return [[b.x, b.y, b.w, b.h], c];
			}
			return undefined;
		};
		const largest = (a: number[], b: number[]) =>
			Math.max(...a.map((v, k) => Math.abs(v - (b[k] ?? 0))));
		for (const box of layout.boxes) {
			const c = theirs[box.eid];
			if (!c) continue;
			const e: Rect = [box.x, box.y, box.w, box.h];
			compared++;
			const amount = largest(e, c);
			if (amount <= tolerance) continue;
			const up = ancestor(box.eid);
			const relative = (r: Rect, a: Rect | undefined) =>
				a ? [r[0] - a[0], r[1] - a[1], r[2], r[3]] : r;
			const own = largest(relative(e, up?.[0]), relative(c, up?.[1])) > tolerance;
			const el = layout.elements[box.eid];
			const cls = (el?.attribs.class ?? "").split(/\s+/).filter(Boolean).slice(0, 2).join(".");
			differences.push({
				slide: i + 1,
				index: box.eid,
				element: `${el?.name ?? "?"}${cls ? `.${cls}` : ""}`,
				amount: Math.round(amount),
				own,
				engine: e.map(Math.round) as Rect,
				chromium: c.map(Math.round) as Rect,
			});
		}
	}
	return {
		deck,
		compared,
		differences,
		own: differences.filter((d) => d.own).length,
		findings: checkLayouts(layouts).length,
	};
}

/** Compare decks in a built site with one Chromium. */
export async function compareDecks(
	dist: string,
	decks: string[] = decksIn(dist),
	options: { tolerance?: number; cacheDir?: string } = {},
): Promise<DeckReport[]> {
	const { url, server } = await serve(dist);
	const browser = await chromium.launch();
	try {
		const reports: DeckReport[] = [];
		for (const deck of decks) reports.push(await compareDeck(browser, url, dist, deck, options));
		return reports;
	} finally {
		await browser.close();
		server.close();
	}
}

if (import.meta.main) {
	const { values } = parseArgs({
		options: {
			dist: { type: "string", default: "playground/dist" },
			deck: { type: "string", multiple: true },
			tolerance: { type: "string", default: "2" },
			top: { type: "string", default: "10" },
			json: { type: "string" },
		},
	});
	const reports = await compareDecks(values.dist, values.deck, {
		tolerance: Number(values.tolerance),
	});
	const top = Number(values.top);
	let compared = 0;
	let differing = 0;
	let own = 0;
	for (const r of reports) {
		compared += r.compared;
		differing += r.differences.length;
		own += r.own;
		console.log(
			`${r.deck}: ${r.differences.length} of ${r.compared} boxes differ, ${r.own} where the difference starts (check_deck findings: ${r.findings})`,
		);
		const starts = r.differences.filter((d) => d.own);
		for (const d of starts.sort((a, b) => b.amount - a.amount).slice(0, top))
			console.log(
				`  slide ${d.slide} ${d.element} (#${d.index}): ${d.amount}px — engine ${d.engine.join(",")}, Chromium ${d.chromium.join(",")}`,
			);
	}
	console.log(
		`total: ${differing} of ${compared} boxes differ, ${own} where the difference starts`,
	);
	if (values.json) writeFileSync(values.json, `${JSON.stringify(reports, null, 2)}\n`);
}
