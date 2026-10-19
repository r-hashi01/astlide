/**
 * DrawingML colors → CSS: srgbClr / schemeClr (through the theme and the
 * color map) / sysClr / prstClr, with the common modifiers (lumMod, lumOff,
 * tint, shade, alpha).
 *
 * @module
 */

import { type Element, kids, num } from "./xml";

/** Theme colors by scheme name (dk1, lt1, accent1 … hlink), `rrggbb`. */
export type ThemeColors = Record<string, string>;

/** Slide-level names (bg1, tx1 …) → theme names (lt1, dk1 …). */
export type ColorMap = Record<string, string>;

export const DEFAULT_COLOR_MAP: ColorMap = {
	bg1: "lt1",
	tx1: "dk1",
	bg2: "lt2",
	tx2: "dk2",
	accent1: "accent1",
	accent2: "accent2",
	accent3: "accent3",
	accent4: "accent4",
	accent5: "accent5",
	accent6: "accent6",
	hlink: "hlink",
	folHlink: "folHlink",
};

const PRESET: Record<string, string> = {
	black: "000000",
	white: "ffffff",
	red: "ff0000",
	green: "008000",
	blue: "0000ff",
	yellow: "ffff00",
	gray: "808080",
	grey: "808080",
	orange: "ffa500",
	purple: "800080",
};

export interface ColorContext {
	theme: ThemeColors;
	map: ColorMap;
	/** What `phClr` (a style's placeholder color) stands for. */
	placeholder?: string;
}

type Rgb = [number, number, number];

const toRgb = (hex: string): Rgb =>
	[0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as Rgb;

function toHsl([r, g, b]: Rgb): Rgb {
	const [R, G, B] = [r / 255, g / 255, b / 255];
	const max = Math.max(R, G, B);
	const min = Math.min(R, G, B);
	const l = (max + min) / 2;
	if (max === min) return [0, 0, l];
	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	const h =
		max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
	return [h / 6, s, l];
}

function fromHsl([h, s, l]: Rgb): Rgb {
	if (s === 0) return [l * 255, l * 255, l * 255];
	const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
	const p = 2 * l - q;
	const f = (t: number) => {
		const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
		if (u < 1 / 6) return p + (q - p) * 6 * u;
		if (u < 1 / 2) return q;
		if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
		return p;
	};
	return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

/** The color of a color element (a:srgbClr, a:schemeClr …) as `{ hex, alpha }`. */
export function colorOf(
	el: Element | undefined,
	ctx: ColorContext,
): { hex: string; alpha: number } | null {
	if (!el) return null;
	let hex: string | undefined;
	switch (el.name) {
		case "a:srgbClr":
			hex = el.attribs.val;
			break;
		case "a:sysClr":
			hex = el.attribs.lastClr ?? (el.attribs.val === "window" ? "ffffff" : "000000");
			break;
		case "a:prstClr":
			hex = PRESET[el.attribs.val ?? ""];
			break;
		case "a:schemeClr": {
			const name = el.attribs.val ?? "";
			if (name === "phClr") hex = ctx.placeholder;
			else hex = ctx.theme[ctx.map[name] ?? name] ?? ctx.theme[name];
			break;
		}
		case "a:scrgbClr":
			hex = [num(el, "r"), num(el, "g"), num(el, "b")]
				.map((v) =>
					Math.round((v / 100000) * 255)
						.toString(16)
						.padStart(2, "0"),
				)
				.join("");
			break;
		default:
			return null;
	}
	if (!hex) return null;
	let rgb = toRgb(hex.toLowerCase());
	let alpha = 1;
	for (const m of kids(el)) {
		const v = num(m, "val") / 100000;
		switch (m.name) {
			case "a:alpha":
				alpha = v;
				break;
			case "a:lumMod": {
				const [h, s, l] = toHsl(rgb);
				rgb = fromHsl([h, s, Math.min(1, l * v)]);
				break;
			}
			case "a:lumOff": {
				const [h, s, l] = toHsl(rgb);
				rgb = fromHsl([h, s, Math.max(0, Math.min(1, l + v))]);
				break;
			}
			case "a:tint":
				rgb = rgb.map((c) => c + (255 - c) * (1 - v)) as Rgb;
				break;
			case "a:shade":
				rgb = rgb.map((c) => c * v) as Rgb;
				break;
		}
	}
	return {
		hex: rgb
			.map((c) =>
				Math.round(Math.max(0, Math.min(255, c)))
					.toString(16)
					.padStart(2, "0"),
			)
			.join(""),
		alpha,
	};
}

/** CSS for a color element, or null. */
export function cssColor(el: Element | undefined, ctx: ColorContext): string | null {
	const c = colorOf(el, ctx);
	if (!c) return null;
	if (c.alpha >= 0.999) return `#${c.hex}`;
	const [r, g, b] = toRgb(c.hex);
	return `rgba(${r}, ${g}, ${b}, ${Math.round(c.alpha * 1000) / 1000})`;
}

/** The color element inside a fill / line (`a:solidFill > a:srgbClr` …). */
export function colorChild(el: Element | undefined): Element | undefined {
	return kids(el).find((c) => /^a:(srgbClr|schemeClr|sysClr|prstClr|scrgbClr)$/.test(c.name));
}
