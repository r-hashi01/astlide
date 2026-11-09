/**
 * What a framework's slide page (`@astlide/react`, `@astlide/vue`) does around
 * the deck runtime, the way an Astro slide page's scripts do.
 *
 * @module
 */

import type { MermaidLoader } from "./diagrams";
import {
	applyPageFlags,
	type DeckRuntimeConfig,
	type DeckRuntimeOptions,
	mountDeck,
} from "./index";

/** How the page moves between slides and draws diagrams. */
export interface DeckPageMountOptions {
	/** The router's navigation (see {@link DeckRuntimeOptions.navigate}). */
	navigate?: DeckRuntimeOptions["navigate"];
	/** `mermaid` for ```mermaid diagrams, or null to show their source. */
	loadMermaid?: MermaidLoader;
}

/**
 * Mount the runtime for one slide: page flags, the `<body>` data exporters
 * read, the runtime itself (leaving the slide where the framework put it),
 * diagrams and the media buttons' state. Call it again for each slide, and
 * when the slide moves to or from the presenter panel. Returns the unmount.
 */
export function mountDeckPage(
	config: DeckRuntimeConfig,
	{ navigate, loadMermaid }: DeckPageMountOptions = {},
): () => void {
	applyPageFlags();
	const body = document.body.dataset;
	body.totalSlides = String(config.totalSlides);
	body.currentSlide = String(config.currentSlide);
	body.deck = config.deck;
	const unmount = mountDeck(config, { placeSlide: false, ...(navigate ? { navigate } : {}) });
	void import("./diagrams").then((m) => m.renderDiagramsWith(loadMermaid));
	void import("./media").then((m) => m.syncMediaUi());
	return unmount;
}

/** What the page's camera, recording and PDF download buttons need. */
export interface DeckPageToolsOptions {
	/** The deck's name (recordings are named after it). */
	deck: string;
	/** Loads the PDF exporter; without it the download button says it isn't available. */
	loadPdfExport?: () => Promise<typeof import("./pdf-export")>;
	/** The deck's print view, which the PDF download captures (`printUrl` in `@astlide/core/runtime/page`). */
	printUrl?: string;
}

/** Set up the camera, recording and the toolbar's PDF download, once per page. */
export function setUpDeckPageTools({ deck, loadPdfExport, printUrl }: DeckPageToolsOptions): void {
	void import("./media").then(({ toggleCamera, toggleRecording }) => {
		window.__astlide_media = {
			toggleCamera,
			toggleRecording: () => toggleRecording(window.__astlide?.deck ?? deck),
		};
	});
	window.__astlide_download_pdf = loadPdfExport
		? async (options) => {
				const mod = await loadPdfExport();
				const result = await mod.exportDeckToPdf({ url: printUrl, ...options });
				mod.downloadBlob(result.blob, `${options.deck}.pdf`);
				return result;
			}
		: undefined;
}
