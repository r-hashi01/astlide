/**
 * MDX slides compiled for any JSX framework with the pipeline Astro uses for
 * them in an Astlide site: Astro's MDX engine (Sätteri), GFM and smart
 * punctuation, heading ids, Shiki with Astlide's code-step and Mermaid
 * transformers. Only the JSX runtime changes (`react`, `vue`, `preact` …),
 * so the same `.mdx` slides render the same in Astro, React and Vue.
 *
 * @module
 */

import {
	satteriCreateHighlightFn,
	satteriHeadingIdsPlugin,
	satteriHighlightPlugin,
} from "@astrojs/markdown-satteri";
import { evaluate, mdxToJs } from "satteri";
import { astlideCodeHighlight } from "../utils/code-highlight";
import { stripTrailingComment } from "../utils/comment-notes";
import { astlideMermaid } from "../utils/mermaid";

export interface SlideMdxOptions {
	/** Shiki theme for code blocks. Default `github-dark`. */
	shikiTheme?: string;
	/** Where the automatic JSX runtime comes from. Default `react`. */
	jsxImportSource?: string;
	/** Development build of the JSX runtime. */
	development?: boolean;
	/**
	 * `false` leaves `<SpeakerNotes>` / `<Notes>` blocks out of the compiled
	 * code, so pages built without notes don't carry their text. Default `true`.
	 */
	notes?: boolean;
}

type Highlight = Awaited<ReturnType<typeof satteriCreateHighlightFn>>;
const highlighters = new Map<string, Promise<Highlight>>();

/** The Shiki highlighter for a theme, made once. */
function highlighter(theme: string): Promise<Highlight> {
	let made = highlighters.get(theme);
	if (!made) {
		made = satteriCreateHighlightFn("shiki", {
			theme,
			wrap: true,
			transformers: [astlideCodeHighlight(), astlideMermaid()],
		} as never);
		highlighters.set(theme, made);
	}
	return made;
}

/** The trailing `<!-- notes -->` comment is notes, not content (as in an Astlide site). */
export function withoutNotesComment(source: string): string {
	return stripTrailingComment(source) ?? source;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const NOTES_OPEN = /^\s*<(SpeakerNotes|Notes)(?=[\s>/])/;

/**
 * The source without its `<SpeakerNotes>` / `<Notes>` blocks: each from a line
 * starting with the opening tag to the line holding its closing tag (or a
 * self-closing tag). Lines inside code fences are kept, so a slide can show
 * the syntax.
 */
export function withoutSpeakerNotes(source: string): string {
	const out: string[] = [];
	let fence: string | undefined;
	let closing: string | undefined;
	for (const line of source.split("\n")) {
		if (closing) {
			if (line.includes(closing)) closing = undefined;
			continue;
		}
		const marker = FENCE.exec(line)?.[1];
		if (fence) {
			if (marker?.[0] === fence[0] && marker.length >= fence.length) fence = undefined;
			out.push(line);
			continue;
		}
		if (marker) {
			fence = marker;
			out.push(line);
			continue;
		}
		const open = NOTES_OPEN.exec(line);
		if (open) {
			const end = `</${open[1]}>`;
			const rest = line.slice(open.index + open[0].length);
			if (!/^[^>]*\/>/.test(rest) && !rest.includes(end)) closing = end;
			continue;
		}
		out.push(line);
	}
	return out.join("\n");
}

/** The source as compiled: without the trailing notes comment, and without notes blocks when asked. */
function slideSource(source: string, options: SlideMdxOptions): string {
	const content = withoutNotesComment(source);
	return options.notes === false ? withoutSpeakerNotes(content) : content;
}

async function compileOptions(options: SlideMdxOptions) {
	const highlight = await highlighter(options.shikiTheme ?? "github-dark");
	return {
		hastPlugins: [
			...(highlight ? [satteriHighlightPlugin(highlight, undefined)] : []),
			satteriHeadingIdsPlugin(),
		],
		features: { gfm: true, smartPunctuation: true },
		jsxImportSource: options.jsxImportSource ?? "react",
		elementAttributeNameCase: (options.jsxImportSource ?? "react") === "react" ? "react" : "html",
		development: options.development,
		data: {},
	} as const;
}

/** An MDX slide (without frontmatter) as an ES module: `export default MDXContent`. */
export async function compileSlideMdx(
	source: string,
	options: SlideMdxOptions = {},
): Promise<string> {
	const result = await mdxToJs(slideSource(source, options), await compileOptions(options));
	return result.code;
}

export interface SlideMdxRuntime {
	Fragment: unknown;
	jsx: (type: unknown, props: unknown, key?: unknown) => unknown;
	jsxs: (type: unknown, props: unknown, key?: unknown) => unknown;
}

/**
 * Compile and run an MDX slide: its `MDXContent` component, rendered with
 * `runtime` (e.g. `react/jsx-runtime`). Pass Astlide's components as its
 * `components` prop. Runs the slide's code: only for slides you trust.
 */
export async function evaluateSlideMdx(
	source: string,
	runtime: SlideMdxRuntime,
	options: SlideMdxOptions = {},
): Promise<{ default: unknown }> {
	const { jsxImportSource: _, ...rest } = await compileOptions(options);
	return (await evaluate(slideSource(source, options), { ...rest, ...runtime } as never)) as {
		default: unknown;
	};
}
