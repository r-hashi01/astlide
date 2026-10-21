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
import { basename, extname, join, relative, resolve, sep } from "node:path";
import { pptxToSlides } from "../pptx/index";
import { slugify } from "../pptx/slug";
import { assetExtension } from "../utils/pptx-assets";
import { realPath } from "../utils/real-path";

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
/** Largest Google Slides download, in bytes, and how long it may take. */
const DOWNLOAD_LIMIT = 512 * 1024 * 1024;
const DOWNLOAD_TIMEOUT = 5 * 60_000;

/** A response's body, refused past `limit` bytes. */
async function readLimited(res: Response, limit: number): Promise<Buffer> {
	const chunks: Uint8Array[] = [];
	let size = 0;
	const reader = res.body?.getReader();
	while (reader) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > limit) {
			await reader.cancel();
			throw new Error(`the download is larger than ${limit / 1024 / 1024} MB`);
		}
		chunks.push(value);
	}
	return Buffer.concat(chunks);
}

/** The deck's bytes: a local file, or a Google Slides deck exported as PowerPoint. */
async function readSource(source: string): Promise<{ data: Buffer; name: string }> {
	const google = source.match(GOOGLE_SLIDES);
	if (google) {
		const res = await fetch(`https://docs.google.com/presentation/d/${google[1]}/export/pptx`, {
			redirect: "follow",
			signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT),
		});
		const data = await readLimited(res, DOWNLOAD_LIMIT);
		// A private deck answers with a sign-in page, not a ZIP.
		if (!res.ok || data.length < 4 || data.readUInt32LE(0) !== 0x04034b50)
			throw new Error(
				'couldn\'t download the deck — share it as "Anyone with the link" (or File → Download → PowerPoint and import that file)',
			);
		const name = res.headers
			.get("content-disposition")
			?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)/i)?.[1];
		return { data, name: (name && decodeName(name)) || `google-slides-${google[1]}.pptx` };
	}
	if (!existsSync(source)) throw new Error(`no file ${source}`);
	if (extname(source).toLowerCase() !== ".pptx")
		throw new Error(`${source}: only .pptx files (save .ppt / .key / .odp as PowerPoint first)`);
	return { data: await readFile(source), name: basename(source) };
}

/** A percent-encoded file name, or undefined when it doesn't decode. */
function decodeName(name: string): string | undefined {
	try {
		return decodeURIComponent(name);
	} catch {
		return undefined;
	}
}

/** A YAML double-quoted scalar (frontmatter values). */
const yaml = (s: string) => JSON.stringify(s);

/** Deck folder names: letters, digits, `_`, `-` and dots, not starting with a dot or `-`. */
const DECK_NAME = /^[\p{L}\p{N}_][\p{L}\p{N}_.-]{0,99}$/u;

/** A deck folder name, checked: one folder under src/content/decks, never a path. */
export function deckFolderName(name: string): string {
	if (!DECK_NAME.test(name) || name.includes(".."))
		throw new Error(
			`bad deck name "${name}" — use letters, digits, "-", "_" and ".", like "q3-review"`,
		);
	return name;
}

/** Import a deck; returns the deck folder (relative to the root) and its slide count. */
export async function importDeck(options: ImportOptions): Promise<{ dir: string; slides: number }> {
	// A name given is checked before anything is read or fetched.
	if (options.deck !== undefined) deckFolderName(options.deck);
	const { data, name } = await readSource(options.source);
	const deckName = deckFolderName(
		options.deck ?? slugify(basename(name, extname(name)), "imported"),
	);
	const decks = resolve(options.root, "src", "content", "decks");
	const deckDir = join(decks, deckName);
	const assetDir = join(resolve(options.root, "public", "pptx"), deckName);
	// Belt and braces: both stay one level below their folder.
	for (const [dir, parent] of [
		[deckDir, decks],
		[assetDir, resolve(options.root, "public", "pptx")],
	])
		if (!resolve(dir).startsWith(parent + sep) || relative(parent, dir).includes(sep))
			throw new Error(`bad deck name "${deckName}"`);
	// …and the folders themselves are where they seem: a symlinked `src/content/decks` or
	// `public/pptx` (or a parent) would make --force delete outside the project.
	const realRoot = realPath(options.root);
	for (const parts of [
		["src", "content", "decks"],
		["public", "pptx"],
	]) {
		const where = join(...parts);
		if (realPath(join(options.root, where, deckName)) !== join(realRoot, where, deckName))
			throw new Error(
				`${join(where, deckName)} or a folder above it is a symlink — refusing to write there`,
			);
	}
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
			// What the bytes are, not what the file is called (see assetExtension).
			const ext = assetExtension(file.data);
			if (!ext) return null;
			const fileName = `${createHash("sha256").update(file.data).digest("hex").slice(0, 16)}${ext}`;
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
