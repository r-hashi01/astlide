/**
 * The CSS cascade without a browser: collect style sheets, match selectors,
 * order declarations by origin / importance / specificity / position, expand
 * shorthands, and compute values (inheritance, custom properties, units).
 *
 * Scope: what static slides need. Dynamic pseudo-classes (:hover …) never
 * match; pseudo-elements are collected separately (see `pseudoRules`).
 */

import { compile } from "css-select";
import { parse as parseSelector, type Selector } from "css-what";
import type { Element } from "domhandler";
import postcss, { type AtRule, type ChildNode, type Rule } from "postcss";

export interface Viewport {
	width: number;
	height: number;
	media: "screen" | "print";
}

interface Declaration {
	prop: string;
	value: string;
	important: boolean;
}

interface StyleRule {
	match: (el: Element) => boolean;
	specificity: number;
	order: number;
	origin: 0 | 1; // 0 = user agent, 1 = author
	declarations: Declaration[];
	pseudo: string | null;
}

/** Minimal UA style sheet for the HTML that slides use. */
export const UA_CSS = `
html,address,blockquote,body,dd,div,dl,dt,fieldset,figure,footer,form,h1,h2,h3,h4,h5,h6,header,hr,main,nav,ol,p,pre,section,ul,article,aside,figcaption,table,details,summary{display:block}
li{display:list-item}
head,script,style,title,meta,link,template,[hidden]{display:none}
body{margin:8px}
h1{font-size:2em;margin-top:.67em;margin-bottom:.67em;font-weight:bold}
h2{font-size:1.5em;margin-top:.83em;margin-bottom:.83em;font-weight:bold}
h3{font-size:1.17em;margin-top:1em;margin-bottom:1em;font-weight:bold}
h4{margin-top:1.33em;margin-bottom:1.33em;font-weight:bold}
p,blockquote,ul,ol,dl,figure,pre{margin-top:1em;margin-bottom:1em}
blockquote,figure{margin-left:40px;margin-right:40px}
ul,ol{padding-left:40px}
strong,b,th{font-weight:bold}
em,i,cite{font-style:italic}
code,kbd,pre,samp{font-family:monospace}
pre{white-space:pre}
`;

/** Properties inherited by default (the subset we compute). */
const INHERITED = new Set([
	"color",
	"font-family",
	"font-size",
	"font-weight",
	"font-style",
	"line-height",
	"letter-spacing",
	"text-align",
	"white-space",
	"visibility",
	"list-style-type",
	"text-transform",
]);

const INITIAL: Record<string, string> = {
	display: "inline",
	position: "static",
	color: "#000",
	"font-family": "serif",
	"font-size": "16px",
	"font-weight": "400",
	"font-style": "normal",
	"line-height": "normal",
	"letter-spacing": "normal",
	"text-align": "start",
	"white-space": "normal",
	visibility: "visible",
	opacity: "1",
	"box-sizing": "content-box",
	"flex-direction": "row",
	"flex-wrap": "nowrap",
	"flex-grow": "0",
	"flex-shrink": "1",
	"flex-basis": "auto",
	"justify-content": "flex-start",
	"align-items": "stretch",
	"align-self": "auto",
	"align-content": "normal",
	"row-gap": "normal",
	"column-gap": "normal",
	width: "auto",
	height: "auto",
	"min-width": "auto",
	"min-height": "auto",
	"max-width": "none",
	"max-height": "none",
	"background-color": "transparent",
	"grid-template-columns": "none",
	"list-style-type": "disc",
	"text-transform": "none",
};
for (const side of ["top", "right", "bottom", "left"]) {
	INITIAL[`margin-${side}`] = "0";
	INITIAL[`padding-${side}`] = "0";
	INITIAL[`border-${side}-width`] = "0";
	INITIAL[side] = "auto";
}

// ── Specificity ──────────────────────────────────────────────────────────

