/**
 * Line highlighting and click-through highlight steps for fenced code blocks.
 *
 * Reads a Slidev-style `{...}` range from the code fence meta:
 *
 * ````md
 * ```ts {2,4-6}        ← highlight lines 2 and 4–6, dim the rest
 * ```ts {2|3-5|all}    ← start on line 2, then 3–5, then everything on → / Space
 * ````
 *
 * Ranges are comma-separated line numbers or `a-b` spans (1-based). `all` or `*`
 * selects every line. A single segment is a static highlight; segments separated
 * by `|` become navigation steps that the deck runtime walks through alongside
 * `<Fragment>` reveals.
 *
 * The transformer runs at build time inside Shiki (registered on
 * `markdown.shikiConfig.transformers` by the integration), so it works for both
 * `.mdx` and `.md` slides regardless of the Markdown processor.
 *
 * @module
 */

/** A resolved highlight segment: explicit 1-based line numbers, or every line. */
export type HighlightSegment = number[] | "all";

/**
 * Parse the highlight ranges out of a code fence meta string.
 *
 * @param meta - Raw meta string after the language (e.g. `title="x" {2|3-5|all}`).
 * @returns One entry per `|`-separated segment, or `null` when the meta has no
 *   valid `{...}` range.
 *
 * @example
 * parseHighlightMeta("{2|3-5|all}"); // → [[2], [3, 4, 5], "all"]
 */
export function parseHighlightMeta(meta: string | undefined | null): HighlightSegment[] | null {
	if (!meta) return null;
	// Use the first `{...}` group that parses as a range list, so unrelated braces
	// in other meta attributes (e.g. `title="{x}"`) are skipped.
	for (const match of meta.matchAll(/\{([^{}]*)\}/g)) {
		const segments = parseSegments(match[1]);
		if (segments) return segments;
	}
	return null;
}

function parseSegments(body: string): HighlightSegment[] | null {
	const segments: HighlightSegment[] = [];
	for (const rawSegment of body.split("|")) {
		const segment = rawSegment.trim();
		if (segment === "all" || segment === "*") {
			segments.push("all");
			continue;
		}
		const lines = new Set<number>();
		for (const part of segment.split(",")) {
			const token = part.trim();
			const range = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(token);
			if (!range) return null;
			const start = Number(range[1]);
			const end = Number(range[2] ?? range[1]);
			for (let n = Math.min(start, end); n <= Math.max(start, end); n++) {
				if (n > 0) lines.add(n);
			}
		}
		segments.push([...lines].sort((a, b) => a - b));
	}
	return segments;
}

/** Serialise segments for the runtime: `2|3,4,5|*`. */
function serializeSegments(segments: HighlightSegment[]): string {
	return segments.map((s) => (s === "all" ? "*" : s.join(","))).join("|");
}

function isHighlighted(segment: HighlightSegment, line: number): boolean {
	return segment === "all" || segment.includes(line);
}

// Minimal structural types for the Shiki hooks we use. Declared locally so
// `@astlide/core` doesn't need `shiki` as a direct dependency (Astro provides it).
interface HastElementLike {
	properties: Record<string, unknown>;
}
interface TransformerContext {
	options: { meta?: { __raw?: string } };
	addClassToHast(node: HastElementLike, className: string | string[]): unknown;
}

/** Shiki transformer shape returned by {@link astlideCodeHighlight}. */
export interface AstlideShikiTransformer {
	name: string;
	pre(this: TransformerContext, node: HastElementLike): void;
	line(this: TransformerContext, node: HastElementLike, line: number): void;
}

/**
 * Shiki transformer implementing `{...}` line highlighting and highlight steps.
 *
 * Output contract (consumed by `Slide.astro` CSS and the `DeckLayout` runtime):
 * - every line gets `data-line="<n>"`;
 * - lines in the first segment get the `highlighted` class;
 * - the `<pre>` gets `has-highlighted`, and — when there is more than one
 *   segment — `data-code-steps="2|3,4,5|*"`;
 * - with steps, lines in the last segment also get `highlighted-last`, so the
 *   JS-free print view (`/[deck]/all`, used for PDF export) can show the final
 *   state with CSS alone.
 *
 * Registered automatically by the Astlide integration; exported for users who
 * render code with Shiki themselves.
 */
export function astlideCodeHighlight(): AstlideShikiTransformer {
	return {
		name: "astlide:code-highlight",
		pre(node) {
			const segments = parseHighlightMeta(this.options.meta?.__raw);
			if (!segments) return;
			this.addClassToHast(node, "has-highlighted");
			if (segments.length > 1) node.properties["data-code-steps"] = serializeSegments(segments);
		},
		line(node, line) {
			const segments = parseHighlightMeta(this.options.meta?.__raw);
			if (!segments) return;
			node.properties["data-line"] = line;
			if (isHighlighted(segments[0], line)) this.addClassToHast(node, "highlighted");
			if (segments.length > 1 && isHighlighted(segments[segments.length - 1], line)) {
				this.addClassToHast(node, "highlighted-last");
			}
		},
	};
}
