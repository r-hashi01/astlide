/**
 * PPTX template → Astlide theme: a PowerPoint (or Google Slides) template's
 * look — theme colors and fonts, each slide layout's background and artwork,
 * and where its title / body / slide-number placeholders sit and how their
 * text is styled — so Markdown slides come out in the template's design.
 *
 * @module
 */

import { cssColor } from "./color";
import {
	artwork,
	canvasOpen,
	contextFor,
	levelStyle,
	openPresentation,
	type Placeholder,
	type PptxImportOptions,
	type Presentation,
	placeholderOf,
	r2,
	resolveFont,
	type SlideContext,
	STYLE,
	safeFontName,
	schemeEl,
	sources,
	spTree,
	titleTypes,
	xfrmOf,
} from "./import";
import { slugify } from "./slug";
import { type Element, kid, kids, path } from "./xml";

/** A placeholder's box on the canvas (px) and the CSS for its text. */
export interface TemplateRegion {
	left: number;
	top: number;
	width: number;
	height: number;
	/** Text style: font, size, color, weight, alignment, insets, vertical anchoring. */
	css: string;
}

export interface TemplateLayout {
	/** The layout's name in PowerPoint ("Title and Content"). */
	name: string;
	/** Its Astlide name — use it as `slideLayout` ("title-and-content"). */
	id: string;
	/** OOXML layout type ("title", "obj", "secHead", "twoObj" …), if set. */
	type?: string;
	/** Background and master / layout artwork, as HTML on the canvas. */
	art: string;
	title?: TemplateRegion;
	/** Content placeholders (subtitle, body, object), in reading order. */
	body: TemplateRegion[];
	slideNumber?: TemplateRegion;
}

export interface PptxTemplate {
	/** Slide size in EMU. */
	width: number;
	height: number;
	/** Theme colors (`rrggbb` by scheme name) and heading / body fonts. */
	colors: Record<string, string>;
	fonts: { heading?: string; body?: string };
	/** The layouts, in the template's order. */
	layouts: TemplateLayout[];
	/** The master's background and artwork, for slides whose layout the template doesn't have. */
	master: string;
	/**
	 * Built-in Astlide layouts → the template layout drawn for them
	 * (`cover` → the title slide layout, `section` → section header,
	 * `default` → title and content, `two-column` → two content,
	 * `code` → title only). They take precedence over a template layout
	 * that happens to have a built-in layout's name.
	 */
	aliases: Record<string, string>;
	/** Embedded fonts as `@font-face` rules (only with a `media` callback). */
	fontCss: string;
}

/**
 * Astlide layouts and the PowerPoint layouts that stand for them, best first:
 * by layout type, else by name (Google Slides and generators often leave
 * layouts untyped, but name them "Title slide", "Section header" …).
 */
const ALIASES: Record<string, { types: string[]; name: RegExp }> = {
	cover: { types: ["title"], name: /^(title( slide)?|cover)$/i },
	section: { types: ["secHead"], name: /section/i },
	default: { types: ["obj", "tx"], name: /^title,? and (body|content|text)$/i },
	"two-column": {
		types: ["twoObj", "twoTxTwoObj", "twoColTx"],
		name: /two (columns?|content)/i,
	},
	code: { types: ["titleOnly"], name: /^title only$/i },
};

/** Placeholders that hold slide content (not date / footer / number / pictures). */
const CONTENT = new Set(["body", "obj", "subTitle"]);

/** Most masters and layouts read from a template. */
export const MAX_MASTERS = 64;
export const MAX_LAYOUTS = 256;

/** The distinct, present values, in order. */
const unique = (parts: (string | undefined)[]): string[] => [
	...new Set(parts.filter((p): p is string => !!p)),
];

