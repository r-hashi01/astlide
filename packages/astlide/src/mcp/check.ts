/**
 * `check_deck`: find text and boxes that don't fit, from the same layout the
 * PowerPoint export uses (@astlide/engine — no browser), so an agent can
 * shorten text or split a slide before exporting.
 *
 * Problems found, per slide:
 *
 * - `text-clipped` — text cut off by an ancestor with `overflow: hidden`
 *   (the slide itself is one): part of it isn't visible.
 * - `text-overflow` — text spilling out of the box it is in (a fixed-height
 *   card, a column, the slide's content area) — it overlaps what's next to it.
 * - `box-clipped` / `box-overflow` — the same for boxes (images, tables,
 *   cards …), reported for the outermost box only.
 * - `off-slide` — outside the slide and not clipped by it (a layout without
 *   `overflow: hidden`).
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
import type { Box, FontRegistry, Rect, SlideLayout, TextLine } from "@astlide/engine";
import type { Element } from "domhandler";
import { buildSite, deckDir, printView, projectRoot } from "./project";

export type IssueKind =
	| "text-clipped"
	| "text-overflow"
	| "box-clipped"
	| "box-overflow"
	| "off-slide";

/** How far something reaches past an edge, in px (only the edges it crosses). */
export type Overflow = Partial<Record<"top" | "right" | "bottom" | "left", number>>;

export interface LayoutIssue {
	/** 1-based slide number in the built deck (hidden slides are left out). */
	slide: number;
	/** The slide's title (its first heading), to tell slides apart. */
	slideTitle?: string;
	kind: IssueKind;
	/** The element: tag, id and classes (`p`, `div.card`). */
	element: string;
	/** The text concerned (shortened). */
	text?: string;
	/** What it overflows: the clipping or containing element, or `slide`. */
	container: string;
	overflow: Overflow;
	/** The largest of the overflow amounts, px. */
	amount: number;
	/** One line for a person or an agent. */
	message: string;
}

export interface CheckOptions {
	/** Overflow up to this many px is ignored (rounding, glyph overhang). Default 2. */
	tolerance?: number;
}

const SNIPPET = 80;

function describe(el: Element | undefined): string {
	if (!el) return "?";
	const id = el.attribs.id ? `#${el.attribs.id}` : "";
	const classes = (el.attribs.class ?? "")
		.split(/\s+/)
		.filter((c) => c && !c.startsWith("astro-"))
		.slice(0, 2)
		.map((c) => `.${c}`)
		.join("");
	return `${el.name}${id}${classes}`;
}

const snippet = (s: string) => {
	const t = s.replace(/\s+/g, " ").trim();
	return t.length > SNIPPET ? `${t.slice(0, SNIPPET - 1)}…` : t;
};

/** How far `inner` reaches past `outer` on each side (sides beyond `tolerance` only). */
export function overflowOf(inner: Rect, outer: Rect, tolerance: number): Overflow {
	const o: Overflow = {};
	const sides = {
		top: outer.y - inner.y,
		right: inner.x + inner.w - (outer.x + outer.w),
		bottom: inner.y + inner.h - (outer.y + outer.h),
		left: outer.x - inner.x,
	};
	for (const [side, v] of Object.entries(sides) as [keyof Overflow, number][])
		if (v > tolerance) o[side] = Math.round(v);
	return o;
}

const amountOf = (o: Overflow) => Math.max(0, ...Object.values(o));

function textContent(el: Element): string {
	return el.children
		.map((c) => (c.type === "text" ? c.data : c.type === "tag" ? textContent(c) : ""))
		.join(" ");
}

/** Positioned out of flow: where it goes is its own business, not its parent's. */
const outOfFlow = (box: Box) => /^(absolute|fixed)$/.test(box.style.get("position") ?? "");

/** Table parts: rows grow to fit their cells in a browser, so they aren't checked. */
const TABLE_PARTS = new Set(["tr", "td", "th", "thead", "tbody", "tfoot", "caption"]);

/**
 * Not checked: template artwork, Mermaid diagrams (laid out by the browser),
 * export stand-ins, hidden decoration — and imported PowerPoint pages
 * (`.astlide-pptx`), drawn at PowerPoint's positions, which the engine
 * doesn't place on the slide like a browser does yet (#142).
 */
