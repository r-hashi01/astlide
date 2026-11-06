/**
 * The CSS properties the engine computes: each one's initial value and
 * whether it's inherited (CSS Cascade 4 §7). Every computed style holds a
 * value for each of them, so layout code never supplies its own default.
 */

interface Property {
	initial: string;
	inherited?: true;
}

const SIDES = ["top", "right", "bottom", "left"] as const;
const CORNERS = ["top-left", "top-right", "bottom-right", "bottom-left"] as const;

const inherited = (initial: string): Property => ({ initial, inherited: true });
const own = (initial: string): Property => ({ initial });

export const PROPERTIES: Record<string, Property> = {
	// Display and positioning
	display: own("inline"),
	position: own("static"),
	float: own("none"),
	visibility: inherited("visible"),
	opacity: own("1"),
	transform: own("none"),
	"transform-origin": own("50% 50%"),
	overflow: own("visible"),
	"overflow-x": own("visible"),
	"overflow-y": own("visible"),
	...Object.fromEntries(SIDES.map((s) => [s, own("auto")])),

	// Box
	"box-sizing": own("content-box"),
	width: own("auto"),
	height: own("auto"),
	"min-width": own("auto"),
	"min-height": own("auto"),
	"max-width": own("none"),
	"max-height": own("none"),
	"aspect-ratio": own("auto"),
	...Object.fromEntries(
		SIDES.flatMap((s) => [
			[`margin-${s}`, own("0")],
			[`padding-${s}`, own("0")],
			// medium: 0 once the style is none (see computeStyle).
			[`border-${s}-width`, own("medium")],
			[`border-${s}-style`, own("none")],
			[`border-${s}-color`, own("currentcolor")],
		]),
	),
	...Object.fromEntries(CORNERS.map((c) => [`border-${c}-radius`, own("0")])),

	// Flex, grid and alignment
	"flex-direction": own("row"),
	"flex-wrap": own("nowrap"),
	"flex-grow": own("0"),
	"flex-shrink": own("1"),
	"flex-basis": own("auto"),
	"justify-content": own("normal"),
	"justify-items": own("normal"),
	"justify-self": own("auto"),
	"align-content": own("normal"),
	"align-items": own("normal"),
	"align-self": own("auto"),
	"row-gap": own("normal"),
	"column-gap": own("normal"),
	"grid-template-columns": own("none"),
	"grid-template-rows": own("none"),
	"grid-auto-flow": own("row"),
	"grid-auto-columns": own("auto"),
	"grid-auto-rows": own("auto"),
	"grid-column": own("auto"),
	"grid-row": own("auto"),

	// Tables
	"border-collapse": inherited("separate"),
	"vertical-align": own("baseline"),

	// Text
	color: inherited("#000"),
	"font-family": inherited("serif"),
	"font-size": inherited("16px"),
	"font-weight": inherited("400"),
	"font-style": inherited("normal"),
	"font-variant-numeric": inherited("normal"),
	"font-feature-settings": inherited("normal"),
	"line-height": inherited("normal"),
	"letter-spacing": inherited("normal"),
	"text-align": inherited("start"),
	"text-indent": inherited("0"),
	"text-transform": inherited("none"),
	"white-space": inherited("normal"),
	"word-break": inherited("normal"),
	"overflow-wrap": inherited("normal"),
	"word-wrap": inherited("normal"),
	"list-style-type": inherited("disc"),

	// Painting
	"background-color": own("transparent"),
	"background-image": own("none"),
	"background-position": own("0% 0%"),
	"background-size": own("auto"),
	"background-clip": own("border-box"),
	"object-fit": own("fill"),
	"object-position": own("50% 50%"),
};

/** Whether a property is inherited by default (unknown ones aren't). */
export function isInherited(prop: string): boolean {
	return PROPERTIES[prop]?.inherited === true;
}

/** A property's initial value ("" for one the engine doesn't know). */
export function initialValue(prop: string): string {
	return PROPERTIES[prop]?.initial ?? "";
}

