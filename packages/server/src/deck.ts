/**
 * Request → deck files: parse the slides a client sends (one Markdown string
 * with `---` separators, or an array of slides) and write them as the files
 * of an Astlide deck (`01-slide.md`, …, `_config.json`).
 *
 * @module
 */

import { slideSchema } from "@astlide/core/schema";
import { load as parseYaml } from "js-yaml";

/** One slide as a client sends it. */
export interface SlideInput {
	/** Markdown body (Markdown slides). */
	markdown?: string;
	/** HTML body (HTML slides, e.g. from `POST /import`). Used when `markdown` is absent. */
	html?: string;
	/** Frontmatter keys (`slideLayout`, `title`, `notes`, `background`, `class`, `hidden`, …). */
	frontmatter?: Record<string, unknown>;
	slideLayout?: string;
	title?: string;
	notes?: string;
}

/** A parsed slide, ready to be written as a deck file. */
export interface Slide {
	kind: "md" | "html";
	body: string;
	frontmatter: Record<string, unknown>;
}

/** Deck-level settings, written to `_config.json`. */
export interface DeckSettings {
	title?: string;
	author?: string;
	date?: string;
	theme?: string;
}

/** A client error: answered with HTTP 400 and its message. */
export class BadRequest extends Error {
	status = 400;
}

const KEY = /^[A-Za-z][\w-]*$/;
const SEPARATOR = /^---[ \t]*$/m;

/** A segment that is only YAML `key: value` lines (and their continuations) — a slide's frontmatter. */
function looksLikeFrontmatter(segment: string): boolean {
	const lines = segment.split("\n").filter((l) => l.trim() !== "");
	if (lines.length === 0) return false;
	if (!/^[A-Za-z][\w-]*[ \t]*:(\s|$)/.test(lines[0] as string)) return false;
	return lines.every((l) => /^[A-Za-z][\w-]*[ \t]*:(\s|$)/.test(l) || /^(\s+\S|-\s)/.test(l));
}

function yamlObject(text: string): Record<string, unknown> {
	let data: unknown;
	try {
		data = parseYaml(text);
	} catch (e) {
		throw new BadRequest(`invalid frontmatter: ${(e as Error).message.split("\n")[0]}`);
	}
	if (data == null) return {};
	if (typeof data !== "object" || Array.isArray(data))
		throw new BadRequest("frontmatter must be YAML key: value pairs");
	return data as Record<string, unknown>;
}

/**
 * Split one Markdown document into slides. Slides are separated by lines that
 * are exactly `---`; a slide may start with a frontmatter block, Slidev-style:
 *
 * ```md
 * ---
 * slideLayout: cover
 * ---
 * # Title
 * ---
 * # Second slide
 * ---
 * slideLayout: two-column
 * notes: Say hello
 * ---
 * # Third slide
 * ```
 *
 * A segment made only of `key: value` lines and followed by another segment
 * is the next slide's frontmatter.
 */
export function splitMarkdown(markdown: string): Slide[] {
	const segments = markdown.replace(/\r\n?/g, "\n").split(SEPARATOR);
	const slides: Slide[] = [];
	for (let i = 0; i < segments.length; i++) {
		const segment = segments[i] as string;
		if (segment.trim() === "") continue;
		let frontmatter: Record<string, unknown> = {};
		let body = segment;
		if (looksLikeFrontmatter(segment) && i + 1 < segments.length) {
			frontmatter = yamlObject(segment);
			body = segments[++i] as string;
		}
		slides.push({ kind: "md", body: body.trim(), frontmatter });
	}
	return slides;
}

