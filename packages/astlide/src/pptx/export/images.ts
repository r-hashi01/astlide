/**
 * Pictures for the slides: images read from the site, data URLs or the
 * network (fetched ahead, cached), SVG rasterized, and CSS backgrounds placed
 * and cropped like the browser does.
 *
 * @module
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { bitmapSize } from "@astlide/core/engine";
import type { FetchBudget } from "@astlide/core/utils/network";
import type { Engine, Warn } from "./common";

/** Pixels per CSS px when rasterizing vector images (sharp at full-screen size). */
export const RASTER_SCALE = 2;

/**
 * An image's data and natural size in CSS px: PNG and JPEG as they are, SVG
 * as text (rasterized when placed). Null when it can't be read.
 */
type ImageSource =
	| { bitmap: Buffer; format: "png" | "jpeg"; size: { w: number; h: number } }
	| { svg: string; size: { w: number; h: number } };

/** Bytes of the remote images one export fetched, by URL (null: not downloaded); see {@link fetchImages}. */
export type RemoteImages = Map<string, Buffer | null>;

export function imageSource(
	src: string,
	dist: string,
	distFile: (dist: string, url: string) => string | null,
	remoteImages: RemoteImages,
): ImageSource | null {
	let bytes: Buffer | null = null;
	const data = src.match(/^data:([^;,]+)(;base64)?,(.*)$/s);
	if (data) {
		const body = data[3] ?? "";
		bytes = data[2] ? Buffer.from(body, "base64") : Buffer.from(decodeURIComponent(body));
	} else if (/^https?:\/\//.test(src)) {
		bytes = remoteImages.get(src) ?? null;
	} else {
		const path = src.startsWith("/") ? distFile(dist, src) : null;
		if (path) bytes = readFileSync(path);
	}
	if (!bytes) return null;
	const bitmap = bitmapSize(bytes);
	if (bitmap) return { bitmap: bytes, ...bitmap };
	const svg = bytes.toString("utf-8");
	// The root tag found by index, not by a regex scanning to its `>` (quadratic on a hostile file).
	const start = svg.search(/<svg[\s>]/);
	if (start < 0) return null;
	const end = svg.indexOf(">", start);
	const root = end < 0 ? "" : svg.slice(start, Math.min(end + 1, start + 4096));
	const attr = (name: string) =>
		Number.parseFloat(root.match(new RegExp(`\\s${name}="([\\d.]+)(px)?"`))?.[1] ?? "");
	const view = root.match(/viewBox="[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)[\s,]+([\d.]+)"/);
	const w = attr("width") || Number(view?.[1] ?? 300);
	const h = attr("height") || Number(view?.[2] ?? 150);
	return { svg, size: { w, h } };
}

/** SVG drawn as a picture, or null (with a warning) when it can't be — too large, unreadable. */
export function svgPicture(
	engine: Engine,
	svg: string,
	width: number,
	fontFiles: string[],
	warn: Warn,
): Buffer | null {
	try {
		return engine.svgToPng(svg, width, fontFiles);
	} catch (error) {
		warn(`  ⚠ SVG image left out: ${(error as Error).message.split("\n")[0]}`);
		return null;
	}
}

export function rasterize(
	engine: Engine,
	source: ImageSource,
	width: number,
	fontFiles: string[],
	warn: Warn,
): Buffer | null {
	return "bitmap" in source
		? source.bitmap
		: svgPicture(engine, source.svg, width * RASTER_SCALE, fontFiles, warn);
}

/** Largest remote image an export downloads, in bytes. */
const IMAGE_LIMIT = 20 * 1024 * 1024;

/**
 * Fetch remote images (e.g. video thumbnails) ahead of the export, cached on
 * disk. Offline, failing, oversized or refused ones (see
 * `exportFetch`, or past the {@link FetchBudget}) are left out with a warning: their stand-in
 * (background, play button, link) still shows. `urls` maps each URL to who
 * chose it: the deck, or a remote page (thumbnails).
 */
