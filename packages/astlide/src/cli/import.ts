/**
 * `astlide import` — turn a PowerPoint file (or a Google Slides deck) into
 * an Astlide deck you can edit: one `.html` slide per page in
 * `src/content/decks/<deck>/`, pictures and embedded fonts in
 * `public/pptx/<deck>/`, title / notes / hidden carried in frontmatter.
 *
 * @module
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import { pptxToSlides } from "../pptx/index";
import { slugify } from "../pptx/slug";

export { slugify };

export interface ImportOptions {
	/** A .pptx path, or a Google Slides URL. */
	source: string;
	/** Project root (holds src/content/decks). */
	root: string;
	/** Deck folder name (default: from the file name). */
	deck?: string;
	/** Replace an existing deck folder. */
	force?: boolean;
}

const GOOGLE_SLIDES = /^https:\/\/docs\.google\.com\/presentation\/d\/([\w-]+)/;

/** The deck's bytes: a local file, or a Google Slides deck exported as PowerPoint. */
async function readSource(source: string): Promise<{ data: Buffer; name: string }> {
	const google = source.match(GOOGLE_SLIDES);
	if (google) {
		const res = await fetch(`https://docs.google.com/presentation/d/${google[1]}/export/pptx`, {
			redirect: "follow",
		});
		const data = Buffer.from(await res.arrayBuffer());
		// A private deck answers with a sign-in page, not a ZIP.
		if (!res.ok || data.readUInt32LE(0) !== 0x04034b50)
			throw new Error(
				'couldn\'t download the deck — share it as "Anyone with the link" (or File → Download → PowerPoint and import that file)',
			);
		const name = res.headers
			.get("content-disposition")
			?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)/i)?.[1];
		return { data, name: name ? decodeURIComponent(name) : `google-slides-${google[1]}.pptx` };
	}
	if (!existsSync(source)) throw new Error(`no file ${source}`);
	if (extname(source).toLowerCase() !== ".pptx")
		throw new Error(`${source}: only .pptx files (save .ppt / .key / .odp as PowerPoint first)`);
	return { data: await readFile(source), name: basename(source) };
}

/** A YAML double-quoted scalar (frontmatter values). */
const yaml = (s: string) => JSON.stringify(s);

/** Import a deck; returns the deck folder (relative to the root) and its slide count. */
export async function importDeck(options: ImportOptions): Promise<{ dir: string; slides: number }> {
	const { data, name } = await readSource(options.source);
	const deckName = options.deck ?? slugify(basename(name, extname(name)), "imported");
	const deckDir = join(options.root, "src", "content", "decks", deckName);
	const assetDir = join(options.root, "public", "pptx", deckName);
	if (existsSync(deckDir)) {
		if (!options.force)
			throw new Error(`${relative(options.root, deckDir)} exists — pass --force to replace it`);
		await rm(deckDir, { recursive: true });
		await rm(assetDir, { recursive: true, force: true });
	}
	await mkdir(deckDir, { recursive: true });

	const pending: Promise<void>[] = [];
	const deck = pptxToSlides(data, {
		media: (file) => {
			const fileName = `${createHash("sha256").update(file.data).digest("hex").slice(0, 16)}${extname(file.name).toLowerCase()}`;
			pending.push(
				mkdir(assetDir, { recursive: true }).then(() =>
					writeFile(join(assetDir, fileName), file.data),
				),
			);
			return `/pptx/${deckName}/${fileName}`;
		},
	});
	const width = String(deck.slides.length).length < 2 ? 2 : String(deck.slides.length).length;
	for (const slide of deck.slides) {
		const front = [
			slide.title ? `title: ${yaml(slide.title)}` : "",
			slide.notes ? `notes: ${yaml(slide.notes)}` : "",
			slide.hidden ? "hidden: true" : "",
		].filter(Boolean);
		const file = `${String(slide.index).padStart(width, "0")}-${slugify(slide.title ?? "", "slide")}.html`;
		const head = front.length ? `---\n${front.join("\n")}\n---\n` : "";
		pending.push(writeFile(join(deckDir, file), `${head}${slide.html}\n`));
	}
	const config: Record<string, string> = { title: deck.title ?? basename(name, extname(name)) };
	if (deck.author) config.author = deck.author;
	pending.push(writeFile(join(deckDir, "_config.json"), `${JSON.stringify(config, null, 2)}\n`));
	await Promise.all(pending);
	return { dir: relative(options.root, deckDir), slides: deck.slides.length };
}
