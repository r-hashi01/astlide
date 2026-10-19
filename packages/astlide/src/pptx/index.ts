/**
 * PowerPoint in: convert a `.pptx` (PowerPoint, Google Slides or Keynote
 * export) into Astlide slides.
 *
 * ```ts
 * import { pptxToSlides } from "@astlide/core/pptx";
 * const deck = pptxToSlides(await readFile("talk.pptx"));
 * deck.slides[0].html; // an Astlide .html slide body
 * ```
 *
 * @module
 */

export {
	type ImportedDeck,
	type ImportedSlide,
	type PptxImportOptions,
	pptxToSlides,
} from "./import";
