/**
 * Natural sizes of images: what an `<img>` without width / height attributes
 * is sized from (its intrinsic size and ratio). Read from the bytes of files
 * in the built site and `data:` URLs — no network.
 */

import { readFileSync } from "node:fs";
import { distFile } from "./dist";

export interface NaturalSize {
	w: number;
	h: number;
}

/** Natural size of a PNG (IHDR) or JPEG (first SOF marker). */
export function bitmapSize(b: Buffer): { format: "png" | "jpeg"; size: NaturalSize } | null {
	if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47)
		return { format: "png", size: { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } };
	if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
		for (let i = 2; i + 9 < b.length; ) {
			if (b[i] !== 0xff) return null;
			const marker = b[i + 1] ?? 0;
			const len = b.readUInt16BE(i + 2);
			if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
				return { format: "jpeg", size: { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) } };
			i += 2 + len;
		}
	}
	return null;
}

/** A GIF's or WebP's size from its header. */
function otherBitmapSize(b: Buffer): NaturalSize | null {
	if (b.length > 10 && b.toString("ascii", 0, 3) === "GIF")
		return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
	if (
		b.length > 30 &&
		b.toString("ascii", 0, 4) === "RIFF" &&
		b.toString("ascii", 8, 12) === "WEBP"
	) {
		const chunk = b.toString("ascii", 12, 16);
		if (chunk === "VP8X") return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
		if (chunk === "VP8 ") return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
		if (chunk === "VP8L") {
			const bits = b.readUInt32LE(21);
			return { w: 1 + (bits & 0x3fff), h: 1 + ((bits >> 14) & 0x3fff) };
		}
	}
	return null;
}

/** An SVG's size from its root's width / height (px or unitless), else its viewBox. */
export function svgSize(svg: string): NaturalSize | null {
	// The root tag found by index, not by a regex scanning to its `>` (quadratic on a hostile file).
	const start = svg.search(/<svg[\s>]/i);
	if (start < 0) return null;
	const end = svg.indexOf(">", start);
	const tag = svg.slice(start, end < 0 ? undefined : end);
	const attr = (name: string) =>
		tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1];
	const px = (v: string | undefined) =>
		v && /^\s*[\d.]+(px)?\s*$/.test(v) ? Number.parseFloat(v) : undefined;
	const view = (attr("viewBox") ?? "")
		.trim()
		.split(/[\s,]+/)
		.map(Number);
	const vw = view[2] ?? 0;
	const vh = view[3] ?? 0;
	let w = px(attr("width"));
	let h = px(attr("height"));
	if (w && !h && vw > 0 && vh > 0) h = (w * vh) / vw;
	if (h && !w && vw > 0 && vh > 0) w = (h * vw) / vh;
	if (w && h) return { w, h };
	return vw > 0 && vh > 0 ? { w: vw, h: vh } : null;
}

/** The natural size of the image bytes, or null when it can't be read. */
export function imageBytesSize(bytes: Buffer): NaturalSize | null {
	const bitmap = bitmapSize(bytes);
	if (bitmap) return bitmap.size;
	const other = otherBitmapSize(bytes);
	if (other) return other;
	const head = bytes.subarray(0, 4096).toString("utf-8");
	return /<svg[\s>]/i.test(head) ? svgSize(bytes.toString("utf-8")) : null;
}

/** A reader of image natural sizes for a built site (cached by `src`). */
export function imageSizes(distDir: string): (src: string) => NaturalSize | null {
	const cache = new Map<string, NaturalSize | null>();
	return (src) => {
		if (cache.has(src)) return cache.get(src) ?? null;
		let size: NaturalSize | null = null;
		try {
			const data = src.match(/^data:([^;,]+)(;base64)?,(.*)$/s);
			if (data) {
				const body = data[3] ?? "";
				size = imageBytesSize(
					data[2] ? Buffer.from(body, "base64") : Buffer.from(decodeURIComponent(body)),
				);
			} else if (src.startsWith("/")) {
				const file = distFile(distDir, src);
				if (file) size = imageBytesSize(readFileSync(file));
			}
		} catch {
			size = null;
		}
		cache.set(src, size);
		return size;
	};
}