export async function fetchImages(
	urls: Map<string, "deck" | "remote">,
	cacheDir: string,
	budget: FetchBudget,
	warn: Warn,
): Promise<RemoteImages> {
	// This export's own: nothing outlives it, nothing is shared with another running at once.
	const remoteImages: RemoteImages = new Map();
	await mkdir(cacheDir, { recursive: true });
	const failed: string[] = [];
	await Promise.all(
		[...urls].map(async ([url, source]) => {
			const file = join(cacheDir, createHash("sha256").update(url).digest("hex"));
			if (existsSync(file)) {
				remoteImages.set(url, readFileSync(file));
				return;
			}
			try {
				const res = await budget.fetch(url, { limit: IMAGE_LIMIT, source });
				if (!res.ok) throw new Error(String(res.status));
				const bytes = res.body;
				await writeFile(file, bytes);
				remoteImages.set(url, bytes);
			} catch {
				remoteImages.set(url, null);
				failed.push(url);
			}
		}),
	);
	if (failed.length) warn(`  ⚠ images not downloaded (offline?): ${failed.join(", ")}`);
	return remoteImages;
}

/** One `background-position` component as an offset into `free` px of room. */
function positionOffset(token: string | undefined, free: number): number {
	const t = (token ?? "center").trim();
	if (t === "left" || t === "top") return 0;
	if (t === "right" || t === "bottom") return free;
	if (t === "center") return free / 2;
	const n = Number.parseFloat(t);
	if (Number.isNaN(n)) return free / 2;
	return t.endsWith("%") ? (free * n) / 100 : n;
}

/**
 * Where a CSS background image lands in its box (`background-size`:
 * cover / contain / lengths / auto; `background-position`), and the part of
 * it inside the box as a crop. Null when none of it is visible.
 */
export function placeBackground(
	box: { x: number; y: number; w: number; h: number },
	bg: { size: string; position: string },
	natural: { w: number; h: number },
) {
	const size = bg.size.trim().split(/\s+/);
	let w = natural.w;
	let h = natural.h;
	if (size[0] === "cover" || size[0] === "contain") {
		const s = (size[0] === "cover" ? Math.max : Math.min)(box.w / natural.w, box.h / natural.h);
		w = natural.w * s;
		h = natural.h * s;
	} else {
		const len = (t: string | undefined, basis: number) =>
			!t || t === "auto"
				? null
				: t.endsWith("%")
					? (basis * Number.parseFloat(t)) / 100
					: Number.parseFloat(t);
		const sw = len(size[0], box.w);
		const sh = len(size[1], box.h);
		if (sw !== null && sh !== null) [w, h] = [sw, sh];
		else if (sw !== null) [w, h] = [sw, (sw * natural.h) / natural.w];
		else if (sh !== null) [w, h] = [(sh * natural.w) / natural.h, sh];
	}
	// "center" alone means both; a single vertical keyword puts the horizontal at center.
	let [px, py] = bg.position.trim().split(/\s+/);
	if (py === undefined && (px === "top" || px === "bottom")) [px, py] = ["center", px];
	const drawn = {
		x: box.x + positionOffset(px, box.w - w),
		y: box.y + positionOffset(py ?? "center", box.h - h),
		w,
		h,
	};
	const left = Math.max(box.x, drawn.x);
	const top = Math.max(box.y, drawn.y);
	const right = Math.min(box.x + box.w, drawn.x + w);
	const bottom = Math.min(box.y + box.h, drawn.y + h);
	if (right <= left || bottom <= top || w <= 0 || h <= 0) return null;
	return {
		drawn,
		visible: { x: left, y: top, w: right - left, h: bottom - top },
		crop: {
			left: (left - drawn.x) / w,
			top: (top - drawn.y) / h,
			right: (drawn.x + w - right) / w,
			bottom: (drawn.y + h - bottom) / h,
		},
	};
}
