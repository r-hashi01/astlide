/**
 * CSS colours (CSS Color 4 / 5) as sRGB: named colours, hex, rgb(), hsl(),
 * hwb(), lab(), lch(), oklab(), oklch(), color(srgb …) and color-mix().
 * Colours outside sRGB are clipped to it, as PowerPoint can't show them.
 */

/** An sRGB colour: six hex digits and an alpha from 0 to 1. */
export interface Color {
	hex: string;
	alpha: number;
}

/** Channels: r, g, b in 0–1 (sRGB, gamma-encoded) and alpha. */
type Rgba = [number, number, number, number];

// biome-ignore format: a table
const NAMED: Record<string, string> = {
	aliceblue: "f0f8ff", antiquewhite: "faebd7", aqua: "00ffff", aquamarine: "7fffd4", azure: "f0ffff",
	beige: "f5f5dc", bisque: "ffe4c4", black: "000000", blanchedalmond: "ffebcd", blue: "0000ff",
	blueviolet: "8a2be2", brown: "a52a2a", burlywood: "deb887", cadetblue: "5f9ea0", chartreuse: "7fff00",
	chocolate: "d2691e", coral: "ff7f50", cornflowerblue: "6495ed", cornsilk: "fff8dc", crimson: "dc143c",
	cyan: "00ffff", darkblue: "00008b", darkcyan: "008b8b", darkgoldenrod: "b8860b", darkgray: "a9a9a9",
	darkgreen: "006400", darkgrey: "a9a9a9", darkkhaki: "bdb76b", darkmagenta: "8b008b",
	darkolivegreen: "556b2f", darkorange: "ff8c00", darkorchid: "9932cc", darkred: "8b0000",
	darksalmon: "e9967a", darkseagreen: "8fbc8f", darkslateblue: "483d8b", darkslategray: "2f4f4f",
	darkslategrey: "2f4f4f", darkturquoise: "00ced1", darkviolet: "9400d3", deeppink: "ff1493",
	deepskyblue: "00bfff", dimgray: "696969", dimgrey: "696969", dodgerblue: "1e90ff", firebrick: "b22222",
	floralwhite: "fffaf0", forestgreen: "228b22", fuchsia: "ff00ff", gainsboro: "dcdcdc",
	ghostwhite: "f8f8ff", gold: "ffd700", goldenrod: "daa520", gray: "808080", green: "008000",
	greenyellow: "adff2f", grey: "808080", honeydew: "f0fff0", hotpink: "ff69b4", indianred: "cd5c5c",
	indigo: "4b0082", ivory: "fffff0", khaki: "f0e68c", lavender: "e6e6fa", lavenderblush: "fff0f5",
	lawngreen: "7cfc00", lemonchiffon: "fffacd", lightblue: "add8e6", lightcoral: "f08080",
	lightcyan: "e0ffff", lightgoldenrodyellow: "fafad2", lightgray: "d3d3d3", lightgreen: "90ee90",
	lightgrey: "d3d3d3", lightpink: "ffb6c1", lightsalmon: "ffa07a", lightseagreen: "20b2aa",
	lightskyblue: "87cefa", lightslategray: "778899", lightslategrey: "778899", lightsteelblue: "b0c4de",
	lightyellow: "ffffe0", lime: "00ff00", limegreen: "32cd32", linen: "faf0e6", magenta: "ff00ff",
	maroon: "800000", mediumaquamarine: "66cdaa", mediumblue: "0000cd", mediumorchid: "ba55d3",
	mediumpurple: "9370db", mediumseagreen: "3cb371", mediumslateblue: "7b68ee",
	mediumspringgreen: "00fa9a", mediumturquoise: "48d1cc", mediumvioletred: "c71585",
	midnightblue: "191970", mintcream: "f5fffa", mistyrose: "ffe4e1", moccasin: "ffe4b5",
	navajowhite: "ffdead", navy: "000080", oldlace: "fdf5e6", olive: "808000", olivedrab: "6b8e23",
	orange: "ffa500", orangered: "ff4500", orchid: "da70d6", palegoldenrod: "eee8aa", palegreen: "98fb98",
	paleturquoise: "afeeee", palevioletred: "db7093", papayawhip: "ffefd5", peachpuff: "ffdab9",
	peru: "cd853f", pink: "ffc0cb", plum: "dda0dd", powderblue: "b0e0e6", purple: "800080",
	rebeccapurple: "663399", red: "ff0000", rosybrown: "bc8f8f", royalblue: "4169e1",
	saddlebrown: "8b4513", salmon: "fa8072", sandybrown: "f4a460", seagreen: "2e8b57",
	seashell: "fff5ee", sienna: "a0522d", silver: "c0c0c0", skyblue: "87ceeb", slateblue: "6a5acd",
	slategray: "708090", slategrey: "708090", snow: "fffafa", springgreen: "00ff7f", steelblue: "4682b4",
	tan: "d2b48c", teal: "008080", thistle: "d8bfd8", tomato: "ff6347", turquoise: "40e0d0",
	violet: "ee82ee", wheat: "f5deb3", white: "ffffff", whitesmoke: "f5f5f5", yellow: "ffff00",
	yellowgreen: "9acd32",
};