function specificityOf(selector: Selector[]): number {
	let a = 0;
	let b = 0;
	let c = 0;
	for (const t of selector) {
		if (t.type === "attribute") {
			if (t.name === "id" && t.action === "equals") a++;
			else b++;
		} else if (t.type === "tag") c++;
		else if (t.type === "pseudo-element") c++;
		else if (t.type === "pseudo") {
			if (t.name === "where") continue;
			if (Array.isArray(t.data) && ["is", "not", "has", "matches"].includes(t.name)) {
				const best = Math.max(0, ...t.data.map(specificityOf));
				a += Math.floor(best / 1e6);
				b += Math.floor((best % 1e6) / 1e3);
				c += best % 1e3;
			} else b++;
		}
	}
	return a * 1e6 + b * 1e3 + c;
}

const NEVER = new Set([
	"hover",
	"active",
	"focus",
	"focus-visible",
	"focus-within",
	"visited",
	"target",
]);

function hasDynamicPseudo(selector: Selector[]): boolean {
	return selector.some(
		(t) =>
			(t.type === "pseudo" && NEVER.has(t.name)) ||
			(t.type === "pseudo" && Array.isArray(t.data) && t.data.some(hasDynamicPseudo)),
	);
}

// ── Media queries (the subset slides use) ────────────────────────────────

function mediaMatches(query: string, vp: Viewport): boolean {
	return query.split(",").some((q) => {
		const s = q.trim().toLowerCase();
		if (s === "" || s === "all") return true;
		if (/^not\s/.test(s)) return !mediaMatches(s.slice(4), vp);
		if (/\bprint\b/.test(s) && vp.media !== "print") return false;
		if (/\bscreen\b/.test(s) && vp.media !== "screen") return false;
		if (
			/prefers-reduced-motion:\s*reduce|prefers-color-scheme:\s*dark|hover:\s*none|pointer:\s*coarse/.test(
				s,
			)
		)
			return false;
		for (const [, kind, val] of s.matchAll(/(min|max)-width:\s*([\d.]+)px/g)) {
			const n = Number(val);
			if (kind === "min" && vp.width < n) return false;
			if (kind === "max" && vp.width > n) return false;
		}
		for (const [, kind, val] of s.matchAll(/(min|max)-height:\s*([\d.]+)px/g)) {
			const n = Number(val);
			if (kind === "min" && vp.height < n) return false;
			if (kind === "max" && vp.height > n) return false;
		}
		return true;
	});
}

// ── Shorthands ───────────────────────────────────────────────────────────

/** Split on top-level whitespace (not inside parentheses). */
function tokens(value: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let cur = "";
	for (const ch of value.trim()) {
		if (ch === "(") depth++;
		if (ch === ")") depth--;
		if (/\s/.test(ch) && depth === 0) {
			if (cur) out.push(cur);
			cur = "";
		} else cur += ch;
	}
	if (cur) out.push(cur);
	return out;
}

function boxSides(prefix: string, suffix: string, value: string): Declaration[] {
	const v = tokens(value);
	const [t, r = t, b = t, l = r] = v;
	return [
		["top", t],
		["right", r],
		["bottom", b],
		["left", l],
	].map(([side, val]) => ({
		prop: `${prefix}-${side}${suffix}`,
		value: val ?? "0",
		important: false,
	}));
}

