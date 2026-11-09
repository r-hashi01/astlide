/**
 * Presenter sync: the windows of one deck (presenter and audience) follow each
 * other's slide, step, pen and laser over a BroadcastChannel. Messages are
 * checked: anything else on the channel (another tab, a stale version) is
 * ignored.
 *
 * @module
 */

import type { Stroke } from "../globals";
import type { Mount } from "./mount";

/** Messages between the presenter and audience windows (checked by isSyncMessage). */
export type SyncMessage =
	| { type: "navigate"; slide: number }
	| { type: "draw-clear" | "draw-clear-all" | "laser-off"; slide: number }
	| { type: "step"; slide: number; step: number }
	| { type: "laser"; slide: number; x: number; y: number }
	| { type: "draw"; slide: number; stroke: Stroke };

/** The pen and laser messages. */
export type DrawingMessage = Exclude<SyncMessage, { type: "navigate" } | { type: "step" }>;

/** A pen stroke as drawn and saved: bounded strings, finite numbers. */
// biome-ignore lint/suspicious/noExplicitAny: checks untrusted data field by field
export function isStroke(s: any): s is Stroke {
	const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
	const point = (p: unknown) => Array.isArray(p) && p.length >= 2 && num(p[0]) && num(p[1]);
	return (
		!!s &&
		typeof s === "object" &&
		typeof s.id === "string" &&
		s.id.length <= 64 &&
		typeof s.color === "string" &&
		s.color.length <= 64 &&
		num(s.width) &&
		s.width > 0 &&
		s.width <= 200 &&
		Array.isArray(s.points) &&
		s.points.length <= 100000 &&
		s.points.every(point)
	);
}

/**
 * Whether a sync message is well-formed: a slide number of this deck, and
 * numbers / short strings where numbers / strings are used.
 */
// biome-ignore lint/suspicious/noExplicitAny: checks untrusted data field by field
export function isSyncMessage(data: any, totalSlides: number): data is SyncMessage {
	const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
	if (!data || typeof data !== "object") return false;
	if (!(Number.isInteger(data.slide) && data.slide >= 1 && data.slide <= totalSlides)) return false;
	switch (data.type) {
		case "navigate":
		case "draw-clear":
		case "draw-clear-all":
		case "laser-off":
			return true;
		case "step":
			return Number.isInteger(data.step) && data.step >= -1;
		case "laser":
			return num(data.x) && num(data.y);
		case "draw":
			return isStroke(data.stroke);
		default:
			return false;
	}
}

/** What the other window asked for. */
export interface SyncHandlers {
	navigate(slide: number): void;
	/** A step of this slide. */
	step(step: number): void;
	drawing(message: DrawingMessage): void;
}

export interface Sync {
	/** Tell the other window this one moves to `slide`. */
	slide(slide: number): void;
	/** Tell the other window this slide's step. */
	step(step: number): void;
	post(message: SyncMessage): void;
}

export function createSync(mount: Mount, handlers: SyncHandlers): Sync {
	const { deck, basePath, currentSlide, totalSlides } = mount.config;
	let channel: BroadcastChannel | null = null;
	try {
		if (!mount.isEmbedded && typeof BroadcastChannel !== "undefined") {
			// Keyed by base path too: two sites on one origin (user.github.io/a, /b) don't share it.
			channel = new BroadcastChannel(`astlide-sync-${basePath}/${deck}`);
			channel.onmessage = (e) => {
				const data = e.data;
				if (!isSyncMessage(data, totalSlides)) return;
				if (data.type === "navigate") {
					if (data.slide !== currentSlide) handlers.navigate(data.slide);
				} else if (data.type === "step") {
					// Mirror fragment / code-step progress. A step for another slide
					// usually means we are still navigating there: keep it for the next
					// page to apply once its steps exist.
					if (data.slide === currentSlide) handlers.step(data.step);
					else window.__astlide_pending_step = data;
				} else {
					handlers.drawing(data);
				}
			};
		}
	} catch (_) {
		// BroadcastChannel not available — each window navigates independently
		channel = null;
	}
	mount.onDispose(() => {
		if (!channel) return;
		channel.onmessage = null; // Remove listener to prevent memory leaks
		try {
			channel.close();
		} catch (_e) {
			/* ignore */
		}
	});

	const post = (message: SyncMessage): void => {
		if (!channel) return;
		try {
			channel.postMessage(message);
		} catch (_) {
			/* ignore */
		}
	};
	const sync: Sync = {
		post,
		slide: (slide) => post({ type: "navigate", slide }),
		step: (step) => post({ type: "step", slide: currentSlide, step }),
	};

	// Apply a step that arrived while this page was still loading.
	const pendingStep = window.__astlide_pending_step;
	window.__astlide_pending_step = null;
	if (pendingStep && pendingStep.slide === currentSlide) handlers.step(pendingStep.step);

	// Nav buttons and presenter-panel buttons navigate via <a href>, bypassing
	// goNext()/goPrev(). Capture clicks on those links to keep the sibling
	// window in sync.
	mount.listen(
		document,
		"click",
		(e: MouseEvent) => {
			const a = (e.target as Element | null)?.closest?.("a.nav-btn, a.pnav-btn");
			if (!a || a.classList.contains("disabled")) return;
			const href = a.getAttribute("href");
			if (!href) return;
			const m = href.match(/\/([^/?#]+)\/(\d+)\/?(?:[?#]|$)/);
			if (!m) return;
			const targetDeck = decodeURIComponent(m[1]);
			const targetSlide = parseInt(m[2], 10);
			if (targetDeck !== deck || Number.isNaN(targetSlide)) return;
			sync.slide(targetSlide);
		},
		true,
	);
	return sync;
}