const SKIPPED = /\b(astlide-tpl-art|astlide-mermaid|astlide-pptx)\b/;

/** Things other than text: pictures, drawings, embeds, tables. */
const MEDIA = new Set([
	"img",
	"svg",
	"video",
	"iframe",
	"canvas",
	"picture",
	"object",
	"embed",
	"table",
]);

function hasMedia(el: Element): boolean {
	return MEDIA.has(el.name) || el.children.some((c) => c.type === "tag" && hasMedia(c as Element));
}

function depth(el: Element | undefined): number {
	let d = 0;
	for (let e = el?.parent; e; e = e.parent) d++;
	return d;
}

function skipped(el: Element | undefined): boolean {
	for (let e: Element | null | undefined = el; e; e = e.parent as Element | null) {
		if (e.type !== "tag") break;
		if (SKIPPED.test(e.attribs.class ?? "")) return true;
		if ("data-astlide-static" in e.attribs || "aria-hidden" in e.attribs) return true;
	}
	return false;
}

/** The problems on one laid-out slide. */
export function checkSlide(
	layout: SlideLayout,
	slide: number,
	options: CheckOptions = {},
): LayoutIssue[] {
	const tolerance = options.tolerance ?? 2;
	const slideRect: Rect = { x: 0, y: 0, w: layout.width, h: layout.height };
	const eidOf = new Map<Element, number>(layout.elements.map((e, i) => [e, i]));
	const boxOf = new Map<number, Box>(layout.boxes.map((b) => [b.eid, b]));
	const heading = layout.elements.find((e) => /^h[1-3]$/.test(e.name));
	const slideTitle = heading ? snippet(textContent(heading)) || undefined : undefined;
	const where = `Slide ${slide}${slideTitle ? ` "${slideTitle}"` : ""}`;

	/** The nearest ancestor element that has a box (the slide when none). */
	const parentBox = (el: Element | undefined): Box | undefined => {
		for (
			let p = el?.parent as Element | null | undefined;
			p && p.type === "tag";
			p = p.parent as Element | null
		) {
			const eid = eidOf.get(p);
			if (eid === undefined) return undefined; // the slide element (not among its descendants)
			const b = boxOf.get(eid);
			if (b) return b;
		}
		return undefined;
	};

	/**
	 * The slide's content area: the slide minus its padding — where a layout
	 * means content to stay (children of the slide are checked against it).
	 */
	const pad = (side: string) => Number.parseFloat(layout.style.get(`padding-${side}`) ?? "0") || 0;
	const contentArea: Rect = {
		x: pad("left"),
		y: pad("top"),
		w: layout.width - pad("left") - pad("right"),
		h: layout.height - pad("top") - pad("bottom"),
	};

	interface Found {
		kind: IssueKind;
		element: string;
		container: string;
		overflow: Overflow;
		texts: string[];
	}
	const found: Found[] = [];
	const push = (
		kind: IssueKind,
		element: string,
		container: string,
		overflow: Overflow,
		text?: string,
	) => {
		// Text blocks running out of the same container (list items past the
		// slide's bottom …) are one problem.
		const same = text
			? found.find((f) => f.texts.length > 0 && f.kind === kind && f.container === container)
			: undefined;
		if (same && text) {
			same.texts.push(text);
			for (const [side, v] of Object.entries(overflow) as [keyof Overflow, number][])
				same.overflow[side] = Math.max(same.overflow[side] ?? 0, v);
			return;
		}
		found.push({ kind, element, container, overflow: { ...overflow }, texts: text ? [text] : [] });
	};
	const toIssue = ({ kind, element, container, overflow, texts }: Found): LayoutIssue => {
		const sides = Object.entries(overflow)
			.map(([s, v]) => `${v}px ${s}`)
			.join(", ");
		const text =
			texts.length === 0
				? undefined
				: texts.length === 1
					? texts[0]
					: `${texts[0]} … ${texts[texts.length - 1]}`;
		const what =
			texts.length === 0
				? element
				: texts.length === 1
					? `text "${texts[0]}" (${element})`
					: `${texts.length} text blocks, "${texts[0]}" to "${texts[texts.length - 1]}",`;
		const by = container === "slide" ? "the slide" : container;
		const verb =
			kind === "text-clipped" || kind === "box-clipped"
				? container === element && texts.length <= 1
					? "is cut off: it doesn't fit its own box (overflow: hidden)"
					: `${texts.length > 1 ? "are" : "is"} cut off by ${by}`
				: kind === "off-slide"
					? `reach${texts.length > 1 ? "" : "es"} outside the slide`
					: `overflow${texts.length > 1 ? "" : "s"} ${by}`;
		return {
			slide,
			...(slideTitle ? { slideTitle } : {}),
			kind,
			element,
			...(text ? { text } : {}),
			container,
			overflow,
			amount: amountOf(overflow),
			message: `${where}: ${what} ${verb} (${sides})`,
		};
	};

	// ── Boxes: the outermost box that is clipped or spills out of its parent ──
	const reported = new Set<Element>();
	const underReported = (el: Element | undefined) => {
		for (
			let p = el?.parent as Element | null | undefined;
			p && p.type === "tag";
			p = p.parent as Element | null
		)
			if (reported.has(p)) return true;
		return false;
	};
	for (const box of layout.boxes) {
		const el = layout.elements[box.eid];
		if (!el || box.w <= 0 || box.h <= 0 || box.style.get("display") === "none") continue;
		if (outOfFlow(box) || TABLE_PARTS.has(el.name) || skipped(el) || underReported(el)) continue;
		// Boxes of text only: their text is reported below, with the words to shorten.
		if (!hasMedia(el)) continue;
		const rect: Rect = { x: box.x, y: box.y, w: box.w, h: box.h };
		if (box.clip) {
			const o = overflowOf(rect, box.clip, tolerance);
			if (amountOf(o) > 0) {
				const clipper = layout.boxes.find(
					(b) =>
						Math.abs(b.x - box.clip!.x) < 1 &&
						Math.abs(b.y - box.clip!.y) < 1 &&
						b.w >= box.clip!.w - 1 &&
						b.h >= box.clip!.h - 1 &&
						b.style.get("overflow") !== "visible",
				);
				push(
					"box-clipped",
					describe(el),
					clipper ? describe(layout.elements[clipper.eid]) : "slide",
					o,
				);
				reported.add(el);
				continue;
			}
		}
		const parent = parentBox(el);
		const o = parent
			? overflowOf(rect, { x: parent.x, y: parent.y, w: parent.w, h: parent.h }, tolerance)
			: overflowOf(rect, contentArea, tolerance);
		if (amountOf(o) > 0) {
			const off = overflowOf(rect, slideRect, tolerance);
			if (!box.clip && amountOf(off) > 0) push("off-slide", describe(el), "slide", off);
			else
				push(
					"box-overflow",
					describe(el),
					parent ? describe(layout.elements[parent.eid]) : "the slide's content area",
					o,
				);
			reported.add(el);
		}
	}

	// ── Text: each block of lines, against its clip and the boxes around it ──
	const blocks = new Map<number, TextLine[]>();
	for (const line of layout.lines) {
		if (!line.block || !line.text.trim()) continue;
		const list = blocks.get(line.block.id) ?? [];
		list.push(line);
		blocks.set(line.block.id, list);
	}
	for (const lines of blocks.values()) {
		const first = lines[0] as TextLine;
		const left = Math.min(...lines.map((l) => l.x));
		const top = Math.min(...lines.map((l) => l.lineTop ?? l.y));
		const right = Math.max(...lines.map((l) => l.x + l.w));
		const bottom = Math.max(...lines.map((l) => (l.lineTop ?? l.y) + (l.lineHeight ?? l.h)));
		const extent: Rect = { x: left, y: top, w: right - left, h: bottom - top };
		const block = first.block!;
		const startY = first.lineTop ?? first.y;
		// The block's own box: the deepest box around where its text starts.
		let owner: Box | undefined;
		let ownerDepth = -1;
		for (const b of layout.boxes) {
			if (b.x > block.x + 0.5 || b.x + b.w < block.x + block.w - 0.5) continue;
			if (b.y > startY + 0.5 || b.y + b.h < startY + 0.5) continue;
			const d = depth(layout.elements[b.eid]);
			if (d > ownerDepth || (d === ownerDepth && owner && b.w * b.h < owner.w * owner.h)) {
				owner = b;
				ownerDepth = d;
			}
		}
		const ownerEl = owner ? layout.elements[owner.eid] : undefined;
		if (skipped(ownerEl)) continue;
		const text = snippet(lines.map((l) => l.text).join(" "));
		const element = describe(ownerEl);

		if (first.clip) {
			const o = overflowOf(extent, first.clip, tolerance);
			if (amountOf(o) > 0) {
				const clipper = layout.boxes.find(
					(b) =>
						Math.abs(b.x - first.clip!.x) < 1 &&
						Math.abs(b.y - first.clip!.y) < 1 &&
						b.w >= first.clip!.w - 1 &&
						b.h >= first.clip!.h - 1,
				);
				push(
					"text-clipped",
					element,
					clipper ? describe(layout.elements[clipper.eid]) : "slide",
					o,
					text,
				);
				continue;
			}
		}
		const off = overflowOf(extent, slideRect, tolerance);
		if (amountOf(off) > 0) {
			push("off-slide", element, "slide", off, text);
			continue;
		}
		// The innermost box around it that the text spills out of — up to the
		// first box positioned out of flow (its containing block may be anywhere),
		// and not past table cells (rows grow to fit them in a browser).
		let settled = false;
		for (let b = owner; b; b = parentBox(layout.elements[b.eid])) {
			const el = layout.elements[b.eid];
			if (el && TABLE_PARTS.has(el.name)) {
				settled = true;
				break;
			}
			const o = overflowOf(extent, { x: b.x, y: b.y, w: b.w, h: b.h }, tolerance);
			if (amountOf(o) > 0) {
				push("text-overflow", element, describe(el), o, text);
				settled = true;
				break;
			}
			if (outOfFlow(b)) {
				settled = true;
				break;
			}
		}
		if (!settled) {
			const o = overflowOf(extent, contentArea, tolerance);
			if (amountOf(o) > 0) push("text-overflow", element, "the slide's content area", o, text);
		}
	}
	return found.map(toIssue);
}

