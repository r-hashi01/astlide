/**
 * The deck runtime: everything a slide page does in the browser — scaling the
 * slide to the window, keyboard / touch / toolbar navigation, fragments and
 * code steps, presenter mode and its sync, overview and go-to, pen and laser,
 * speaker notes, the timer, PDF download and the `<astlide-deck>` embedding
 * protocol. Framework-agnostic: a host renders a slide page's markup and
 * calls {@link mountDeck} once the page is in the document (again after each
 * client-side navigation).
 *
 * Experimental: the Astro layout runs on it today; the React, Next.js and
 * Vue packages will too (see the v3 plan), and its options may change until
 * then.
 *
 * @module
 */

import { setUpControls } from "./deck/controls";
import { createDialogs } from "./deck/dialogs";
import { createDrawing, type Drawing } from "./deck/drawing";
import { setUpEmbedBridge } from "./deck/embed";
import { createMount } from "./deck/mount";
import { createMoves } from "./deck/moves";
import { createNavigation } from "./deck/navigation";
import { createNotes } from "./deck/notes";
import { createPdfDownload } from "./deck/pdf";
import { placeSlideInPanel, showNextSlidePreview } from "./deck/presenter";
import { setUpScaling } from "./deck/scale";
import { createSteps } from "./deck/steps";
import { createSync } from "./deck/sync";
import { setUpTimer } from "./deck/timer";
import type { DeckRuntimeConfig, DeckRuntimeOptions } from "./types";

export type { DeckRuntimeConfig, DeckRuntimeOptions, OutlineEntry } from "./types";

/**
 * Start the runtime on the current slide page. Returns a function that stops
 * it (also called by the next `mountDeck`).
 *
 * The features are modules under `deck/`: each adds its listeners and timers
 * through the mount, which removes them all when it's disposed.
 */
export function mountDeck(config: DeckRuntimeConfig, options: DeckRuntimeOptions = {}): () => void {
	// Typed deck / slide metadata for client scripts (see @astlide/core/context).
	if (config.deckContext) window.__astlide = config.deckContext;

	// The previous page's runtime (a client-side navigation).
	if (window.__astlide_cleanup) {
		try {
			window.__astlide_cleanup();
		} catch (_e) {
			/* ignore */
		}
	}

	const { mount, dispose } = createMount(config);
	const navigation = createNavigation(mount, options.navigate);
	placeSlideInPanel(mount, options.placeSlide ?? true);
	setUpScaling(mount);
	const steps = createSteps(mount);
	showNextSlidePreview(mount);
	let drawing: Drawing | undefined;
	const sync = createSync(mount, {
		navigate: (n) => navigation.navTo(mount.modeUrl(n)),
		step: (n) => steps.goTo(n),
		drawing: (message) => drawing?.receive(message),
	});
	const moves = createMoves(mount, { navigation, steps, sync });
	const dialogs = createDialogs(mount, moves.to);
	drawing = createDrawing(mount, sync);
	const notes = createNotes(mount);
	const downloadPdf = createPdfDownload(mount);
	setUpControls(mount, {
		moves,
		navigation,
		dialogs,
		drawing,
		notes,
		downloadPdf: () => void downloadPdf(),
	});
	setUpTimer(mount);
	setUpEmbedBridge(mount, { steps, navigation, goNext: moves.next, goPrev: moves.prev });

	window.__astlide_cleanup = dispose;
	return () => {
		if (window.__astlide_cleanup) {
			window.__astlide_cleanup();
			window.__astlide_cleanup = undefined;
		}
	};
}

/**
 * Mark the document for the page's mode, from the URL: `data-presenter`
 * (`?presenter`, or the presenter popup), `data-print`, `data-share`, and
 * `data-embed` inside an iframe. Call it before {@link mountDeck} (Astro does
 * it in the page head, before the first paint).
 */
export function applyPageFlags(doc: Document = document, search: string = location.search): void {
	let sticky = false;
	try {
		sticky = window.name === "astlide-presenter";
	} catch {
		// cross-origin opener: not the presenter popup
	}
	const params = new URLSearchParams(search);
	const root = doc.documentElement;
	root.toggleAttribute("data-presenter", params.has("presenter") || sticky);
	root.toggleAttribute("data-print", params.has("print"));
	root.toggleAttribute("data-share", params.has("share"));
	root.toggleAttribute("data-embed", window.self !== window.top);
}