/** Read a template's design. Pictures go through `media`, as in {@link pptxToSlides}. */
export function pptxToTemplate(data: Uint8Array, options: PptxImportOptions = {}): PptxTemplate {
	const p = openPresentation(data, options);
	const { pkg } = p;
	// Each master / layout part once, and at most MAX_MASTERS / MAX_LAYOUTS: a crafted
	// file can list one many times, and every layout's art is kept.
	const masters = unique(
		kids(kid(p.el, "p:sldMasterIdLst"), "p:sldMasterId").map(
			(m) => pkg.rels(p.part).get(m.attribs["r:id"] ?? "")?.target,
		),
	).slice(0, MAX_MASTERS);

	const layouts: TemplateLayout[] = [];
	const seenLayouts = new Set<string>();
	const ids = new Set<string>();
	/** Next suffix to try per slug, so repeated names don't rescan from 2. */
	const nextSuffix = new Map<string, number>();
	let master = "";
	let first: SlideContext | undefined;
	for (const masterPart of masters) {
		const masterEl = pkg.xml(masterPart);
		const layoutParts = unique(
			kids(kid(masterEl, "p:sldLayoutIdLst"), "p:sldLayoutId").map(
				(l) => pkg.rels(masterPart).get(l.attribs["r:id"] ?? "")?.target,
			),
		);
		for (const part of layoutParts) {
			if (seenLayouts.has(part)) continue;
			if (seenLayouts.size >= MAX_LAYOUTS) break;
			seenLayouts.add(part);
			const ctx = contextFor(p, part);
			if (!first) {
				first = ctx;
				// The master alone: its art without any layout's.
				master = canvas(p, { ...ctx, layout: undefined, layoutPart: undefined });
			}
			const name = path(ctx.layout, "p:cSld")?.attribs.name ?? ctx.layout?.attribs.type ?? "layout";
			const base = slugify(name, "layout");
			let id = base;
			if (ids.has(id)) {
				let n = nextSuffix.get(base) ?? 2;
				while (ids.has(`${base}-${n}`)) n++;
				id = `${base}-${n}`;
				nextSuffix.set(base, n + 1);
			}
			ids.add(id);
			layouts.push({
				name,
				id,
				type: ctx.layout?.attribs.type,
				art: canvas(p, ctx),
				...regions(p, ctx),
			});
		}
	}

	const aliases: Record<string, string> = {};
	for (const [astlide, { types, name }] of Object.entries(ALIASES)) {
		const hit =
			types.map((t) => layouts.find((l) => l.type === t)).find(Boolean) ??
			layouts.find((l) => name.test(l.name));
		if (hit) aliases[astlide] = hit.id;
	}
	// Otherwise the first layout with a title and one body is the default (and code).
	const fallback = layouts.find((l) => l.title && l.body.length === 1)?.id;
	if (fallback) {
		aliases.default ??= fallback;
		aliases.code ??= aliases.default;
	}

	return {
		width: p.width,
		height: p.height,
		colors: first?.colors.theme ?? {},
		fonts: { heading: first?.fonts.major, body: first?.fonts.minor },
		layouts,
		master,
		aliases,
		fontCss: p.fontCss,
	};
}

function canvas(p: Presentation, ctx: SlideContext): string {
	return `<div class="astlide-pptx">${canvasOpen(p, ctx)}${artwork(ctx)}\n</div></div>`;
}

/** Title, content and slide-number placeholders of a layout. */
function regions(
	p: Presentation,
	ctx: SlideContext,
): Pick<TemplateLayout, "title" | "body" | "slideNumber"> {
	let title: TemplateRegion | undefined;
	let number: TemplateRegion | undefined;
	const body: { region: TemplateRegion; x: number; y: number }[] = [];
	for (const shape of kids(spTree(ctx.layout))) {
		const ph = placeholderOf(shape);
		if (!ph) continue;
		const chain = sources(ph, ctx);
		const xf = [shape, ...chain.slice().reverse()]
			.map((s) => xfrmOf(path(s, "p:spPr", "a:xfrm")))
			.find(Boolean);
		if (!xf) continue;
		const region = regionOf(p, ctx, ph, chain, xf);
		if (titleTypes.has(ph.type)) title ??= region;
		else if (ph.type === "sldNum") number ??= region;
		else if (CONTENT.has(ph.type)) body.push({ region, x: xf.x, y: xf.y });
	}
	// Reading order: rows top to bottom, then left to right.
	body.sort((a, b) => (Math.abs(a.y - b.y) > 0.05 * p.height ? a.y - b.y : a.x - b.x));
	return { title, body: body.map((b) => b.region), slideNumber: number };
}

