/**
 * The deck's controls: the keyboard, the toolbar's buttons and swipes. Every
 * action is defined once, in {@link createActions}; the key map and the
 * toolbar's `data-action` buttons name them.
 *
 * @module
 */

import { TOOLBAR_ACTIONS } from "../chrome";
import type { Dialogs } from "./dialogs";
import type { Drawing } from "./drawing";
import type { Mount } from "./mount";
import type { Moves } from "./moves";
import type { Navigation } from "./navigation";
import type { Notes } from "./notes";

export interface Controls {
	moves: Moves;
	navigation: Navigation;
	dialogs: Dialogs;
	drawing: Drawing;
	notes: Notes;
	downloadPdf(): void;
}

/** What the deck can do from a key or a toolbar button. */
export type ActionName =
	| "next"
	| "prev"
	| "first"
	| "last"
	| "notes"
	| "notes-larger"
	| "notes-smaller"
	| "overview"
	| "goto"
	| "draw"
	| "laser"
	| "clear"
	| "clear-deck"
	| "camera"
	| "record"
	| "presenter"
	| "fullscreen"
	| "enter-fullscreen"
	| "print"
	| "share"
	| "download"
	| "editor"
	| "escape";

/** A key's action. */
interface KeyBinding {
	action: ActionName;
	/** Not in the presenter window. */
	audience?: true;
	/** Only with Shift held. */
	shift?: true;
	/** Keep the key's default (scrolling, typing into the go-to dialog …) from happening. */
	preventDefault?: true;
}

/** The keyboard, by `KeyboardEvent.key`. */
const KEYS: Readonly<Record<string, KeyBinding>> = {
	ArrowRight: { action: "next", preventDefault: true },
	" ": { action: "next", preventDefault: true },
	ArrowLeft: { action: "prev", preventDefault: true },
	ArrowUp: { action: "first", preventDefault: true },
	Home: { action: "first", preventDefault: true },
	ArrowDown: { action: "last", preventDefault: true },
	End: { action: "last", preventDefault: true },
	f: { action: "enter-fullscreen", audience: true },
	Escape: { action: "escape" },
	o: { action: "overview", audience: true },
	g: { action: "goto", preventDefault: true },
	d: { action: "draw" },
	l: { action: "laser" },
	v: { action: "camera" },
	r: { action: "record" },
	e: { action: "editor", audience: true },
	c: { action: "clear" },
	C: { action: "clear-deck" },
	p: { action: "presenter", audience: true },
	n: { action: "notes", audience: true },
	s: { action: "share", audience: true },
	">": { action: "notes-larger", shift: true, preventDefault: true },
	".": { action: "notes-larger", shift: true, preventDefault: true },
	"<": { action: "notes-smaller", shift: true, preventDefault: true },
	",": { action: "notes-smaller", shift: true, preventDefault: true },
};

/** Every action, defined once. */
export function createActions(
	mount: Mount,
	{ moves, navigation, dialogs, drawing, notes, downloadPdf }: Controls,
): Record<ActionName, () => void> {
	const { currentSlide, firstSlide, lastSlide } = mount.config;

	function toggleUrlFlag(flag: string): void {
		const u = new URL(window.location.href);
		if (u.searchParams.has(flag)) u.searchParams.delete(flag);
		else u.searchParams.set(flag, "");
		// Built from the slide number, not `u.pathname`: a path starting with
		// `//` (some static hosts serve one) would make it protocol-relative.
		navigation.navTo(mount.slideUrl(currentSlide, u.search) + u.hash);
	}

	return {
		next: moves.next,
		prev: moves.prev,
		first: () => moves.to(firstSlide),
		last: () => moves.to(lastSlide),
		notes: notes.toggle,
		"notes-larger": () => notes.adjustFontSize(0.1),
		"notes-smaller": () => notes.adjustFontSize(-0.1),
		overview: dialogs.openOverview,
		goto: dialogs.openGoto,
		draw: () => drawing.setTool("draw"),
		laser: () => drawing.setTool("laser"),
		clear: () => {
			if (drawing.tool === "draw") drawing.clear(true);
		},
		"clear-deck": () => {
			if (drawing.tool === "draw") drawing.clearDeck(true);
		},
		camera: () => window.__astlide_media?.toggleCamera(),
		record: () => window.__astlide_media?.toggleRecording(),
		presenter: () => {
			const u = new URL(window.location.href);
			u.searchParams.set("presenter", "");
			window.open(
				u.toString(),
				"astlide-presenter",
				"width=1280,height=800,menubar=no,toolbar=no,status=no",
			);
		},
		fullscreen: () => {
			if (document.fullscreenElement) document.exitFullscreen?.();
			else document.documentElement.requestFullscreen?.();
		},
		"enter-fullscreen": () => document.documentElement.requestFullscreen?.(),
		print: () => toggleUrlFlag("print"),
		share: () => toggleUrlFlag("share"),
		download: downloadPdf,
		// Dev only: the editor module isn't loaded in production builds.
		editor: () => window.__astlide_editor?.toggle(),
		// Put the tool away, else leave fullscreen, else close the notes.
		escape: () => {
			if (drawing.tool) drawing.setTool(drawing.tool);
			else if (document.fullscreenElement) document.exitFullscreen?.();
			else if (notes.open) notes.toggle();
		},
	};
}

export function setUpControls(mount: Mount, controls: Controls): void {
	const { moves, dialogs, drawing } = controls;
	const { isPresenter, isEmbedded } = mount;
	const actions = createActions(mount, controls);

	// The toolbar's action buttons (see TOOLBAR_ACTIONS); `prev` / `next` are links.
	mount.listen(document, "click", (e: MouseEvent) => {
		const btn = (e.target as Element | null)?.closest?.(".nav-btn[data-action]");
		if (!btn) return;
		e.preventDefault();
		const name = btn.getAttribute("data-action") ?? "";
		if (Object.hasOwn(TOOLBAR_ACTIONS, name)) actions[name as ActionName]?.();
	});

	function handleKeydown(e: KeyboardEvent): void {
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
		if (dialogs.overviewOpen) {
			if (e.key === "Escape" || e.key === "o") dialogs.closeOverview();
			return;
		}
		const key = Object.hasOwn(KEYS, e.key) ? KEYS[e.key] : undefined;
		if (!key || (key.audience && isPresenter) || (key.shift && !e.shiftKey)) return;
		if (key.preventDefault) e.preventDefault();
		actions[key.action]();
	}
	if (!isEmbedded) mount.listen(document, "keydown", handleKeydown);

	// Touch: a swipe moves on or back.
	let touchStartX = 0;
	let touchStartY = 0;

	function handleTouchstart(e: TouchEvent): void {
		touchStartX = e.changedTouches[0].clientX;
		touchStartY = e.changedTouches[0].clientY;
	}

	function handleTouchend(e: TouchEvent): void {
		if (drawing.tool) return; // drawing / pointing, not swiping
		const dx = e.changedTouches[0].clientX - touchStartX;
		const dy = e.changedTouches[0].clientY - touchStartY;
		if (Math.abs(dx) < 30 && Math.abs(dy) < 30) return;
		if (Math.abs(dx) > Math.abs(dy)) {
			if (dx < 0) moves.next();
			else moves.prev();
		}
	}

	if (!isEmbedded) {
		mount.listen(document, "touchstart", handleTouchstart, { passive: true });
		mount.listen(document, "touchend", handleTouchend, { passive: true });
	}
}
