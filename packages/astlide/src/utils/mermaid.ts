/**
 * Mermaid diagrams from ```mermaid code fences.
 *
 * Build time: {@link astlideMermaid} (a Shiki transformer, registered by the
 * integration) turns a `mermaid` fence into `<pre class="astlide-mermaid">` holding
 * the raw diagram source instead of highlighted code. Going through Shiki keeps it
 * working for `.mdx` and `.md` slides with either Markdown processor.
 *
 * Runtime: `internal/diagrams.ts` renders those blocks with `mermaid`, an optional
 * dependency loaded on demand — only pages that contain a diagram fetch it.
 *
 * @module
 */

/** Class on the `<pre>` that carries a diagram's source until it is rendered. */
export const MERMAID_CLASS = "astlide-mermaid";

// Minimal structural types for the Shiki hook we use (see code-highlight.ts).
interface HastRootLike {
	type: "root";
	children: unknown[];
}
interface TransformerContext {
	options: { lang?: string };
	source: string;
}

/** Shiki transformer shape returned by {@link astlideMermaid}. */
export interface AstlideMermaidTransformer {
	name: string;
	root(this: TransformerContext, root: HastRootLike): HastRootLike | undefined;
}

/**
 * Shiki transformer replacing highlighted ```mermaid blocks with
 * `<pre class="astlide-mermaid">source</pre>` for client-side rendering.
 * Exported for users who render code with Shiki themselves.
 */
export function astlideMermaid(): AstlideMermaidTransformer {
	return {
		name: "astlide:mermaid",
		root() {
			if (this.options.lang !== "mermaid") return undefined;
			return {
				type: "root",
				children: [
					{
						type: "element",
						tagName: "pre",
						properties: { className: [MERMAID_CLASS] },
						children: [{ type: "text", value: this.source }],
					},
				],
			};
		},
	};
}

/**
 * Mermaid theme to use for an Astlide deck theme. Dark-background decks (`dark`,
 * `gradient`) get Mermaid's `dark` theme, `forest` maps to Mermaid's `forest`,
 * everything else `default`.
 */
export function mermaidThemeFor(deckTheme: string | undefined): "dark" | "forest" | "default" {
	if (deckTheme === "dark" || deckTheme === "gradient") return "dark";
	if (deckTheme === "forest") return "forest";
	return "default";
}
