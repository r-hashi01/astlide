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
import {
	blockified,
	value as computedValue,
	initialValue,
	isAbsolute,
	isFloat,
	isInherited,
	PROPERTIES,
} from "./properties";

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
table{display:table}
thead{display:table-header-group}
tbody{display:table-row-group}
tfoot{display:table-footer-group}
colgroup{display:table-column-group}
col{display:table-column}
tr{display:table-row}
thead,tbody,tfoot,tr{vertical-align:middle}
td,th{display:table-cell;padding:1px;vertical-align:inherit}
th{text-align:center}
caption{display:table-caption;text-align:center}
button,input,select,textarea{display:inline-block;font-size:13.333px;font-family:system-ui,sans-serif}
button,select{padding:1px 6px;border:2px solid #767676;border-radius:3px;background-color:#efefef;color:#000;text-align:center}
input,textarea{padding:1px 2px;border:2px solid #767676;background-color:#fff;color:#000}
`;

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

const FONT_LONGHANDS = [
	"font-style",
	"font-weight",
	"font-size",
	"line-height",
	"font-family",
	"font-variant-numeric",
];

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
		case "border-style":
			return boxSides("border", "-style", value);
		case "border-radius": {
			// Each corner's horizontal radius (elliptical corners draw as circular).
			const [r1 = "0", r2 = r1, r3 = r1, r4 = r2] = tokens(value.split("/")[0] ?? "");
			return [
				d("border-top-left-radius", r1),
				d("border-top-right-radius", r2),
				d("border-bottom-right-radius", r3),
				d("border-bottom-left-radius", r4),
			];
		}
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
				d(`border-${s}-style`, style),
				d(`border-${s}-color`, color),
			]);
		}
		case "font": {
			// [style || variant || weight || stretch]? size[/line-height]? family (css-fonts-4 §2.8);
			// a system font keyword (caption, menu …) is left as is.
			const m = value
				.trim()
				.match(
					/^((?:(?:normal|italic|oblique|small-caps|bold|bolder|lighter|\d{3}|(?:ultra-|extra-|semi-)?(?:condensed|expanded))\s+)*)([\d.]+[a-z%]*|(?:xx?-|xxx-)?(?:small|large)|medium|larger|smaller)(?:\s*\/\s*(\S+))?\s+(\S.*)$/i,
				);
			// With var(): every longhand waits for the substitution (see declare).
			if (/var\(/i.test(value)) return FONT_LONGHANDS.map((p) => d(p, value));
			if (!m) return [d(prop, value)];
			let style = "normal";
			let weight = "normal";
			for (const t of (m[1] ?? "").trim().split(/\s+/)) {
				if (/^(italic|oblique)$/i.test(t)) style = t;
				else if (/^(bold|bolder|lighter|\d{3})$/i.test(t)) weight = t;
			}
			return [
				d("font-style", style),
				d("font-weight", weight),
				d("font-size", m[2] ?? "medium"),
				d("line-height", m[3] ?? "normal"),
				d("font-family", m[4] ?? ""),
				d("font-variant-numeric", "normal"),
			];
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
				: declare(prop, value)) {
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
		for (const x of declare(prop, value)) {
			out.push({ ...x, important });
		}
	}
	return out;
}

/** Marks a longhand whose shorthand has `var()`: expanded per element, after substitution. */
const PENDING = "\u0000";

/**
 * Expand a declaration into longhands. A shorthand with `var()` can't be
 * split yet (`padding: var(--p)` may be `2rem 4rem`): each longhand keeps
 * the shorthand and is resolved by {@link computeStyle}.
 */
function declare(prop: string, value: string): Declaration[] {
	if (prop.startsWith("--")) return [{ prop, value, important: false }];
	const longhands = expand(prop, value);
	if (!value.includes("var(") || longhands.every((d) => d.prop === prop)) return longhands;
	return longhands.map((d) => ({ ...d, value: `${PENDING}${prop}${PENDING}${value}` }));
}

/** A declared value as written, or undefined while it waits on var() substitution ({@link declare}). */
export function declaredValue(declared: Map<string, string>, prop: string): string | undefined {
	const v = declared.get(prop);
	return v?.startsWith(PENDING) ? undefined : v;
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
	const m = v.match(
		/^([+-]?[\d.]+(?:e[+-]?\d+)?)(px|em|rem|%|vw|vh|vmin|vmax|pt|pc|in|cm|mm|q|ch|ex)?$/i,
	);
	if (!m) {
		const calc = v.match(/^calc\((.+)\)$/);
		if (calc) return evalCalc(calc[1] ?? "", fontSize, rootFontSize, vp, basis);
		const fn = v.match(/^(min|max|clamp)\((.+)\)$/);
		if (fn) {
			// Arguments that can't be resolved here (a % without its basis) are left out.
			const args = splitArgs(fn[2] ?? "").map((a) => toPx(a, fontSize, rootFontSize, vp, basis));
			const known = args.filter((n) => !Number.isNaN(n));
			if (known.length === 0) return Number.NaN;
			if (fn[1] === "min") return Math.min(...known);
			if (fn[1] === "max") return Math.max(...known);
			const [lo = Number.NaN, val = Number.NaN, hi = Number.NaN] = args;
			if (Number.isNaN(val)) return Number.isNaN(hi) ? lo : hi;
			return Math.min(Number.isNaN(hi) ? val : hi, Math.max(Number.isNaN(lo) ? val : lo, val));
		}
		return Number.NaN;
	}
	const n = Number(m[1]);
	switch (m[2]?.toLowerCase()) {
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
		case "vmin":
			return (n / 100) * Math.min(vp.width, vp.height);
		case "vmax":
			return (n / 100) * Math.max(vp.width, vp.height);
		case "pt":
			return (n * 96) / 72;
		case "pc":
			return n * 16;
		case "in":
			return n * 96;
		case "cm":
			return (n * 96) / 2.54;
		case "mm":
			return (n * 96) / 25.4;
		case "q":
			return (n * 96) / 101.6;
		// Without the font's metrics: half an em, as browsers fall back to.
		case "ch":
		case "ex":
			return n * fontSize * 0.5;
		default:
			return n;
	}
}

/** Split function arguments on commas outside parentheses. */
function splitArgs(s: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < s.length; i++) {
		if (s[i] === "(") depth++;
		else if (s[i] === ")") depth--;
		else if (s[i] === "," && depth === 0) {
			out.push(s.slice(start, i).trim());
			start = i + 1;
		}
	}
	out.push(s.slice(start).trim());
	return out;
}

/** A calc() value: a number, or a length as px plus a percentage (resolved at the end). */
interface CalcValue {
	number: boolean;
	px: number;
	pct: number;
}

/**
 * A calc() expression (css-values-4 §10): `+ - * /`, parentheses, nested
 * calc() / min() / max() / clamp(), numbers and lengths. NaN when it
 * can't be resolved (a percentage without its basis, a length times a
 * length …).
 */
function evalCalc(expr: string, fs: number, rfs: number, vp: Viewport, basis: number): number {
	let i = 0;
	const fail: CalcValue = { number: false, px: Number.NaN, pct: 0 };
	const space = () => {
		while (i < expr.length && /\s/.test(expr[i] ?? "")) i++;
	};
	const group = (): string => {
		// expr[i] is just past "(": up to the matching ")".
		let depth = 1;
		const from = i;
		while (i < expr.length && depth > 0) {
			if (expr[i] === "(") depth++;
			else if (expr[i] === ")") depth--;
			i++;
		}
		return expr.slice(from, i - 1);
	};
	const term = (): CalcValue => {
		space();
		const rest = expr.slice(i);
		const fn = rest.match(/^(calc|min|max|clamp)?\(/i);
		if (fn) {
			i += fn[0].length;
			const inner = group();
			const name = (fn[1] ?? "calc").toLowerCase();
			if (name === "calc") return sub(inner);
			const px = toPx(`${name}(${inner})`, fs, rfs, vp, basis);
			return { number: false, px, pct: 0 };
		}
		const m = rest.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)([a-z%]*)/i);
		if (!m) return fail;
		i += m[0].length;
		if (!m[2]) return { number: true, px: Number(m[1]), pct: 0 };
		if (m[2] === "%") return { number: false, px: 0, pct: Number(m[1]) };
		return { number: false, px: toPx(m[0], fs, rfs, vp, basis), pct: 0 };
	};
	const product = (): CalcValue => {
		let a = term();
		for (;;) {
			space();
			const op = expr[i];
			if (op !== "*" && op !== "/") return a;
			i++;
			const b = term();
			if (op === "*") {
				if (a.number) a = { number: b.number, px: b.px * a.px, pct: b.pct * a.px };
				else if (b.number) a = { number: false, px: a.px * b.px, pct: a.pct * b.px };
				else return fail;
			} else {
				if (!b.number || b.px === 0) return fail;
				a = { number: a.number, px: a.px / b.px, pct: a.pct / b.px };
			}
		}
	};
	const sum = (): CalcValue => {
		let a = product();
		for (;;) {
			space();
			const op = expr[i];
			if (op !== "+" && op !== "-") return a;
			i++;
			const b = product();
			const sign = op === "+" ? 1 : -1;
			// A bare 0 adds to a length (lenient, like the old parser).
			if (a.number !== b.number && !(a.number && a.px === 0) && !(b.number && b.px === 0))
				return fail;
			a = {
				number: a.number && b.number,
				px: a.px + sign * b.px,
				pct: a.pct + sign * b.pct,
			};
		}
	};
	const sub = (text: string): CalcValue => {
		const saved = [expr, i] as const;
		expr = text;
		i = 0;
		const v = sum();
		space();
		const done = i >= expr.length;
		[expr, i] = saved;
		return done ? v : fail;
	};
	const v = sub(expr);
	if (v.pct === 0) return v.px;
	return Number.isNaN(basis) ? Number.NaN : v.px + (v.pct / 100) * basis;
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

/** A `zoom` value as a factor: a number or percentage; `normal` (and anything else) is 1. */
function zoomFactor(v: string): number {
	const t = v.trim();
	const pct = t.match(/^([\d.]+)%$/);
	const n = pct ? Number(pct[1]) / 100 : /^[\d.]+$/.test(t) ? Number(t) : 1;
	return n > 0 ? n : 1;
}

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
		if (v?.startsWith(PENDING)) {
			// A longhand of a shorthand with var(): substitute, then expand.
			const [, shorthand = "", raw = ""] = v.split(PENDING);
			const resolved = resolveVars(raw, custom).trim();
			v = expand(shorthand, resolved).find((d) => d.prop === prop)?.value;
		}
		if (v !== undefined) v = resolveVars(v, custom).trim();
		if (v === undefined || v === "" || v === "inherit" || (v === "unset" && isInherited(prop))) {
			if (v === undefined && !isInherited(prop)) return initialValue(prop);
			return parent?.get(prop) ?? initialValue(prop);
		}
		if (v === "initial" || v === "unset") return initialValue(prop);
		return v;
	};

	const parentFs = Number.parseFloat(parent?.get("font-size") ?? "16");
	// zoom (css-viewport): every length inside is multiplied by the product
	// of the zooms down the tree. Lengths are resolved unzoomed, then scaled;
	// inherited px values already carry the parent's zoom.
	const parentZoom = Number(parent?.get("__zoom") ?? 1) || 1;
	const ownZoom = zoomFactor(declared.has("zoom") ? value("zoom") : "");
	const zoom = parentZoom * ownZoom;
	if (zoom !== 1 || parent?.has("__zoom")) out.set("__zoom", String(zoom));
	const own = (prop: string) =>
		declared.has(prop) && !/^(inherit|unset)$/.test(declared.get(prop) ?? "");
	let fsRaw = value("font-size");
	let fs: number;
	if (!own("font-size")) fs = parentFs * ownZoom;
	else if (fsRaw in FONT_SIZES) {
		const k = FONT_SIZES[fsRaw] ?? 16;
		fs = fsRaw === "smaller" || fsRaw === "larger" ? parentFs * k * ownZoom : k * zoom;
	} else {
		const base = parentFs / parentZoom;
		fs = toPx(fsRaw, base, ctx.rootFontSize, ctx.vp, base) * zoom;
		if (Number.isNaN(fs)) fs = parentFs * ownZoom;
	}
	fsRaw = `${fs}px`;
	out.set("font-size", fsRaw);
	/** A length property in px: declared ones resolved unzoomed and scaled; inherited ones scaled by this element's zoom. */
	const zoomed = (prop: string, v: string) =>
		own(prop)
			? `${toPx(v, fs / zoom, ctx.rootFontSize, ctx.vp, fs / zoom) * zoom}px`
			: `${Number.parseFloat(v) * ownZoom}px`;

	const props = new Set<string>([
		...Object.keys(PROPERTIES),
		...[...declared.keys()].filter((k) => !k.startsWith("--")),
	]);
	for (const prop of props) {
		if (prop === "font-size") continue;
		let v = value(prop);
		if (prop === "font-weight") v = FONT_WEIGHTS[v] ?? v;
		if (prop === "line-height" && /(px|em|rem|%|vw|vh|pt)$/.test(v)) v = zoomed(prop, v);
		if (prop === "letter-spacing" && v !== "normal") v = zoomed(prop, v);
		// Corner radii in px here (rem / vw need the page; layout doesn't read them),
		// a percentage kept: it's of the box.
		if (/^border-[a-z]+-[a-z]+-radius$/.test(prop) && !v.includes("%")) {
			const r = zoomed(prop, (v.split(/\s+/)[0] ?? "0").trim());
			if (!Number.isNaN(Number.parseFloat(r))) v = r;
		}
		if (prop === "color" && v.toLowerCase() === "currentcolor") v = parent?.get("color") ?? "#000";
		out.set(prop, v);
	}
	// Absolutely positioned and floated boxes, and flex / grid items, are
	// block-level (CSS 2 §9.7, CSS Display 3 §2.7); an absolute box doesn't float.
	const parentDisplay = parent?.get("display") ?? "";
	const flexOrGridItem = /^(inline-)?(flex|grid)$/.test(parentDisplay);
	if (isAbsolute(out)) out.set("float", "none");
	if (isAbsolute(out) || isFloat(out) || flexOrGridItem)
		out.set("display", blockified(computedValue(out, "display")));
	// Border widths (CSS backgrounds-3 §3.3): 0 without a border style; a style
	// without a width is medium. Zoomed widths snap to whole pixels as in
	// Chromium (at least 1px), kept unzoomed like the other lengths.
	for (const side of ["top", "right", "bottom", "left"]) {
		const style = (out.get(`border-${side}-style`) ?? "none").trim();
		const width = out.get(`border-${side}-width`);
		if (style === "none" || style === "hidden") {
			if (width !== undefined) out.set(`border-${side}-width`, "0");
			continue;
		}
		const raw = (width ?? "medium").trim();
		const keyword = { thin: 1, medium: 3, thick: 5 }[raw];
		const unzoomed = keyword ?? toPx(raw, fs / zoom, ctx.rootFontSize, ctx.vp, Number.NaN);
		if (Number.isNaN(unzoomed)) continue;
		const used = unzoomed * zoom;
		const snapped = used <= 0 ? 0 : used < 1 ? 1 : zoom === 1 ? used : Math.floor(used);
		out.set(`border-${side}-width`, `${snapped / zoom}px`);
	}
	// currentColor elsewhere (border / background / outline / fill …) is this element's color.
	const color = out.get("color") ?? "#000";
	for (const [prop, v] of out)
		if (prop !== "color" && /currentcolor/i.test(v))
			out.set(prop, v.replace(/currentcolor/gi, color));
	return out;
}
