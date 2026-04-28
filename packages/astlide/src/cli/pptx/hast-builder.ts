/**
 * Astlide PPTX slide builder (HAST-based).
 *
 * Converts a ParsedSlide (frontmatter + HAST) into a SlideSpec,
 * faithfully mapping:
 *   • All 10 slideLayouts → PPTX slide geometry
 *   • All 7 built-in themes → background / foreground / accent colours
 *   • HTML elements (h1-h6, p, ul, ol, pre, blockquote) via HAST
 *   • JSX components (div[data-component="..."]) for Left, Right, Columns,
 *     Fragment, Notes, CodeBlock, Math, YouTube, Tweet, ImageSide, TextPanel
 *   • `background` frontmatter → solid hex colour
 *
 * Unlike the previous MDAST+pptxgenjs approach, inline formatting (bold,
 * italic, links, code, strikethrough) is already resolved to HTML tags by
 * remark-rehype, so `collectRuns()` only needs to walk `<strong>`, `<em>`,
 * `<a>`, `<code>`, `<del>` etc.
 */

import type { Element as HastElement, Root as HastRoot, RootContent } from "hast";
import type { ParsedSlide } from "./mdx-parser";
import type { SlideElement, SlideSpec, TextRun, TextRunOptions } from "./ooxml-writer";
import { getTheme, parseSolidColor, type ThemeColors } from "./theme-map";

// ---------------------------------------------------------------------------
// Slide geometry (inches, 16:9)
// ---------------------------------------------------------------------------

const W = 10;
const H = 5.625;
const PAD = 0.4;
const CONTENT_W = W - PAD * 2;

const TITLE_Y = 0.22;
const TITLE_H = 0.95;
const CONTENT_Y = TITLE_Y + TITLE_H + 0.1;
const CONTENT_H = H - CONTENT_Y - PAD;

// Font sizes (pt)
const FS: Record<string, number> = {
	h1: 44,
	h2: 32,
	h3: 26,
	h4: 22,
	body: 20,
	small: 15,
	code: 16,
	quote: 36,
	statement: 52,
	coverTitle: 56,
	coverSub: 24,
};

const FF_SANS = "Calibri";
const FF_MONO = "Courier New";

// ---------------------------------------------------------------------------
// HAST node type helpers
// ---------------------------------------------------------------------------

type HastNode = RootContent;

function isElement(node: HastNode): node is HastElement {
	return node.type === "element";
}

function isText(node: HastNode): node is { type: "text"; value: string } {
	return node.type === "text";
}

function prop(el: HastElement, name: string): string | undefined {
	const v = el.properties?.[name];
	if (typeof v === "string") return v;
	if (v === true) return "true";
	return undefined;
}

// ---------------------------------------------------------------------------
// Inline run collector — walks HAST inline elements to produce TextRun[]
// ---------------------------------------------------------------------------

type RunStyle = Omit<TextRunOptions, "breakLine" | "bullet" | "indentLevel" | "paraSpaceAfter">;

function collectRuns(node: HastNode, theme: ThemeColors, inherited: RunStyle): TextRun[] {
	if (isText(node)) {
		const text = node.value;
		if (!text) return [];
		return [{ text, options: { ...inherited } }];
	}

	if (!isElement(node)) return [];

	const style: RunStyle = { ...inherited };

	switch (node.tagName) {
		case "strong":
		case "b":
			style.bold = true;
			break;
		case "em":
		case "i":
			style.italic = true;
			break;
		case "code":
			style.fontFace = FF_MONO;
			style.color = theme.accent;
			break;
		case "a": {
			style.color = theme.primary;
			const href = prop(node, "href");
			if (href) style.hyperlink = { url: href };
			break;
		}
		case "del":
		case "s":
			style.color = theme.secondary;
			break;
		case "br":
			return [{ text: "\n", options: inherited }];
		// span with data-component (inline JSX like <Fragment>)
		case "span": {
			const comp = prop(node, "dataComponent");
			if (comp === "Fragment" || !comp) {
				// Transparent — just recurse
				break;
			}
			// Other inline components: render children
			break;
		}
	}

	const runs: TextRun[] = [];
	for (const child of node.children) {
		runs.push(...collectRuns(child as HastNode, theme, style));
	}
	return runs;
}

// ---------------------------------------------------------------------------
// Block rendering — converts HAST block elements to TextRun[]
// ---------------------------------------------------------------------------