function regionOf(
	p: Presentation,
	ctx: SlideContext,
	ph: Placeholder,
	chain: Element[],
	xf: { x: number; y: number; w: number; h: number },
): TemplateRegion {
	const s = p.scale;
	const props = levelStyle(0, chain, ph, ctx, undefined);
	// Body properties: master → layout.
	const body: Record<string, string> = {};
	for (const c of chain) Object.assign(body, path(c, "p:txBody", "a:bodyPr")?.attribs ?? {});
	const ins = (k: string, d: number) => r2(Number(body[k] ?? d) * s);
	const ptPx = 12700 * s;
	const isTitle = titleTypes.has(ph.type);
	const face =
		resolveFont(props.font, ctx.fonts) ?? (isTitle ? ctx.fonts.major : ctx.fonts.minor) ?? "";
	const ea = isTitle ? ctx.fonts.majorEa : ctx.fonts.minorEa;
	const lineHeight =
		props.lnSpcPts !== undefined
			? `${r2((props.lnSpcPts / 100) * ptPx)}px`
			: String(r2(((props.lnSpcPct ?? 100000) / 100000) * 1.2));
	const css = [
		`font-size:${r2(((props.sz ?? 1800) / 100) * ptPx)}px`,
		`line-height:${lineHeight}`,
		face ? `font-family:${fontFamily(face, ea)}` : "",
		`font-weight:${props.b ? 700 : 400}`,
		props.i ? "font-style:italic" : "",
		`color:${cssColor(props.color, ctx.colors) ?? cssColor(schemeEl("tx1"), ctx.colors) ?? "inherit"}`,
		`text-align:${props.algn === "ctr" ? "center" : props.algn === "r" ? "right" : props.algn === "just" ? "justify" : "left"}`,
		`justify-content:${body.anchor === "ctr" ? "center" : body.anchor === "b" ? "flex-end" : "flex-start"}`,
		props.cap === "all" ? "text-transform:uppercase" : "",
		`padding:${ins("tIns", 45720)}px ${ins("rIns", 91440)}px ${ins("bIns", 45720)}px ${ins("lIns", 91440)}px`,
	].filter(Boolean);
	return {
		left: r2(p.offsetX + xf.x * s),
		top: r2(p.offsetY + xf.y * s),
		width: r2(xf.w * s),
		height: r2(xf.h * s),
		css: css.join(";"),
	};
}

/** A font-family list: the theme font, its East Asian font, then generic fallbacks. */
function fontFamily(face: string, ea?: string): string {
	// Names come from the template: only safe characters reach the CSS.
	const names = [face, ea && ea !== face ? ea : undefined]
		.map((f) => safeFontName(f))
		.filter((f): f is string => !!f)
		.map((f) => `"${f}"`);
	return [...names, "system-ui", "sans-serif"].join(", ");
}

/** Canvas size the regions are measured on. */
const CANVAS = { width: 1920, height: 1080 };

/**
 * The theme's CSS: color / font variables under `[data-theme="<theme>"]`,
 * and per template layout, where the slide's content goes — the first
 * heading into the title placeholder, the rest into the body placeholder(s).
 * Slides of a layout carry the classes `astlide-tpl astlide-tpl-<id>`.
 */
