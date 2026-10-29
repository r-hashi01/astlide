/**
 * Server-side helpers: MDX slides to HTML with Astlide's React components,
 * e.g. for `renderDeck({ renderMdx: renderMdxToHtml })` (PPTX / PDF / PNG of
 * an MDX deck without a build). Not for the browser.
 *
 * @module
 */

import { evaluateSlideMdx, type SlideMdxOptions } from "@astlide/core/deck";
import { type ComponentType, createElement } from "react";
import * as runtime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import type { AstlideSettings } from "./components";
import { createMdxComponents } from "./index";

/**
 * An MDX slide's HTML, rendered with Astlide's components (`createMdxComponents`). Runs the slide's
 * code: only for slides you trust.
 */
export async function renderMdxToHtml(
	source: string,
	options: SlideMdxOptions & { settings?: AstlideSettings } = {},
): Promise<string> {
	const { default: Content } = (await evaluateSlideMdx(source, runtime as never, options)) as {
		default: ComponentType<{ components: ReturnType<typeof createMdxComponents> }>;
	};
	return renderToStaticMarkup(
		createElement(Content, { components: createMdxComponents(options.settings) }),
	);
}