interface BlockOpts {
	theme: ThemeColors;
	fontSize?: number;
	color?: string;
	align?: "left" | "center" | "right";
	listDepth?: number;
}

function renderHastNode(node: HastNode, opts: BlockOpts): TextRun[] {
	if (isText(node)) {
		const text = node.value?.trim();
		if (!text) return [];
		return [
			{
				text,
				options: {
					fontSize: opts.fontSize ?? FS.body,
					color: opts.color ?? opts.theme.fg,
					fontFace: FF_SANS,
					align: opts.align,
				},
			},
		];
	}
	if (!isElement(node)) return [];
	return renderBlockElement(node, opts);
}

function renderBlockElement(el: HastElement, opts: BlockOpts): TextRun[] {
	switch (el.tagName) {
		case "h1":
		case "h2":
		case "h3":
		case "h4":
		case "h5":
		case "h6":
			return renderHeading(el, opts);
		case "p":
			return renderParagraph(el, opts);
		case "ul":
		case "ol":
			return renderList(el, opts);
		case "pre":
			return renderCodeBlock(el, opts);
		case "blockquote":
			return renderBlockquote(el, opts);
		case "hr":
			return [
				{
					text: " ",
					options: { breakLine: true, paraSpaceAfter: 6 },
				},
			];
		case "div":
		case "span":
			return handleComponent(el, opts);
		case "table":
			return renderTable(el, opts);
		default: {
			// Generic container — recurse into children
			const runs: TextRun[] = [];
			for (const child of el.children) {
				runs.push(...renderHastNode(child as HastNode, opts));
			}
			return runs;
		}
	}
}

function renderHeading(el: HastElement, opts: BlockOpts): TextRun[] {
	const depth = Number.parseInt(el.tagName.slice(1), 10);
	// Guard against unexpected tag names (tagName should always be h1–h6 here,
	// but be defensive: a NaN depth falls back to body-size, non-bold, fg colour)
	if (Number.isNaN(depth)) {
		return collectInlineChildren(el, opts.theme, {
			fontSize: opts.fontSize ?? FS.body,
			bold: false,
			color: opts.color ?? opts.theme.fg,
			fontFace: FF_SANS,
			align: opts.align,
		});
	}
	const sizeMap: Record<number, number> = {
		1: FS.h1,
		2: FS.h2,
		3: FS.h3,
		4: FS.h4,
		5: FS.h4,
		6: FS.h4,
	};
	const fontSize = opts.fontSize ?? sizeMap[depth] ?? FS.body;
	const color = depth === 1 ? (opts.color ?? opts.theme.primary) : (opts.color ?? opts.theme.fg);

	const baseStyle: RunStyle = {
		fontSize,
		bold: depth <= 2,
		color,
		fontFace: FF_SANS,
		align: opts.align,
	};

	const runs = collectInlineChildren(el, opts.theme, baseStyle);
	if (runs.length > 0) {
		const last = runs[runs.length - 1];
		last.options = {
			...last.options,
			breakLine: true,
			paraSpaceAfter: depth <= 2 ? 10 : 6,
		};
	}
	return runs;
}

function renderParagraph(el: HastElement, opts: BlockOpts): TextRun[] {
	const baseStyle: RunStyle = {
		fontSize: opts.fontSize ?? FS.body,
		color: opts.color ?? opts.theme.fg,
		fontFace: FF_SANS,
		align: opts.align,
	};

	const runs = collectInlineChildren(el, opts.theme, baseStyle);
	if (runs.length > 0) {
		const last = runs[runs.length - 1];
		last.options = {
			...last.options,
			breakLine: true,
			paraSpaceAfter: 6,
		};
	}
	return runs;
}

function renderList(el: HastElement, opts: BlockOpts): TextRun[] {
	const ordered = el.tagName === "ol";
	const runs: TextRun[] = [];
	const listDepth = opts.listDepth ?? 0;

	for (const child of el.children) {
		if (!isElement(child) || child.tagName !== "li") continue;
		runs.push(...renderListItem(child, ordered, listDepth, opts));
	}
	return runs;
}