/** Slides from an array: strings (Markdown) or {@link SlideInput} objects. */
export function slidesFromArray(items: unknown[]): Slide[] {
	return items.map((item, i) => {
		if (typeof item === "string") return { kind: "md", body: item.trim(), frontmatter: {} };
		if (!item || typeof item !== "object" || Array.isArray(item))
			throw new BadRequest(`slides[${i}] must be a string or an object`);
		const s = item as SlideInput;
		if (s.frontmatter !== undefined && (typeof s.frontmatter !== "object" || !s.frontmatter))
			throw new BadRequest(`slides[${i}].frontmatter must be an object`);
		const frontmatter: Record<string, unknown> = { ...(s.frontmatter ?? {}) };
		for (const key of ["slideLayout", "title", "notes"] as const) {
			if (s[key] !== undefined) frontmatter[key] = s[key];
		}
		if (typeof s.markdown === "string") return { kind: "md", body: s.markdown.trim(), frontmatter };
		if (typeof s.html === "string") return { kind: "html", body: s.html.trim(), frontmatter };
		throw new BadRequest(`slides[${i}] needs "markdown" or "html"`);
	});
}

/** Parse the `markdown` / `slides` fields of a render request. */
export function parseSlides(input: { markdown?: unknown; slides?: unknown }): Slide[] {
	let slides: Slide[];
	if (Array.isArray(input.slides)) slides = slidesFromArray(input.slides);
	else if (typeof input.slides === "string") slides = splitMarkdown(input.slides);
	else if (typeof input.markdown === "string") slides = splitMarkdown(input.markdown);
	else throw new BadRequest('send "markdown" (a string) or "slides" (an array)');
	if (slides.length === 0) throw new BadRequest("no slides");
	slides.forEach(validate);
	return slides;
}

/**
 * Check a slide's frontmatter against Astlide's slide schema up front (a bad
 * value would otherwise fail the build). `layout` becomes `slideLayout`:
 * Astro reserves `layout`.
 */
function validate(slide: Slide, index: number): void {
	const { layout, ...rest } = slide.frontmatter;
	if (layout !== undefined && rest.slideLayout === undefined) rest.slideLayout = layout;
	for (const key of Object.keys(rest))
		if (!KEY.test(key))
			throw new BadRequest(`slide ${index + 1}: invalid frontmatter key "${key}"`);
	const result = slideSchema.safeParse(rest);
	if (!result.success) {
		const issue = result.error.issues[0];
		const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
		throw new BadRequest(`slide ${index + 1}: ${where}${issue?.message ?? "invalid frontmatter"}`);
	}
	slide.frontmatter = rest;
}

/** Frontmatter as YAML (each value as JSON, which is valid YAML). */
function frontmatterBlock(frontmatter: Record<string, unknown>, index: number): string {
	const lines: string[] = [];
	for (const [rawKey, value] of Object.entries(frontmatter)) {
		// `layout` is reserved by Astro; Astlide's key is `slideLayout`.
		const key = rawKey === "layout" ? "slideLayout" : rawKey;
		if (!KEY.test(key))
			throw new BadRequest(`slide ${index + 1}: invalid frontmatter key "${key}"`);
		if (value === undefined) continue;
		lines.push(`${key}: ${JSON.stringify(value)}`);
	}
	return lines.length ? `---\n${lines.join("\n")}\n---\n` : "";
}

/**
 * The deck's files, by file name: numbered slides (`01-slide.md`,
 * `02-slide.html`, …) and `_config.json`.
 */
export function deckFiles(slides: Slide[], settings: DeckSettings): Record<string, string> {
	const files: Record<string, string> = {};
	const width = Math.max(2, String(slides.length).length);
	slides.forEach((slide, i) => {
		const name = `${String(i + 1).padStart(width, "0")}-slide.${slide.kind}`;
		files[name] = `${frontmatterBlock(slide.frontmatter, i)}${slide.body}\n`;
	});
	const config: Record<string, string> = {};
	for (const key of ["title", "author", "date", "theme"] as const) {
		const value = settings[key];
		if (value !== undefined) config[key] = value;
	}
	files["_config.json"] = `${JSON.stringify(config, null, 2)}\n`;
	return files;
}