/** Check every slide of a laid-out page. */
export function checkLayouts(layouts: SlideLayout[], options: CheckOptions = {}): LayoutIssue[] {
	return layouts.flatMap((layout, i) => checkSlide(layout, i + 1, options));
}

/** Lay out a built page's slides with the fonts it uses (as the PPTX export does). */
export async function layoutBuiltPage(
	html: string,
	dist: string,
	cacheDir: string,
): Promise<{ layouts: SlideLayout[]; warnings: string[] }> {
	const engine = await import("@astlide/engine");
	const fonts: FontRegistry = new engine.FontRegistry();
	const css = engine.pageCss(html, dist);
	const local = engine.loadFontFaces(fonts, css, dist);
	const warnings: string[] = [];
	const missing = await engine.loadGoogleFonts(
		fonts,
		engine.familiesIn(css).filter((f) => !local.has(f)),
		cacheDir,
	);
	if (missing.length)
		warnings.push(`fonts not found (text measured with a fallback): ${missing.join(", ")}`);
	const vp = { width: 1920, height: 1080, media: "screen" as const };
	return { layouts: engine.layoutPage(html, dist, fonts, vp), warnings };
}

export interface CheckDeckOptions extends CheckOptions {
	projectRoot: string;
	deck: string;
	/**
	 * Build the site first: `true` always, `false` never (use `dist/` as is),
	 * `"auto"` (default) when the deck's print view is missing or older than
	 * its source files.
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
	const page = printView(root, options.deck);
	const mode = options.build ?? "auto";
	const stale = !existsSync(page) || statSync(page).mtimeMs < newestSource(root, options.deck);
	if (mode === true || (mode === "auto" && stale)) await buildSite(root);
	if (!existsSync(page))
		throw new Error(`no built deck at ${page} — build the site (astro build) first`);
	const dist = join(root, "dist");
	const view = siteView(page, dist);
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