function renderListItem(
	li: HastElement,
	ordered: boolean,
	listDepth: number,
	opts: BlockOpts,
): TextRun[] {
	const { theme } = opts;
	const runs: TextRun[] = [];

	for (const child of li.children) {
		if (!isElement(child)) {
			if (isText(child) && child.value?.trim()) {
				runs.push({
					text: child.value,
					options: {
						fontSize: opts.fontSize ?? FS.body,
						color: opts.color ?? theme.fg,
						fontFace: FF_SANS,
					},
				});
			}
			continue;
		}

		if (child.tagName === "ul" || child.tagName === "ol") {
			// Nested list
			const nestedOrdered = child.tagName === "ol";
			for (const nestedLi of child.children) {
				if (!isElement(nestedLi) || nestedLi.tagName !== "li") continue;
				runs.push(...renderListItem(nestedLi, nestedOrdered, listDepth + 1, opts));
			}
		} else if (child.tagName === "p") {
			const baseStyle: RunStyle = {
				fontSize: opts.fontSize ?? FS.body,
				color: opts.color ?? theme.fg,
				fontFace: FF_SANS,
				align: opts.align,
			};

			const inlineRuns = collectInlineChildren(child, theme, baseStyle);
			if (inlineRuns.length > 0) {
				// Set breakLine + bullet on the LAST run (consistent with renderParagraph
				// and renderHeading). splitIntoParagraphs reads bullet/indentLevel from
				// the run that has breakLine — so all inline runs stay in one paragraph.
				const lastRun = inlineRuns[inlineRuns.length - 1];
				lastRun.options = {
					...lastRun.options,
					bullet: ordered
						? { type: "number", indent: 15 + listDepth * 20 }
						: { indent: 15 + listDepth * 20 },
					indentLevel: listDepth,
					paraSpaceAfter: 4,
					breakLine: true,
				};
				runs.push(...inlineRuns);
			}
		} else {
			// Other block content in list item
			runs.push(...renderBlockElement(child, opts));
		}
	}

	// If no paragraph children found, apply bullet to the last run
	if (runs.length > 0 && !runs.some((r) => r.options?.bullet)) {
		const lastRun = runs[runs.length - 1];
		lastRun.options = {
			...lastRun.options,
			bullet: ordered
				? { type: "number", indent: 15 + listDepth * 20 }
				: { indent: 15 + listDepth * 20 },
			indentLevel: listDepth,
			paraSpaceAfter: 4,
			breakLine: true,
		};
	}

	return runs;
}

function renderCodeBlock(pre: HastElement, opts: BlockOpts): TextRun[] {
	// <pre><code>...</code></pre>
	const codeEl = pre.children.find((c) => isElement(c) && c.tagName === "code") as
		| HastElement
		| undefined;
	const textContent = extractTextContent(codeEl ?? pre);
	const lines = textContent.split("\n");
	const runs: TextRun[] = [];

	for (const line of lines) {
		runs.push({
			text: line === "" ? " " : line,
			options: {
				fontFace: FF_MONO,
				fontSize: opts.fontSize ?? FS.code,
				color: opts.color ?? opts.theme.codeFg,
				breakLine: true,
			},
		});
	}
	return runs;
}

function renderBlockquote(bq: HastElement, opts: BlockOpts): TextRun[] {
	const runs: TextRun[] = [];
	for (const child of bq.children) {
		const childRuns = renderHastNode(child as HastNode, {
			...opts,
			color: opts.color ?? opts.theme.secondary,
		});
		for (const r of childRuns) {
			if (r.options) r.options.indentLevel = (r.options.indentLevel ?? 0) + 1;
		}
		runs.push(...childRuns);
	}
	return runs;
}

function renderTable(table: HastElement, opts: BlockOpts): TextRun[] {
	// Simplified table rendering — extract as tab-separated text
	const runs: TextRun[] = [];
	const rows = findAll(table, "tr");

	for (const row of rows) {
		const cells = [...findAll(row, "th"), ...findAll(row, "td")];
		const cellTexts = cells.map((c) => extractTextContent(c).trim());
		const isHeader = cells.some((c) => c.tagName === "th");

		runs.push({
			text: cellTexts.join("  |  "),
			options: {
				fontSize: opts.fontSize ?? FS.body,
				color: opts.color ?? opts.theme.fg,
				fontFace: FF_SANS,
				bold: isHeader,
				breakLine: true,
				paraSpaceAfter: 2,
			},
		});
	}
	return runs;
}

// ---------------------------------------------------------------------------
// Component handling (div/span with data-component)
// ---------------------------------------------------------------------------

