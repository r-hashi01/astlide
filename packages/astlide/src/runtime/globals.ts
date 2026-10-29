/**
 * The `window` properties the deck runtime and the slide page's other scripts
 * share. They live on `window` because they must outlive one slide: a
 * client-side navigation mounts the runtime again on the next page.
 *
 * @module
 */

import type { DeckContext } from "../context";

/** A pen stroke in slide coordinates. */
export interface Stroke {
	id: string;
	color: string;
	width: number;
	points: [number, number][];
}

/** The fragment / code step the presenter is on, sent before its slide loads. */
export interface PendingStep {
	slide: number;
	step: number;
}

declare global {
	interface Window {
		/** The current slide's deck context (`getClientDeckContext`). */
		__astlide?: DeckContext;
		/** Stops the runtime of the slide shown before. */
		__astlide_cleanup?: () => void;
		/** Client-side navigation of the host (Astro's ClientRouter). */
		__astlide_navigate?: (url: string, options?: { history?: "replace" }) => void;
		/** Camera bubble and recording (`@astlide/core/runtime/media`). */
		__astlide_media?: { toggleCamera(): void; toggleRecording(): void };
		/** The dev slide editor (`e`). */
		__astlide_editor?: { toggle(): void };
		/** Lazy PDF export (internal/pdf-export). */
		__astlide_download_pdf?: (options: {
			deck: string;
			onProgress?: (done: number, total: number) => void;
		}) => Promise<{ warnings?: string[] }>;
		/** Origin of the page embedding this deck with `<astlide-deck>`. */
		__astlide_embed_host?: string;
		/** Pen strokes by `<deck>/<slide>`, kept across navigations. */
		__astlide_drawings?: Record<string, Stroke[]>;
		/** Storage keys whose saved drawings were loaded in this window. */
		__astlide_drawings_loaded?: Record<string, boolean>;
		/** The active tool, kept across navigations. */
		__astlide_tool?: "draw" | "laser" | null;
		/** Where the presenter is: slide and step. */
		__astlide_step?: { slide: number; step: number };
		/** A step to show once its slide has loaded. */
		__astlide_pending_step?: PendingStep | null;
		/** Rebuild the steps after slide content changed (dev editor). */
		__astlide_resync_steps?: () => void;
		/** Re-read the notes after slide content changed (dev editor). */
		__astlide_resync_notes?: () => void;
	}
}