const COLOR_RE = /^(#|rgb|hsl|oklch|oklab|lab|lch|color\(|transparent|currentcolor|var\(|[a-z]+$)/i;
const BORDER_STYLES = new Set([
	"none",
	"hidden",
	"solid",
	"dashed",
	"dotted",
	"double",
	"groove",
	"ridge",
	"inset",
	"outset",
]);

function expand(prop: string, value: string): Declaration[] {
	const d = (p: string, v: string): Declaration => ({ prop: p, value: v, important: false });
	switch (prop) {
		case "margin":
		case "padding":
			return boxSides(prop, "", value);
		case "inset":
			return boxSides("", "", value).map((x) => ({ ...x, prop: x.prop.slice(1) }));
		case "border-width":
			return boxSides("border", "-width", value);
		case "border":
		case "border-top":
		case "border-right":
		case "border-bottom":
		case "border-left": {
			const sides = prop === "border" ? ["top", "right", "bottom", "left"] : [prop.slice(7)];
			let width = "medium";
			let color = "currentcolor";
			let style = "none";
			for (const t of tokens(value)) {
				if (BORDER_STYLES.has(t)) style = t;
				else if (/^[\d.]/.test(t) || /^(thin|medium|thick)$/.test(t)) width = t;
				else color = t;
			}
			return sides.flatMap((s) => [
				d(`border-${s}-width`, style === "none" || style === "hidden" ? "0" : width),
				d(`border-${s}-color`, color),
			]);
		}
		case "gap": {
			const [r, c = r] = tokens(value);
			return [d("row-gap", r ?? "normal"), d("column-gap", c ?? "normal")];
		}
		case "flex": {
			const t = tokens(value);
			if (value.trim() === "none")
				return [d("flex-grow", "0"), d("flex-shrink", "0"), d("flex-basis", "auto")];
			if (value.trim() === "auto")
				return [d("flex-grow", "1"), d("flex-shrink", "1"), d("flex-basis", "auto")];
			const nums = t.filter((x) => /^[\d.]+$/.test(x));
			const basis = t.find((x) => !/^[\d.]+$/.test(x)) ?? (nums.length ? "0%" : "auto");
			return [
				d("flex-grow", nums[0] ?? "1"),
				d("flex-shrink", nums[1] ?? "1"),
				d("flex-basis", basis),
			];
		}
		case "flex-flow": {
			// Omitted longhands reset to their initial values (minifiers rely on it).
			let direction = "row";
			let wrap = "nowrap";
			for (const t of tokens(value)) {
				if (/wrap/.test(t)) wrap = t;
				else direction = t;
			}
			return [d("flex-direction", direction), d("flex-wrap", wrap)];
		}
		case "background": {
			// Only the color layer matters for layout / fills here.
			const color = tokens(value).find(
				(t) => COLOR_RE.test(t) && !/^(none|no-repeat|repeat|center|cover|contain|url\()/.test(t),
			);
			return [
				d("background-color", color ?? "transparent"),
				d("background-image", /gradient|url\(/.test(value) ? value : "none"),
			];
		}
		case "list-style": {
			const type = tokens(value).find((t) => /^(none|disc|circle|square|decimal)$/.test(t));
			return type ? [d("list-style-type", type)] : [];
		}
		case "place-items": {
			const [a, j = a] = tokens(value);
			return [d("align-items", a ?? "normal"), d("justify-items", j ?? "normal")];
		}
		default:
			return [d(prop, value)];
	}
}

// ── Style sheets ─────────────────────────────────────────────────────────

export class StyleSheets {
	private rules: StyleRule[] = [];
	private order = 0;

	constructor(private readonly vp: Viewport) {}

	add(css: string, origin: 0 | 1 = 1): void {
		const root = postcss.parse(css);
		this.walk(root.nodes, origin);
	}

	private walk(nodes: ChildNode[], origin: 0 | 1): void {
		for (const node of nodes) {
			if (node.type === "rule") this.addRule(node as Rule, origin);
			else if (node.type === "atrule") {
				const at = node as AtRule;
				if (at.name === "media" && !mediaMatches(at.params, this.vp)) continue;
				if (["media", "supports", "layer", "container"].includes(at.name) && at.nodes)
					this.walk(at.nodes, origin);
			}
		}
	}

	private addRule(rule: Rule, origin: 0 | 1): void {
		const declarations: Declaration[] = [];
		rule.walkDecls((decl) => {
			const prop = decl.prop.toLowerCase();
			const value = decl.value;
			for (const x of prop.startsWith("--")
				? [{ prop: decl.prop, value, important: false }]
				: expand(prop, value)) {
				declarations.push({ ...x, important: decl.important });
			}
		});
		const order = this.order++;
		for (const text of rule.selectors) {
			let parsed: Selector[][];
			try {
				parsed = parseSelector(text);
			} catch {
				continue;
			}
			for (const sel of parsed) {
				if (hasDynamicPseudo(sel)) continue;
				const pseudoEl = sel.find((t) => t.type === "pseudo-element");
				const base = sel.filter((t) => t.type !== "pseudo-element");
				let match: (el: Element) => boolean;
				try {
					match = compile(
						[base.length ? base : [{ type: "universal", namespace: null }]] as Selector[][],
						{
							xmlMode: false,
						},
					) as unknown as (el: Element) => boolean;
				} catch {
					continue;
				}
				this.rules.push({
					match,
					specificity: specificityOf(sel),
					order,
					origin,
					declarations,
					pseudo: pseudoEl && pseudoEl.type === "pseudo-element" ? pseudoEl.name : null,
				});
			}
		}
	}

	/** Declared values for an element (or one of its pseudo-elements), in cascade order. */
	declared(el: Element, pseudo: string | null = null): Map<string, string> {
		const hits = this.rules.filter((r) => r.pseudo === pseudo && r.match(el));
		const inline = pseudo ? [] : parseInline(el.attribs.style ?? "");
		type Entry = { d: Declaration; weight: number[] };
		const entries: Entry[] = [];
		for (const r of hits) {
			for (const d of r.declarations) {
				// [important, origin (UA important wins), inline, specificity, order]
				const imp = d.important ? 1 : 0;
				const originRank = d.important ? 1 - r.origin : r.origin;
				entries.push({ d, weight: [imp, originRank, 0, r.specificity, r.order] });
			}
		}
		for (const d of inline) entries.push({ d, weight: [d.important ? 1 : 0, 1, 1, 0, 0] });
		entries.sort((x, y) => {
			for (let i = 0; i < x.weight.length; i++) {
				const diff = (x.weight[i] ?? 0) - (y.weight[i] ?? 0);
				if (diff) return diff;
			}
			return 0;
		});
		const out = new Map<string, string>();
		for (const { d } of entries) out.set(d.prop, d.value);
		return out;
	}
}

function parseInline(style: string): Declaration[] {
	const out: Declaration[] = [];
	for (const part of style.split(";")) {
		const i = part.indexOf(":");
		if (i < 0) continue;
		const prop = part.slice(0, i).trim().toLowerCase();
		let value = part.slice(i + 1).trim();
		const important = /!important$/i.test(value);
		value = value.replace(/!important$/i, "").trim();
		if (!prop || !value) continue;
		for (const x of prop.startsWith("--")
			? [{ prop, value, important: false }]
			: expand(prop, value)) {
			out.push({ ...x, important });
		}
	}
	return out;
}

// ── Computed values ──────────────────────────────────────────────────────

export type Computed = Map<string, string>;

/** Replace var(--x, fallback) using the element's custom properties. */
export function resolveVars(value: string, custom: Map<string, string>, depth = 0): string {
	if (depth > 20 || !value.includes("var(")) return value;
	let out = "";
	let i = 0;
	while (i < value.length) {
		const at = value.indexOf("var(", i);
		if (at < 0) {
			out += value.slice(i);
			break;
		}
		out += value.slice(i, at);
		let depthP = 0;
		let j = at + 4;
		for (; j < value.length; j++) {
			if (value[j] === "(") depthP++;
			else if (value[j] === ")") {
				if (depthP === 0) break;
				depthP--;
			}
		}
		const inner = value.slice(at + 4, j);
		const comma = inner.indexOf(",");
		const name = (comma < 0 ? inner : inner.slice(0, comma)).trim();
		const fallback = comma < 0 ? "" : inner.slice(comma + 1).trim();
		const v = custom.get(name);
		out += resolveVars(v !== undefined ? v : fallback, custom, depth + 1);
		i = j + 1;
	}
	return out;
}

export interface Context {
	parent: Computed | null;
	rootFontSize: number;
	vp: Viewport;
}

/** Length in px; `basis` is what % / em refer to. Returns NaN for keywords (auto…). */
export function toPx(
	value: string,
	fontSize: number,
	rootFontSize: number,
	vp: Viewport,
	basis = Number.NaN,
): number {
	const v = value.trim();
	if (v === "0") return 0;
	const m = v.match(/^(-?[\d.]+)(px|em|rem|%|vw|vh|pt)?$/);
	if (!m) {
		const calc = v.match(/^calc\((.+)\)$/);
		if (calc) return evalCalc(calc[1] ?? "", fontSize, rootFontSize, vp, basis);
		return Number.NaN;
	}
	const n = Number(m[1]);
	switch (m[2]) {
		case "em":
			return n * fontSize;
		case "rem":
			return n * rootFontSize;
		case "%":
			return (n / 100) * basis;
		case "vw":
			return (n / 100) * vp.width;
		case "vh":
			return (n / 100) * vp.height;
		case "pt":
			return (n * 96) / 72;
		default:
			return n;
	}
}

function evalCalc(expr: string, fs: number, rfs: number, vp: Viewport, basis: number): number {
	// a ± b chains of lengths (enough for theme math)
	const parts = expr.split(/\s+([+-])\s+/);
	let acc = toPx(parts[0] ?? "", fs, rfs, vp, basis);
	for (let i = 1; i < parts.length; i += 2) {
		const n = toPx(parts[i + 1] ?? "", fs, rfs, vp, basis);
		acc = parts[i] === "+" ? acc + n : acc - n;
	}
	return acc;
}

const FONT_WEIGHTS: Record<string, string> = {
	normal: "400",
	bold: "700",
	lighter: "300",
	bolder: "700",
};
const FONT_SIZES: Record<string, number> = {
	small: 13,
	medium: 16,
	large: 18,
	"x-large": 24,
	"xx-large": 32,
	smaller: 0.83,
	larger: 1.2,
};

/**
 * Computed style of an element: cascade → inheritance → var() → absolute
 * font-size; other lengths stay as specified strings (resolved at layout).
 */
export function computeStyle(declared: Map<string, string>, ctx: Context): Computed {
	const parent = ctx.parent;
	const out: Computed = new Map();
	// Custom properties inherit wholesale.
	const custom = new Map<string, string>();
	if (parent) for (const [k, v] of parent) if (k.startsWith("--")) custom.set(k, v);
	for (const [k, v] of declared) if (k.startsWith("--")) custom.set(k, v);
	for (const [k, v] of custom) custom.set(k, resolveVars(v, custom));
	for (const [k, v] of custom) out.set(k, v);

	const value = (prop: string): string => {
		let v = declared.get(prop);
		if (v !== undefined) v = resolveVars(v, custom).trim();
		if (v === undefined || v === "" || v === "inherit" || (v === "unset" && INHERITED.has(prop))) {
			if (v === undefined && !INHERITED.has(prop)) return INITIAL[prop] ?? "";
			return parent?.get(prop) ?? INITIAL[prop] ?? "";
		}
		if (v === "initial" || v === "unset") return INITIAL[prop] ?? "";
		return v;
	};

	const parentFs = Number.parseFloat(parent?.get("font-size") ?? "16");
	let fsRaw = value("font-size");
	let fs: number;
	if (fsRaw in FONT_SIZES) {
		const k = FONT_SIZES[fsRaw] ?? 16;
		fs = fsRaw === "smaller" || fsRaw === "larger" ? parentFs * k : k;
	} else {
		fs = toPx(fsRaw, parentFs, ctx.rootFontSize, ctx.vp, parentFs);
		if (Number.isNaN(fs)) fs = parentFs;
	}
	fsRaw = `${fs}px`;
	out.set("font-size", fsRaw);

	const props = new Set<string>([
		...Object.keys(INITIAL),
		...[...declared.keys()].filter((k) => !k.startsWith("--")),
	]);
	for (const prop of props) {
		if (prop === "font-size") continue;
		let v = value(prop);
		if (prop === "font-weight") v = FONT_WEIGHTS[v] ?? v;
		if (prop === "line-height" && /(em|rem|%)$/.test(v))
			v = `${toPx(v, fs, ctx.rootFontSize, ctx.vp, fs)}px`;
		if (prop === "letter-spacing" && v !== "normal")
			v = `${toPx(v, fs, ctx.rootFontSize, ctx.vp, fs)}px`;
		if (prop === "color" && v.toLowerCase() === "currentcolor") v = parent?.get("color") ?? "#000";
		out.set(prop, v);
	}
	return out;
}
