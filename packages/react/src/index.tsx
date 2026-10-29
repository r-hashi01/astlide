/**
 * Astlide for React: the slides of an Astlide site as React components.
 *
 * - `<Slide>` and the slide components (`Columns`, `Left` / `Right`,
 *   `Fragment`, `SpeakerNotes` …), with the markup of the Astro ones.
 * - `<DeckPage>`: a slide page with the toolbar, presenter mode and the rest
 *   of the deck runtime.
 * - `mdxComponents`: the names MDX slides use, for the same `.mdx` decks.
 *
 * Styles: `@astlide/core/styles/base.css`, `deck.css`, `slide.css`,
 * `components.css` and a theme (`@astlide/core/styles/themes/<name>.css`).
 *
 * @module
 */

import { CodeBlock } from "./CodeBlock";
import type { AstlideSettings, ImageSideProps } from "./components";
import {
	Columns,
	Fragment,
	Fragments,
	ImageSide,
	Left,
	Math,
	Notes,
	Right,
	SpeakerNotes,
	TextPanel,
	Tweet,
	YouTube,
} from "./components";

export { CodeBlock, type CodeBlockProps } from "./CodeBlock";
export {
	type AstlideSettings,
	Columns,
	type ColumnsProps,
	Fragment,
	type FragmentEffect,
	type FragmentProps,
	Fragments,
	ImageSide,
	type ImageSideProps,
	Left,
	Math,
	type MathProps,
	Notes,
	Right,
	SpeakerNotes,
	TextPanel,
	Tweet,
	type TweetProps,
	YouTube,
	type YouTubeProps,
} from "./components";
export { DeckPage, type DeckPageProps } from "./DeckPage";
export { Slide, type SlideProps } from "./Slide";

/**
 * The components MDX slides use, by the names an Astlide site gives them,
 * with these settings: pass the result as `components` to a compiled MDX
 * slide (or your MDX provider). Works in server and client components.
 */
export function createMdxComponents(settings: AstlideSettings = {}) {
	const hidden = () => null;
	return {
		Left,
		Right,
		Columns,
		// biome-ignore lint/correctness/noComponentHookFactories: a hook-free wrapper with the settings' resolveUrl
		ImageSide: (props: ImageSideProps) => <ImageSide resolveUrl={settings.resolveUrl} {...props} />,
		TextPanel,
		Fragment,
		Fragments,
		SpeakerNotes: settings.notes === false ? hidden : SpeakerNotes,
		Notes: settings.notes === false ? hidden : Notes,
		CodeBlock,
		Math,
		YouTube,
		Tweet,
	};
}

/** {@link createMdxComponents} with the default settings. */
export const mdxComponents = createMdxComponents();
