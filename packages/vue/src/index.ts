/**
 * Astlide for Vue: the slides of an Astlide site as Vue components.
 *
 * - `Slide` and the slide components (`Columns`, `Left` / `Right`,
 *   `Fragment`, `SpeakerNotes` …), with the markup of the Astro ones.
 * - `DeckPage`: a slide page with the toolbar, presenter mode and the rest of
 *   the deck runtime.
 * - `createMdxComponents`: the names MDX slides use, for the same `.mdx`
 *   decks (compile them with `compileMdxComponent` from `@astlide/vue/server`).
 *
 * Styles: `@astlide/core/styles/base.css`, `deck.css`, `slide.css`,
 * `components.css`, a theme, and `katex/dist/katex.min.css` for `Math`.
 *
 * @module
 */

import { h } from "vue";
import {
	type AstlideSettings,
	CodeBlock,
	Columns,
	Fragment,
	Fragments,
	ImageSide,
	type ImageSideProps,
	Left,
	Math,
	Notes,
	Right,
	SpeakerNotes,
	TextPanel,
	Tweet,
	YouTube,
} from "./components";

export {
	type AstlideSettings,
	CodeBlock,
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
export { DeckPage } from "./DeckPage";
export { Slide } from "./Slide";

/**
 * The components MDX slides use, by the names an Astlide site gives them,
 * with these settings: pass the result as `components` to a compiled MDX slide.
 */
export function createMdxComponents(settings: AstlideSettings = {}) {
	const hidden = () => null;
	const ImageSideWithSettings = (props: ImageSideProps) =>
		h(ImageSide, { resolveUrl: settings.resolveUrl, ...props });
	ImageSideWithSettings.props = ImageSide.props;
	return {
		Left,
		Right,
		Columns,
		ImageSide: ImageSideWithSettings,
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