export function templateCss(template: PptxTemplate, theme: string): string {
	const t = `[data-theme="${theme.replace(/["\\]/g, "")}"]`;
	const c = template.colors;
	const color = (name: string, fallback: string) => (c[name] ? `#${c[name]}` : fallback);
	const fallback = template.layouts.find((l) => l.id === template.aliases.default);
	const bodySize = fallback?.body[0]?.css.match(/font-size:([\d.]+px)/)?.[1];
	const titleSize = fallback?.title?.css.match(/font-size:([\d.]+px)/)?.[1];
	const vars = [
		`--color-background:${color("lt1", "#ffffff")}`,
		`--color-foreground:${color("dk1", "#000000")}`,
		`--color-primary:${color("accent1", "#3b82f6")}`,
		`--color-secondary:${color("dk2", "#64748b")}`,
		`--color-accent:${color("accent2", "#f59e0b")}`,
		`--color-muted:${color("lt2", "#f1f5f9")}`,
		template.fonts.heading ? `--font-heading:${fontFamily(template.fonts.heading)}` : "",
		template.fonts.body ? `--font-body:${fontFamily(template.fonts.body)}` : "",
		bodySize ? `--font-size-base:${bodySize}` : "",
		titleSize ? `--font-size-h1:${titleSize}` : "",
		// Headings inside the body scale with the body text.
		"--font-size-h2:1.4em",
		"--font-size-h3:1.15em",
	].filter(Boolean);

	// The reset for the artwork markup (the same as imported slides carry).
	let css = STYLE.replace(/<\/?style>/g, "").trim();
	if (template.fontCss) css += `\n${template.fontCss}`;
	css += `\n${t}{${vars.join(";")}}`;
	css += `\n${t} .astlide-tpl-art{position:absolute;inset:0;z-index:0;pointer-events:none}`;
	css += `\n${t} .slide.astlide-tpl>.slide-content{position:relative;z-index:1}`;
	// Inline code on whatever the layout's background is: a tint of the text color.
	css += `\n${t} .slide.astlide-tpl :not(pre)>code{background:color-mix(in srgb,currentColor 12%,transparent);color:inherit}`;
	for (const l of template.layouts) {
		// Specific enough to beat the built-in layouts' rules (cover / section center their content).
		const s = `${t} .slide.astlide-tpl.astlide-tpl-${l.id}`;
		if (!l.title && !l.body.length) continue;
		css += `\n${s}{padding:0}`;
		// Content box: the body placeholder(s), else what's under the title.
		const box = l.body.length ? union(l.body) : below(l.title);
		const content = [
			"position:absolute",
			`left:${box.left}px`,
			`top:${box.top}px`,
			`width:${box.width}px`,
			`height:${box.height}px`,
			"align-items:stretch",
			// The body's text style, then its insets (instead of the layout's own centering).
			...(l.body[0] ? [l.body[0].css] : ["padding:0 0.5em"]),
		];
		if (l.body.length > 1) {
			// Side by side: the gap between the first two placeholders.
			const [a, b] = l.body as [TemplateRegion, TemplateRegion];
			const gap = Math.max(0, r2(b.left - (a.left + a.width)));
			content.push("flex-direction:row", "flex-wrap:nowrap", `gap:${gap}px`);
		}
		css += `\n${s}>.slide-content{${content.join(";")}}`;
		if (l.body.length > 1) css += `\n${s}>.slide-content>.column{flex:1;padding:0}`;
		if (l.title) {
			const r = l.title;
			css +=
				`\n${s}>.slide-content>:is(h1,h2):first-child{position:absolute;` +
				`left:${r2(r.left - box.left)}px;top:${r2(r.top - box.top)}px;width:${r.width}px;height:${r.height}px;` +
				`margin:0;display:flex;flex-direction:column;overflow:hidden;${r.css}}`;
		}
		if (l.slideNumber) {
			const r = l.slideNumber;
			css += `\n${s} .astlide-tpl-number{position:absolute;z-index:1;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;display:flex;flex-direction:column;${r.css}}`;
		}
	}
	return css;
}

function union(rs: TemplateRegion[]): TemplateRegion {
	const left = Math.min(...rs.map((r) => r.left));
	const top = Math.min(...rs.map((r) => r.top));
	const right = Math.max(...rs.map((r) => r.left + r.width));
	const bottom = Math.max(...rs.map((r) => r.top + r.height));
	return { left, top, width: r2(right - left), height: r2(bottom - top), css: "" };
}

/** Under the title, inset like it (a title-only layout's content area). */
function below(title: TemplateRegion | undefined): TemplateRegion {
	const left = title?.left ?? 64;
	const top = title ? r2(title.top + title.height) : 64;
	const width = title?.width ?? CANVAS.width - 128;
	return { left, top, width, height: r2(Math.max(0, CANVAS.height - top - 64)), css: "" };
}