/** A computed CSS colour as sRGB, or null for one it can't read (a var() left over …). */
export function parseColor(value: string | undefined): Color | null {
	const c = rgba(value?.trim().toLowerCase() ?? "");
	if (!c) return null;
	const hex = c
		.slice(0, 3)
		.map((v) =>
			Math.round(Math.max(0, Math.min(1, v)) * 255)
				.toString(16)
				.padStart(2, "0"),
		)
		.join("");
	return { hex, alpha: Math.max(0, Math.min(1, c[3])) };
}

/** Function arguments: space / comma separated, an optional `/ alpha`; nested functions kept whole. */
function args(inner: string, legacy = true): { parts: string[]; alpha?: string } {
	const tokens: string[] = [];
	let depth = 0;
	let cur = "";
	for (const ch of inner) {
		if (ch === "(") depth++;
		if (ch === ")") depth--;
		if (depth === 0 && (ch === "," || ch === " " || ch === "/")) {
			if (cur) tokens.push(cur);
			cur = "";
			if (ch === "/") tokens.push("/");
			continue;
		}
		cur += ch;
	}
	if (cur) tokens.push(cur);
	const slash = tokens.indexOf("/");
	if (slash >= 0) return { parts: tokens.slice(0, slash), alpha: tokens[slash + 1] };
	// Legacy syntax: a fourth comma-separated value is the alpha.
	return legacy && tokens.length === 4
		? { parts: tokens.slice(0, 3), alpha: tokens[3] }
		: { parts: tokens };
}

/** A number, or a percentage of `full` ("none" is 0). */
function num(v: string | undefined, full = 1): number {
	if (!v || v === "none") return 0;
	const n = Number.parseFloat(v);
	if (Number.isNaN(n)) return 0;
	return v.endsWith("%") ? (n / 100) * full : n;
}

/** An angle in degrees (deg, turn, rad, grad, or a bare number). */
function hue(v: string | undefined): number {
	if (!v || v === "none") return 0;
	const n = Number.parseFloat(v);
	const deg = v.endsWith("turn")
		? n * 360
		: v.endsWith("grad")
			? n * 0.9
			: v.endsWith("rad")
				? (n * 180) / Math.PI
				: n;
	// Any angle, negative ones too, as 0–360.
	return ((deg % 360) + 360) % 360;
}

const alphaOf = (v: string | undefined) => (v === undefined ? 1 : num(v, 1));

function rgba(v: string): Rgba | null {
	if (!v) return null;
	if (v === "transparent" || v === "none") return [0, 0, 0, 0];
	const named = NAMED[v];
	if (named) return fromHex(named);
	const hex = v.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/);
	if (hex) return fromHex(hex[1] ?? "");
	const fn = v.match(/^([a-z-]+)\((.*)\)$/s);
	if (!fn) return null;
	const name = fn[1] ?? "";
	const inner = fn[2] ?? "";
	if (name === "color-mix") return mix(inner);
	// color() names its space first: four values without a slash aren't an alpha.
	const { parts, alpha } = args(inner, name !== "color");
	const a = alphaOf(alpha);
	switch (name) {
		case "rgb":
		case "rgba":
			return [num(parts[0], 255) / 255, num(parts[1], 255) / 255, num(parts[2], 255) / 255, a];
		case "hsl":
		case "hsla":
			return [...hsl(hue(parts[0]), num(parts[1], 100) / 100, num(parts[2], 100) / 100), a];
		case "hwb":
			return [...hwb(hue(parts[0]), num(parts[1], 100) / 100, num(parts[2], 100) / 100), a];
		case "lab":
			return [
				...fromXyzD50(labToXyz(num(parts[0], 100), num(parts[1], 125), num(parts[2], 125))),
				a,
			];
		case "lch": {
			const [l, c, h] = [num(parts[0], 100), num(parts[1], 150), hue(parts[2])];
			const r = (h * Math.PI) / 180;
			return [...fromXyzD50(labToXyz(l, c * Math.cos(r), c * Math.sin(r))), a];
		}
		case "oklab":
			return [...fromOklab(num(parts[0], 1), num(parts[1], 0.4), num(parts[2], 0.4)), a];
		case "oklch": {
			const [l, c, h] = [num(parts[0], 1), num(parts[1], 0.4), hue(parts[2])];
			const r = (h * Math.PI) / 180;
			return [...fromOklab(l, c * Math.cos(r), c * Math.sin(r)), a];
		}
		case "color": {
			const [space, ...rest] = parts;
			const ch = rest.map((p) => num(p, 1)) as [number, number, number];
			if (space === "srgb") return [ch[0], ch[1], ch[2], a];
			if (space === "srgb-linear") return [...ch.map(gamma), a] as Rgba;
			if (space === "display-p3") return [...fromLinearP3(ch.map(linear) as Triple), a];
			return null;
		}
		default:
			return null;
	}
}

