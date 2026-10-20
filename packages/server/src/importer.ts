/**
 * PowerPoint in: a deck's slides as HTML (`POST /import`) and a template's
 * layouts (`POST /templates/layouts`), via `@astlide/core/pptx`.
 *
 * @module
 */

import { pptxToSlides, pptxToTemplate, type TemplateRegion } from "@astlide/core/pptx";
import { BadRequest } from "./deck";

/** Template / deck file extensions accepted. */
export const TEMPLATE_EXTS = [".pptx", ".potx", ".thmx"];

const GOOGLE_SLIDES = /^https:\/\/docs\.google\.com\/presentation\/d\/([\w-]+)/;

/** A ZIP (OOXML) file starts with `PK\x03\x04`. */
export function isZip(data: Uint8Array): boolean {
	return data.length > 4 && data[0] === 0x50 && data[1] === 0x4b && data[2] === 3 && data[3] === 4;
}

/**
 * A Google Slides deck exported as PowerPoint. Only docs.google.com
 * presentation URLs are fetched; the deck must be shared as "Anyone with the link".
 */
export async function fetchGoogleSlides(url: string): Promise<Uint8Array> {
	const id = url.match(GOOGLE_SLIDES)?.[1];
	if (!id)
		throw new BadRequest(
			"url must be a Google Slides URL (https://docs.google.com/presentation/d/…)",
		);
	const res = await fetch(`https://docs.google.com/presentation/d/${id}/export/pptx`, {
		redirect: "follow",
		signal: AbortSignal.timeout(60_000),
	});
	const data = new Uint8Array(await res.arrayBuffer());
	// A private deck answers with a sign-in page, not a ZIP.
	if (!res.ok || !isZip(data))
		throw new BadRequest('couldn\'t download the deck — share it as "Anyone with the link"');
	return data;
}

function readable<T>(what: string, fn: () => T): T {
	try {
		return fn();
	} catch (e) {
		throw new BadRequest(`not a readable ${what}: ${(e as Error).message}`);
	}
}

/** `POST /import`: the deck's slides as HTML, pictures inlined as `data:` URLs. */
export function importDeck(data: Uint8Array) {
	if (!isZip(data)) throw new BadRequest("not a .pptx file");
	const deck = readable("PowerPoint file", () => pptxToSlides(data));
	return {
		title: deck.title ?? null,
		author: deck.author ?? null,
		width: deck.width,
		height: deck.height,
		theme: deck.theme,
		slides: deck.slides.map((s) => ({
			index: s.index,
			title: s.title ?? null,
			notes: s.notes,
			hidden: s.hidden,
			html: s.html,
		})),
	};
}

const box = (r: TemplateRegion | undefined) =>
	r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;

/** `POST /templates/layouts`: a template's layouts and where their placeholders are (px on 1920×1080). */
export function templateLayouts(data: Uint8Array) {
	if (!isZip(data)) throw new BadRequest("not a .pptx / .potx / .thmx file");
	// Pictures aren't needed for the outline.
	const t = readable("PowerPoint template", () => pptxToTemplate(data, { media: () => "" }));
	return {
		width: t.width,
		height: t.height,
		colors: t.colors,
		fonts: t.fonts,
		aliases: t.aliases,
		layouts: t.layouts.map((l) => ({
			id: l.id,
			name: l.name,
			type: l.type ?? null,
			title: box(l.title),
			body: l.body.map(box),
			slideNumber: box(l.slideNumber),
		})),
	};
}