// ── Reading computed values ──────────────────────────────────────────────

/** Properties whose values are keywords, and the keywords the engine knows. */
const KEYWORDS = {
	display: [
		"none",
		"contents",
		"inline",
		"block",
		"flow-root",
		"list-item",
		"inline-block",
		"flex",
		"inline-flex",
		"grid",
		"inline-grid",
		"table",
		"inline-table",
		"table-row-group",
		"table-header-group",
		"table-footer-group",
		"table-row",
		"table-cell",
		"table-column-group",
		"table-column",
		"table-caption",
	],
	position: ["static", "relative", "absolute", "fixed", "sticky"],
	float: ["none", "left", "right", "inline-start", "inline-end"],
	"box-sizing": ["content-box", "border-box"],
	"flex-direction": ["row", "row-reverse", "column", "column-reverse"],
	"flex-wrap": ["nowrap", "wrap", "wrap-reverse"],
	"white-space": ["normal", "nowrap", "pre", "pre-wrap", "pre-line", "break-spaces"],
	"word-break": ["normal", "break-all", "keep-all", "break-word"],
	"overflow-wrap": ["normal", "break-word", "anywhere"],
	"word-wrap": ["normal", "break-word", "anywhere"],
	"border-collapse": ["separate", "collapse"],
	visibility: ["visible", "hidden", "collapse"],
} as const;

type KeywordProperty = keyof typeof KEYWORDS;
export type Keyword<P extends KeywordProperty> = (typeof KEYWORDS)[P][number];

/** A computed style: property → computed value (see cascade.ts). */
type Style = ReadonlyMap<string, string>;

/** A property's computed value (its initial value when the style has none). */
export function value(style: Style, prop: string): string {
	return (style.get(prop) ?? initialValue(prop)).trim();
}

/** A keyword property's value; one the engine doesn't know reads as the initial value. */
export function keyword<P extends KeywordProperty>(style: Style, prop: P): Keyword<P> {
	const v = value(style, prop).toLowerCase();
	const known: readonly string[] = KEYWORDS[prop];
	return (known.includes(v) ? v : initialValue(prop)) as Keyword<P>;
}

/** Taken out of flow: absolutely positioned (CSS 2 §9.6). */
export function isAbsolute(style: Style): boolean {
	const p = keyword(style, "position");
	return p === "absolute" || p === "fixed";
}

/** A containing block for absolutely positioned descendants. */
export function isPositioned(style: Style): boolean {
	return keyword(style, "position") !== "static";
}

export function isFloat(style: Style): boolean {
	return keyword(style, "float") !== "none";
}

/** Its overflow is clipped (or scrolls) in an axis, or in either. */
export function clipsOverflow(style: Style, axis?: "x" | "y"): boolean {
	const clips = (v: string) => /^(hidden|clip|auto|scroll)\b/.test(v);
	const x = clips(value(style, "overflow-x")) || clips(value(style, "overflow"));
	const y = clips(value(style, "overflow-y")) || clips(value(style, "overflow"));
	return axis === "x" ? x : axis === "y" ? y : x || y;
}

/** Lines wrap (white-space isn't nowrap / pre). */
export function wraps(style: Style): boolean {
	const ws = keyword(style, "white-space");
	return ws !== "nowrap" && ws !== "pre";
}

/** The size property is `auto` (no width / height set). */
export function isAuto(style: Style, prop: string): boolean {
	return value(style, prop) === "auto";
}

/**
 * The block-level display an element gets when it's absolutely positioned,
 * floated or a flex / grid item (CSS Display 3 §2.7).
 */
export function blockified(display: string): string {
	switch (display) {
		case "inline":
		case "inline-block":
			return "block";
		case "inline-flex":
			return "flex";
		case "inline-grid":
			return "grid";
		case "inline-table":
			return "table";
		default:
			return display;
	}
}