function fromHex(h: string): Rgba {
	let hex = h;
	if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join("");
	const byte = (i: number) => Number.parseInt(hex.slice(i, i + 2), 16) / 255;
	return [byte(0), byte(2), byte(4), hex.length === 8 ? byte(6) : 1];
}

type Triple = [number, number, number];

function hsl(h: number, s: number, l: number): Triple {
	const f = (n: number) => {
		const k = (n + h / 30) % 12;
		const a = s * Math.min(l, 1 - l);
		return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
	};
	return [f(0), f(8), f(4)];
}

function hwb(h: number, w: number, b: number): Triple {
	if (w + b >= 1) {
		const gray = w / (w + b);
		return [gray, gray, gray];
	}
	return hsl(h, 1, 0.5).map((c) => c * (1 - w - b) + w) as Triple;
}

/** sRGB transfer function: linear light → gamma-encoded, and back. */
function gamma(c: number): number {
	const a = Math.abs(c);
	return a > 0.0031308 ? Math.sign(c) * (1.055 * a ** (1 / 2.4) - 0.055) : 12.92 * c;
}

function linear(c: number): number {
	const a = Math.abs(c);
	return a <= 0.04045 ? c / 12.92 : Math.sign(c) * ((a + 0.055) / 1.055) ** 2.4;
}

const mul = (m: number[][], v: Triple): Triple =>
	m.map((row) => (row[0] ?? 0) * v[0] + (row[1] ?? 0) * v[1] + (row[2] ?? 0) * v[2]) as Triple;

// Matrices from CSS Color 4 §18 (sample code).
const OKLAB_TO_LMS = [
	[1, 0.3963377773761749, 0.2158037573099136],
	[1, -0.1055613458156586, -0.0638541728258133],
	[1, -0.0894841775298119, -1.2914855480194092],
];
const LMS_TO_LINEAR_SRGB = [
	[4.0767416360759583, -3.3077115392580629, 0.2309699031821043],
	[-1.2684379732850315, 2.6097573492876882, -0.3413193760026573],
	[-0.0041960761386756, -0.7034186179359363, 1.7076146940746117],
];
const LINEAR_SRGB_TO_LMS = [
	[0.4122214694707629, 0.5363325372617349, 0.0514459932675022],
	[0.2119034958178251, 0.6806995506452344, 0.1073969535369406],
	[0.0883024591900564, 0.2817188391361215, 0.6299787016738223],
];
const LMS_TO_OKLAB = [
	[0.210454268309314, 0.7936177747023054, -0.0040720430116193],
	[1.9779985324311684, -2.4285922420485799, 0.450593709617411],
	[0.0259040424655478, 0.7827717124575296, -0.8086757549230774],
];
const XYZ_D50_TO_LINEAR_SRGB = [
	[3.1341359569958707, -1.6173863321612538, -0.4906619460083532],
	[-0.978795502912089, 1.916254567259524, 0.03344273116131949],
	[0.07195537988411677, -0.2289768264158322, 1.405386058324125],
];
const LINEAR_P3_TO_LINEAR_SRGB = [
	[1.2249401762805598, -0.22494017628055996, 0],
	[-0.04205695470968816, 1.0420569547096881, 0],
	[-0.019637554590334432, -0.07863604555063188, 1.0982736001409663],
];

function fromOklab(l: number, a: number, b: number): Triple {
	const lms = mul(OKLAB_TO_LMS, [l, a, b]).map((c) => c ** 3) as Triple;
	return mul(LMS_TO_LINEAR_SRGB, lms).map(gamma) as Triple;
}

function toOklab(rgb: Triple): Triple {
	const lms = mul(LINEAR_SRGB_TO_LMS, rgb.map(linear) as Triple).map(Math.cbrt) as Triple;
	return mul(LMS_TO_OKLAB, lms);
}