function handleComponent(el: HastElement, opts: BlockOpts): TextRun[] {
	const name = prop(el, "dataComponent");
	if (!name) {
		// Plain div/span — recurse
		const runs: TextRun[] = [];
		for (const child of el.children) {
			runs.push(...renderHastNode(child as HastNode, opts));
		}
		return runs;
	}

	const { theme } = opts;

	switch (name) {
		case "Left":
		case "Right":
		case "Columns":
			// Handled at layout level
			return [];
		case "Notes":
			return [];
		case "Fragment": {
			const runs: TextRun[] = [];
			for (const child of el.children) {
				runs.push(...renderHastNode(child as HastNode, opts));
			}
			return runs;
		}
		case "CodeBlock": {
			const title = prop(el, "dataTitle");
			const titleRun: TextRun[] = title
				? [
						{
							text: title,
							options: {
								fontSize: FS.small,
								color: theme.secondary,
								fontFace: FF_MONO,
								breakLine: true,
								paraSpaceAfter: 4,
							},
						},
					]
				: [];
			const codeRuns: TextRun[] = [];
			for (const child of el.children) {
				codeRuns.push(
					...renderHastNode(child as HastNode, {
						...opts,
						fontSize: FS.code,
						color: theme.codeFg,
					}),
				);
			}
			return [...titleRun, ...codeRuns];
		}
		case "Math": {
			const formula = prop(el, "dataFormula");
			return [
				{
					text: formula ? `[Math: ${formula}]` : "[Math]",
					options: {
						fontSize: opts.fontSize ?? FS.body,
						color: theme.secondary,
						fontFace: FF_MONO,
						breakLine: true,
					},
				},
			];
		}
		case "YouTube": {
			const id = prop(el, "dataId");
			return [
				{
					text: `[YouTube: ${id ?? ""}]`,
					options: {
						fontSize: opts.fontSize ?? FS.small,
						color: theme.secondary,
						breakLine: true,
					},
				},
			];
		}
		case "Tweet": {
			const author = prop(el, "dataAuthor") ?? "";
			const handle = prop(el, "dataHandle") ?? "";
			const text = prop(el, "dataText") ?? "";
			return [
				{
					text: `"${text}"`,
					options: {
						fontSize: opts.fontSize ?? FS.body,
						italic: true,
						color: opts.color ?? theme.fg,
						breakLine: true,
					},
				},
				{
					text: `— ${author} ${handle ? `(@${handle.replace(/^@/, "")})` : ""}`,
					options: {
						fontSize: FS.small,
						color: theme.secondary,
						breakLine: true,
					},
				},
			];
		}
		default: {
			const runs: TextRun[] = [];
			for (const child of el.children) {
				runs.push(...renderHastNode(child as HastNode, opts));
			}
			return runs;
		}
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectInlineChildren(
	el: HastElement,
	theme: ThemeColors,
	baseStyle: RunStyle,
): TextRun[] {
	const runs: TextRun[] = [];
	for (const child of el.children) {
		runs.push(...collectRuns(child as HastNode, theme, baseStyle));
	}
	return runs;
}

function extractTextContent(el: HastElement): string {
	let text = "";
	for (const child of el.children) {
		if (isText(child)) {
			text += child.value;
		} else if (isElement(child)) {
			text += extractTextContent(child);
		}
	}
	return text;
}

function findAll(el: HastElement, tagName: string): HastElement[] {
	const results: HastElement[] = [];
	for (const child of el.children) {
		if (isElement(child)) {
			if (child.tagName === tagName) results.push(child);
			results.push(...findAll(child, tagName));
		}
	}
	return results;
}

// ---------------------------------------------------------------------------
// Content extraction from the HAST
// ---------------------------------------------------------------------------

interface ExtractedContent {
	titleRuns: TextRun[];
	mainRuns: TextRun[];
	leftRuns: TextRun[];
	rightRuns: TextRun[];
	columnGroups: TextRun[][];
	codeBlocks: Array<{ title: string; rawCode: string; lang: string }>;
}

function extractContent(hast: HastRoot, theme: ThemeColors): ExtractedContent {
	const titleRuns: TextRun[] = [];
	const mainRuns: TextRun[] = [];
	const leftRuns: TextRun[] = [];
	const rightRuns: TextRun[] = [];
	const columnGroups: TextRun[][] = [];
	const codeBlocks: Array<{ title: string; rawCode: string; lang: string }> = [];

	let titleFound = false;
	const renderOpts: BlockOpts = { theme };

	for (const node of hast.children) {
		if (!isElement(node)) continue;

		// First h1 → title
		if (node.tagName === "h1" && !titleFound) {
			titleFound = true;
			titleRuns.push(
				...collectInlineChildren(node, theme, {
					fontSize: FS.h1,
					bold: true,
					color: theme.fg,
					fontFace: FF_SANS,
				}),
			);
			continue;
		}

		// div/span with data-component
		const comp = prop(node, "dataComponent");
		if (comp) {
			if (comp === "Left") {
				for (const child of node.children) {
					leftRuns.push(...renderHastNode(child as HastNode, renderOpts));
				}
				continue;
			}
			if (comp === "Right") {
				for (const child of node.children) {
					rightRuns.push(...renderHastNode(child as HastNode, renderOpts));
				}
				continue;
			}
			if (comp === "Columns") {
				for (const child of node.children) {
					if (!isElement(child)) continue;
					const group: TextRun[] = [];
					for (const grandchild of child.children) {
						group.push(...renderHastNode(grandchild as HastNode, renderOpts));
					}
					if (group.length > 0) columnGroups.push(group);
				}
				continue;
			}
			if (comp === "Notes") continue;

			if (comp === "CodeBlock") {
				const title = prop(node, "dataTitle") ?? "";
				let rawCode = "";
				let lang = "";
				// Find pre > code inside the CodeBlock component
				const preEl = findAll(node, "pre")[0];
				if (preEl) {
					const codeEl = preEl.children.find((c) => isElement(c) && c.tagName === "code") as
						| HastElement
						| undefined;
					rawCode = extractTextContent(codeEl ?? preEl);
					const className = codeEl?.properties?.className;
					if (Array.isArray(className)) {
						const langClass = (className as string[]).find((c) => c.startsWith("language-"));
						if (langClass) lang = langClass.slice(9);
					}
				}
				codeBlocks.push({ title, rawCode, lang });
				mainRuns.push({
					text: `[Code: ${title || lang || "snippet"}]`,
					options: {
						fontSize: FS.small,
						color: theme.secondary,
						fontFace: FF_MONO,
						breakLine: true,
					},
				});
				continue;
			}

			// Other JSX components → mainRuns
			mainRuns.push(...handleComponent(node, renderOpts));
			continue;
		}

		// Regular HTML block elements → mainRuns
		mainRuns.push(...renderBlockElement(node, renderOpts));
	}

	// If no <Columns> but we have Left/Right, build columnGroups from them
	if (columnGroups.length === 0 && (leftRuns.length || rightRuns.length)) {
		if (leftRuns.length) columnGroups.push(leftRuns);
		if (rightRuns.length) columnGroups.push(rightRuns);
	}

	return { titleRuns, mainRuns, leftRuns, rightRuns, columnGroups, codeBlocks };
}

// ---------------------------------------------------------------------------
// Slide background helper
// ---------------------------------------------------------------------------

function resolveBackground(
	background: string | undefined,
	theme: ThemeColors,
): { color: string; path?: string } {
	if (!background) return { color: theme.bg };

	const solid = parseSolidColor(background);
	if (solid) return { color: solid };

	if (/^(https?:\/\/|\/)/.test(background.trim())) {
		return { color: theme.bg, path: background.trim() };
	}

	return { color: theme.bg };
}

// ---------------------------------------------------------------------------
// Code box helper
// ---------------------------------------------------------------------------

function addCodeBox(
	elements: SlideElement[],
	rawCode: string,
	codeTitle: string,
	x: number,
	y: number,
	w: number,
	h: number,
	theme: ThemeColors,
): void {
	// Dark background rectangle
	elements.push({
		type: "rect",
		x,
		y,
		w,
		h,
		fill: theme.codeBg,
	});

	const runs: TextRun[] = [];

	if (codeTitle) {
		runs.push({
			text: codeTitle,
			options: {
				fontSize: FS.small,
				color: theme.secondary,
				fontFace: FF_MONO,
				bold: false,
				breakLine: true,
				paraSpaceAfter: 6,
			},
		});
	}

	const lines = rawCode.split("\n");
	for (const line of lines) {
		runs.push({
			text: line === "" ? " " : line,
			options: {
				fontSize: FS.code,
				color: theme.codeFg,
				fontFace: FF_MONO,
				breakLine: true,
			},
		});
	}

	if (runs.length === 0) return;

	elements.push({
		type: "textbox",
		runs,
		x: x + 0.15,
		y: y + 0.1,
		w: w - 0.3,
		h: h - 0.2,
		valign: "top",
		wrap: true,
		shrinkText: true,
	});
}

// ---------------------------------------------------------------------------
// Title and content helpers
// ---------------------------------------------------------------------------

function addTitle(
	elements: SlideElement[],
	runs: TextRun[],
	theme: ThemeColors,
	opts: {
		x?: number;
		y?: number;
		w?: number;
		h?: number;
		align?: "left" | "center" | "right";
		valign?: "top" | "middle" | "bottom";
		fontSize?: number;
		color?: string;
	} = {},
): void {
	if (runs.length === 0) return;

	const styledRuns = runs.map((r) => ({
		...r,
		options: {
			fontFace: FF_SANS,
			bold: true,
			...r.options,
			// Layout-level overrides must win over extract-time defaults
			fontSize: opts.fontSize ?? r.options?.fontSize ?? FS.h1,
			color: opts.color ?? r.options?.color ?? theme.fg,
		},
	}));

	elements.push({
		type: "textbox",
		runs: styledRuns,
		x: opts.x ?? PAD,
		y: opts.y ?? TITLE_Y,
		w: opts.w ?? CONTENT_W,
		h: opts.h ?? TITLE_H,
		align: opts.align ?? "left",
		valign: opts.valign ?? "middle",
		wrap: true,
		shrinkText: true,
	});
}

function addContent(
	elements: SlideElement[],
	runs: TextRun[],
	opts: {
		x?: number;
		y?: number;
		w?: number;
		h?: number;
		align?: "left" | "center" | "right";
		valign?: "top" | "middle" | "bottom";
	} = {},
): void {
	if (runs.length === 0) return;

	elements.push({
		type: "textbox",
		runs,
		x: opts.x ?? PAD,
		y: opts.y ?? CONTENT_Y,
		w: opts.w ?? CONTENT_W,
		h: opts.h ?? CONTENT_H,
		align: opts.align ?? "left",
		valign: opts.valign ?? "top",
		wrap: true,
		shrinkText: true,
	});
}

// ---------------------------------------------------------------------------
// Column layout helper
// ---------------------------------------------------------------------------

function renderColumns(elements: SlideElement[], groups: TextRun[][], y: number, h: number): void {
	if (groups.length === 0) return;

	const colGap = 0.2;
	const totalGap = colGap * (groups.length - 1);
	const colW = (CONTENT_W - totalGap) / groups.length;

	for (let i = 0; i < groups.length; i++) {
		const group = groups[i];
		if (group.length === 0) continue;

		const x = PAD + i * (colW + colGap);

		elements.push({
			type: "textbox",
			runs: group,
			x,
			y,
			w: colW,
			h,
			valign: "top",
			align: "left",
			wrap: true,
			shrinkText: true,
		});
	}
}

// ---------------------------------------------------------------------------
// Mixed code + text layout
// ---------------------------------------------------------------------------

function renderCodeBlocksAndMain(
	elements: SlideElement[],
	content: ExtractedContent,
	theme: ThemeColors,
	y: number,
	h: number,
): void {
	if (content.codeBlocks.length > 0) {
		const nonPlaceholderRuns = content.mainRuns.filter(
			(r) =>
				!(
					typeof r.text === "string" &&
					r.text.startsWith("[Code:") &&
					r.options?.fontFace === FF_MONO
				),
		);

		if (nonPlaceholderRuns.length > 0) {
			const textH = h * 0.35;
			const codeY = y + textH + 0.1;
			const codeH = h - textH - 0.1;

			addContent(elements, nonPlaceholderRuns, { y, h: textH });

			const cb = content.codeBlocks[0];
			addCodeBox(elements, cb.rawCode, cb.title, PAD, codeY, CONTENT_W, codeH, theme);
		} else {
			const cb = content.codeBlocks[0];
			addCodeBox(elements, cb.rawCode, cb.title, PAD, y, CONTENT_W, h, theme);
		}
	} else {
		addContent(elements, content.mainRuns, { y, h });
	}
}

// ---------------------------------------------------------------------------
// Layout implementations
// ---------------------------------------------------------------------------

function layoutDefault(content: ExtractedContent, theme: ThemeColors): SlideElement[] {
	const elements: SlideElement[] = [];
	addTitle(elements, content.titleRuns, theme);

	if (content.columnGroups.length >= 2) {
		renderColumns(elements, content.columnGroups, CONTENT_Y, CONTENT_H);
	} else {
		renderCodeBlocksAndMain(elements, content, theme, CONTENT_Y, CONTENT_H);
	}
	return elements;
}

function layoutCover(content: ExtractedContent, theme: ThemeColors): SlideElement[] {
	const elements: SlideElement[] = [];
	const titleY = H * 0.28;
	const titleH = H * 0.32;

	addTitle(elements, content.titleRuns, theme, {
		y: titleY,
		h: titleH,
		align: "center",
		valign: "middle",
		fontSize: FS.coverTitle,
		color: theme.fg,
	});

	if (content.mainRuns.length > 0) {
		const subtitleRuns = content.mainRuns.map((r) => ({
			...r,
			options: {
				fontFace: FF_SANS,
				...r.options,
				// Layout-level overrides must win
				fontSize: FS.coverSub,
				color: theme.secondary,
				bold: false,
			},
		}));

		elements.push({
			type: "textbox",
			runs: subtitleRuns,
			x: PAD * 2,
			y: titleY + titleH + 0.1,
			w: CONTENT_W - PAD * 2,
			h: H - titleY - titleH - PAD - 0.1,
			align: "center",
			valign: "top",
			wrap: true,
			shrinkText: true,
		});
	}
	return elements;
}

function layoutSection(content: ExtractedContent, theme: ThemeColors): SlideElement[] {
	const elements: SlideElement[] = [];
	const titleRuns = content.titleRuns.length ? content.titleRuns : content.mainRuns;

	addTitle(elements, titleRuns, theme, {
		x: PAD,
		y: 0,
		w: CONTENT_W,
		h: H,
		align: "center",
		valign: "middle",
		fontSize: FS.h1 + 8,
		color: theme.primary,
	});
	return elements;
}

function layoutTwoColumn(content: ExtractedContent, theme: ThemeColors): SlideElement[] {
	const elements: SlideElement[] = [];
	addTitle(elements, content.titleRuns, theme);

	const groups =
		content.columnGroups.length >= 2 ? content.columnGroups : [content.leftRuns, content.rightRuns];

	renderColumns(elements, groups, CONTENT_Y, CONTENT_H);
	return elements;
}

function layoutImageFull(
	content: ExtractedContent,
	theme: ThemeColors,
	bgValue: string | undefined,
): SlideElement[] {
	const elements: SlideElement[] = [];

	if (bgValue && /^(https?:\/\/|\/)/.test(bgValue.trim())) {
		elements.push({
			type: "rect",
			x: 0,
			y: 0,
			w: W,
			h: H,
			fill: "000000",
			fillTransparency: 50,
		});
	}

	addTitle(elements, content.titleRuns, theme, {
		align: "center",
		valign: "middle",
		y: 0,
		h: H,
		color: "FFFFFF",
	});
	return elements;
}

function layoutImageSide(
	content: ExtractedContent,
	theme: ThemeColors,
	side: "left" | "right",
): SlideElement[] {
	const elements: SlideElement[] = [];
	const imgX = side === "left" ? 0 : W / 2;
	const textX = side === "left" ? W / 2 : 0;
	const halfW = W / 2;

	// Image placeholder rectangle
	elements.push({
		type: "rect",
		x: imgX,
		y: 0,
		w: halfW,
		h: H,
		fill: theme.muted,
		line: { color: theme.secondary },
	});

	elements.push({
		type: "textbox",
		runs: [
			{
				text: "[Image]",
				options: { fontSize: FS.small, color: theme.secondary },
			},
		],
		x: imgX,
		y: 0,
		w: halfW,
		h: H,
		align: "center",
		valign: "middle",
	});

	const textPad = PAD * 0.8;
	addTitle(elements, content.titleRuns, theme, {
		x: textX + textPad,
		y: TITLE_Y,
		w: halfW - textPad * 2,
		h: TITLE_H,
	});
	addContent(elements, content.mainRuns, {
		x: textX + textPad,
		y: CONTENT_Y,
		w: halfW - textPad * 2,
		h: CONTENT_H,
	});
	return elements;
}

function layoutCode(content: ExtractedContent, theme: ThemeColors): SlideElement[] {
	const elements: SlideElement[] = [];

	// Determine if we need a dark background
	const needsDarkBg = theme.bg === "FFFFFF" || theme.bg === "FAFAFA";

	addTitle(elements, content.titleRuns, theme, {
		color: needsDarkBg ? theme.codeFg : theme.fg,
	});

	if (content.codeBlocks.length > 0) {
		const cb = content.codeBlocks[0];
		addCodeBox(elements, cb.rawCode, cb.title, PAD, CONTENT_Y, CONTENT_W, CONTENT_H, theme);
	} else {
		const codeRuns = content.mainRuns.map((r) => ({
			...r,
			options: {
				...r.options,
				// Layout-level overrides must win
				fontFace: FF_MONO,
				fontSize: FS.code,
				color: theme.codeFg,
			},
		}));
		addContent(elements, codeRuns);
	}
	return elements;
}

function layoutQuote(content: ExtractedContent, theme: ThemeColors): SlideElement[] {
	const elements: SlideElement[] = [];
	const allRuns = [...content.mainRuns];
	if (allRuns.length === 0 && content.titleRuns.length) {
		allRuns.push(...content.titleRuns);
	}

	const quoteRuns = allRuns.map((r) => ({
		...r,
		options: {
			fontFace: FF_SANS,
			...r.options,
			// Layout-level overrides must win
			fontSize: FS.quote,
			italic: true,
			color: theme.fg,
			align: "center" as const,
		},
	}));

	elements.push({
		type: "textbox",
		runs: quoteRuns,
		x: PAD * 2,
		y: 0,
		w: CONTENT_W - PAD * 2,
		h: H,
		align: "center",
		valign: "middle",
		wrap: true,
		shrinkText: true,
	});
	return elements;
}

function layoutStatement(content: ExtractedContent, theme: ThemeColors): SlideElement[] {
	const elements: SlideElement[] = [];
	const runs = content.titleRuns.length ? content.titleRuns : content.mainRuns;

	const stmtRuns = runs.map((r) => ({
		...r,
		options: {
			fontFace: FF_SANS,
			...r.options,
			// Layout-level overrides must win
			fontSize: FS.statement,
			bold: true,
			color: theme.fg,
			align: "center" as const,
		},
	}));

	elements.push({
		type: "textbox",
		runs: stmtRuns,
		x: PAD,
		y: 0,
		w: CONTENT_W,
		h: H,
		align: "center",
		valign: "middle",
		wrap: true,
		shrinkText: true,
	});
	return elements;
}

// ---------------------------------------------------------------------------
// buildSlide — public entry point
// ---------------------------------------------------------------------------

export function buildSlide(
	parsedSlide: ParsedSlide,
	deckConfig: Record<string, unknown>,
): SlideSpec {
	const fm = parsedSlide.frontmatter;
	const layout = (fm.slideLayout as string | undefined) ?? "default";
	const bgValue = fm.background as string | undefined;
	const theme = getTheme(deckConfig.theme as string | undefined);

	const bg = resolveBackground(bgValue, theme);
	const content = extractContent(parsedSlide.hast, theme);

	let elements: SlideElement[];

	switch (layout) {
		case "cover":
			elements = layoutCover(content, theme);
			break;
		case "section":
			elements = layoutSection(content, theme);
			break;
		case "two-column":
			elements = layoutTwoColumn(content, theme);
			break;
		case "image-full":
			elements = layoutImageFull(content, theme, bgValue);
			break;
		case "image-left":
			elements = layoutImageSide(content, theme, "left");
			break;
		case "image-right":
			elements = layoutImageSide(content, theme, "right");
			break;
		case "code": {
			elements = layoutCode(content, theme);
			// Override background for code layout
			const needsDarkBg = theme.bg === "FFFFFF" || theme.bg === "FAFAFA";
			if (needsDarkBg) {
				return {
					background: "1E1E1E",
					backgroundPath: bg.path,
					elements,
				};
			}
			break;
		}
		case "quote":
			elements = layoutQuote(content, theme);
			break;
		case "statement":
			elements = layoutStatement(content, theme);
			break;
		default:
			elements = layoutDefault(content, theme);
	}

	return {
		background: bg.color,
		backgroundPath: bg.path,
		elements,
	};
}
