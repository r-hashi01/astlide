/**
 * Server-side helpers: MDX slides to HTML with Astlide's Vue components, e.g.
 * for `renderDeck({ renderMdx: renderMdxToHtml })`. Not for the browser.
 *
 * @module
 */

import { evaluateSlideMdx, type SlideMdxOptions } from "@astlide/core/deck";
import { type Component, h } from "vue";
import * as runtime from "vue/jsx-runtime";
import { renderToString } from "vue/server-renderer";
import type { AstlideSettings } from "./components";
import { createMdxComponents } from "./index";

/** Compile an MDX slide for Vue: its component (pass Astlide's components as `components`). */
export async function compileMdxComponent(
	source: string,
	options: SlideMdxOptions = {},
): Promise<Component> {
	const mod = (await evaluateSlideMdx(source, runtime as never, {
		...options,
		jsxImportSource: "vue",
	})) as {
		default: Component;
	};
	return mod.default;
}

/** An MDX slide's HTML, rendered with Astlide's Vue components. Runs the slide's code. */
export async function renderMdxToHtml(
	source: string,
	options: SlideMdxOptions & { settings?: AstlideSettings } = {},
): Promise<string> {
	const Content = await compileMdxComponent(source, options);
	const html = await renderToString(
		h(Content, { components: createMdxComponents(options.settings) }),
	);
	// Vue marks fragments with comments for hydration; static HTML doesn't need them.
	// Until none is left: removing one must not leave another behind.
	let out = html;
	for (let prev = ""; prev !== out; ) {
		prev = out;
		out = out.replace(/<!--\[-->|<!--\]-->/g, "");
	}
	return out;
}
