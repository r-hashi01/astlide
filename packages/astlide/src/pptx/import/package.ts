/**
 * A PowerPoint package: its parts and relationships, read with bounds (the
 * file comes from someone else).
 *
 * @module
 */

import { posix } from "node:path";
import { type Element, kids, parseXml } from "../ooxml/xml";
import type { ZipFiles } from "../ooxml/zip";

export const REL = {
	slide: "/slide",
	layout: "/slideLayout",
	master: "/slideMaster",
	theme: "/theme",
	notes: "/notesSlide",
	image: "/image",
	hyperlink: "/hyperlink",
	office: "/officeDocument",
};

export const MIME: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	svg: "image/svg+xml",
	webp: "image/webp",
	bmp: "image/bmp",
};

interface Rel {
	type: string;
	target: string;
	external: boolean;
}

/** Most embedded font families read from one file. */
export const MAX_EMBEDDED_FONTS = 32;

/** Largest XML part read, in bytes (real slide, layout and theme parts stay far below). */
export const MAX_XML_BYTES = 32 * 1024 * 1024;

/** The OOXML package: parts by path, parsed XML and relationships on demand. */
export class Package {
	private parsed = new Map<string, Element | null>();
	private relsCache = new Map<string, Map<string, Rel>>();
	constructor(readonly files: ZipFiles) {}

	xml(part: string | undefined): Element | undefined {
		if (!part) return undefined;
		if (!this.parsed.has(part)) {
			const data = this.files.get(part);
			if (data && data.length > MAX_XML_BYTES)
				throw new Error(`XML part ${part} is too large (${data.length} bytes)`);
			this.parsed.set(part, data ? parseXml(data.toString("utf-8")) : null);
		}
		return this.parsed.get(part) ?? undefined;
	}

	rels(part: string): Map<string, Rel> {
		const hit = this.relsCache.get(part);
		if (hit) return hit;
		const out = new Map<string, Rel>();
		const file = posix.join(posix.dirname(part), "_rels", `${posix.basename(part)}.rels`);
		for (const r of kids(this.xml(file), "Relationship")) {
			const external = r.attribs.TargetMode === "External";
			const target = r.attribs.Target ?? "";
			out.set(r.attribs.Id ?? "", {
				type: r.attribs.Type ?? "",
				external,
				target: external
					? target
					: target.startsWith("/")
						? target.slice(1)
						: posix.normalize(posix.join(posix.dirname(part), target)),
			});
		}
		this.relsCache.set(part, out);
		return out;
	}

	/** The first relationship of a kind (by type suffix). */
	relOf(part: string, type: string): Rel | undefined {
		for (const r of this.rels(part).values()) if (r.type.endsWith(type)) return r;
		return undefined;
	}
}

/** Most slides read from one presentation. */
export const MAX_SLIDES = 2000;