/** CIE Lab (D50) to XYZ (D50). */
function labToXyz(l: number, a: number, b: number): Triple {
	const k = 24389 / 27;
	const e = 216 / 24389;
	const fy = (l + 16) / 116;
	const fx = fy + a / 500;
	const fz = fy - b / 200;
	const x = fx ** 3 > e ? fx ** 3 : (116 * fx - 16) / k;
	const y = l > k * e ? fy ** 3 : l / k;
	const z = fz ** 3 > e ? fz ** 3 : (116 * fz - 16) / k;
	return [(x * 0.3457) / 0.3585, y, (z * (1 - 0.3457 - 0.3585)) / 0.3585];
}

function fromXyzD50(xyz: Triple): Triple {
	return mul(XYZ_D50_TO_LINEAR_SRGB, xyz).map(gamma) as Triple;
}

function fromLinearP3(rgb: Triple): Triple {
	return mul(LINEAR_P3_TO_LINEAR_SRGB, rgb).map(gamma) as Triple;
}

/**
 * color-mix() (CSS Color 5 §2): two colours and their percentages, mixed in
 * srgb, srgb-linear, oklab or oklch (other spaces mix as oklab), with
 * premultiplied alpha.
 */
function mix(inner: string): Rgba | null {
	const split: string[] = [];
	let depth = 0;
	let cur = "";
	for (const ch of inner) {
		if (ch === "(") depth++;
		if (ch === ")") depth--;
		if (ch === "," && depth === 0) {
			split.push(cur.trim());
			cur = "";
		} else cur += ch;
	}
	split.push(cur.trim());
	const [method = "", first = "", second = ""] = split;
	const space = method.match(/^in\s+([a-z0-9-]+)/)?.[1] ?? "oklab";
	const part = (s: string) => {
		const pct = s.match(/\s(-?[\d.]+)%$/) ?? s.match(/^(-?[\d.]+)%\s/);
		const color = pct ? s.replace(pct[0], "").trim() : s;
		return { color: rgba(color), p: pct ? Number(pct[1]) / 100 : undefined };
	};
	const a = part(first);
	const b = part(second);
	if (!a.color || !b.color) return null;
	let p1 = a.p;
	let p2 = b.p;
	if (p1 === undefined && p2 === undefined) [p1, p2] = [0.5, 0.5];
	else if (p1 === undefined) p1 = 1 - (p2 ?? 0);
	else if (p2 === undefined) p2 = 1 - p1;
	const total = (p1 ?? 0) + (p2 ?? 0);
	if (total <= 0) return null;
	// Percentages under 100% in all lower the alpha (§2.1).
	const scale = Math.min(1, total);
	const w1 = (p1 ?? 0) / total;
	const w2 = (p2 ?? 0) / total;
	const toSpace = (c: Rgba): Triple => {
		const rgb: Triple = [c[0], c[1], c[2]];
		if (space === "srgb") return rgb;
		if (space === "srgb-linear") return rgb.map(linear) as Triple;
		const lab = toOklab(rgb);
		if (space !== "oklch") return lab;
		const h = (Math.atan2(lab[2], lab[1]) * 180) / Math.PI;
		return [lab[0], Math.hypot(lab[1], lab[2]), (h + 360) % 360];
	};
	const fromSpace = (t: Triple): Triple => {
		if (space === "srgb") return t;
		if (space === "srgb-linear") return t.map(gamma) as Triple;
		if (space !== "oklch") return fromOklab(...t);
		const r = (t[2] * Math.PI) / 180;
		return fromOklab(t[0], t[1] * Math.cos(r), t[1] * Math.sin(r));
	};
	const alpha = a.color[3] * w1 + b.color[3] * w2;
	const ca = toSpace(a.color);
	const cb = toSpace(b.color);
	let out: Triple;
	if (space === "oklch") {
		// Hue: the shorter arc; premultiply lightness and chroma only.
		let dh = cb[2] - ca[2];
		if (dh > 180) dh -= 360;
		if (dh < -180) dh += 360;
		const pre = (t: Triple, al: number): Triple => [t[0] * al, t[1] * al, t[2]];
		const pa = pre(ca, a.color[3]);
		const pb = pre(cb, b.color[3]);
		out = [
			alpha ? (pa[0] * w1 + pb[0] * w2) / alpha : 0,
			alpha ? (pa[1] * w1 + pb[1] * w2) / alpha : 0,
			ca[2] + dh * w2,
		];
	} else {
		const pa = ca.map((v) => v * (a.color?.[3] ?? 1)) as Triple;
		const pb = cb.map((v) => v * (b.color?.[3] ?? 1)) as Triple;
		out = pa.map((v, i) => (alpha ? (v * w1 + (pb[i] ?? 0) * w2) / alpha : 0)) as Triple;
	}
	return [...fromSpace(out), alpha * scale];
}
