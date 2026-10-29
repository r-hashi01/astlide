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
	AstlideSettingsContext,
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
 * The components MDX slides use, by the names an Astlide site gives them:
 * pass it as `components` to a compiled MDX slide (or your MDX provider).
 */
export const mdxComponents = {
	Left,
	Right,
	Columns,
	ImageSide,
	TextPanel,
	Fragment,
	Fragments,
	SpeakerNotes,
	Notes,
	CodeBlock,
	Math,
	YouTube,
	Tweet,
};
