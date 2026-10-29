/**
 * PowerPoint in: a deck's slides as HTML (`POST /import`) and a template's
 * layouts (`POST /templates/layouts`), via `@astlide/core/pptx`.
 *
 * @module
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { pptxToSlides, pptxToTemplate, type TemplateRegion } from "@astlide/core/pptx";
import { exportFetch } from "@astlide/core/utils/network";
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
 * presentation URLs are fetched (at most `limit` bytes, within 60 s); the deck
 * must be shared as "Anyone with the link".
 */
export async function fetchGoogleSlides(url: string, limit: number): Promise<Uint8Array> {
	const id = url.match(GOOGLE_SLIDES)?.[1];
	if (!id)
		throw new BadRequest(
			"url must be a Google Slides URL (https://docs.google.com/presentation/d/…)",
		);
	let res: Awaited<ReturnType<typeof exportFetch>>;
	try {
		res = await exportFetch(`https://docs.google.com/presentation/d/${id}/export/pptx`, {
			limit,
			timeoutMs: 60_000,
			// The address is fixed, but the server only ever fetches public hosts.
			source: "remote",
		});
	} catch (e) {
		throw new BadRequest(`couldn't download the deck: ${(e as Error).message}`);
	}
	const data = new Uint8Array(res.body);
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

/** The parse didn't finish in time: HTTP 504. */
export class ParseTimeout extends Error {
	status = 504;
}

/** The answer would be larger than allowed: HTTP 422. */
export class ParseTooLarge extends Error {
	status = 422;
}

const WORKER = fileURLToPath(new URL("./import-worker.ts", import.meta.url));

/**
 * {@link importDeck} (`"deck"`) or {@link templateLayouts} (`"layouts"`) in a
 * child process (`import-worker.ts`): an uploaded file can't stall or crash
 * the server, the parse is stopped after `timeoutMs`, and an answer over
 * `maxOutputBytes` is refused.
 */
export function parsePptx(
	mode: "deck" | "layouts",
	data: Uint8Array,
	options: { bun: string; timeoutMs: number; maxOutputBytes: number },
): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const child = spawn(options.bun, [WORKER, mode], {
			stdio: ["pipe", "pipe", "ignore"],
			env: { PATH: process.env.PATH ?? "", NO_COLOR: "1" },
		});
		const chunks: Buffer[] = [];
		let size = 0;
		let failure: Error | undefined;
		const stop = (error: Error) => {
			failure ??= error;
			child.kill("SIGKILL");
		};
		const timer = setTimeout(
			() =>
				stop(
					new ParseTimeout(
						`reading the file took longer than ${Math.round(options.timeoutMs / 1000)}s`,
					),
				),
			options.timeoutMs,
		);
		child.stdout.on("data", (chunk: Buffer) => {
			size += chunk.length;
			if (size > options.maxOutputBytes)
				stop(
					new ParseTooLarge(
						`the result is larger than ${Math.round(options.maxOutputBytes / 1024 / 1024)} MB`,
					),
				);
			else chunks.push(chunk);
		});
		child.stdin.on("error", () => {}); // the child may exit before reading everything
		child.stdin.end(data);
		child.on("error", (e) => {
			clearTimeout(timer);
			reject(e);
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			if (failure) return reject(failure);
			let answer: unknown;
			try {
				answer = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
			} catch {
				return reject(new BadRequest("not a readable PowerPoint file (the reader stopped)"));
			}
			if (code === 0) return resolve(answer);
			const message = (answer as { error?: string })?.error ?? "the reader failed";
			reject(code === 2 ? new BadRequest(message) : new Error(message));
		});
	});
}
