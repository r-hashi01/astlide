/**
 * The deck's controls: the keyboard, the toolbar's buttons and swipes.
 *
 * @module
 */

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

export function setUpControls(
	mount: Mount,
	{ moves, navigation, dialogs, drawing, notes, downloadPdf }: Controls,
): void {
	const { currentSlide, firstSlide, lastSlide } = mount.config;
	const { isPresenter, isEmbedded, slideUrl } = mount;
	const { navTo } = navigation;

	function toggleUrlFlag(flag: string): void {
		const u = new URL(window.location.href);
		if (u.searchParams.has(flag)) u.searchParams.delete(flag);
		else u.searchParams.set(flag, "");
		// Built from the slide number, not `u.pathname`: a path starting with
		// `//` (some static hosts serve one) would make it protocol-relative.
		navTo(slideUrl(currentSlide, u.search) + u.hash);
	}

	function handleToolbarClick(e: MouseEvent): void {
		const btn = (e.target as Element | null)?.closest?.(".nav-btn[data-action]");
		if (!btn) return;
		e.preventDefault();
		const action = btn.getAttribute("data-action");
		switch (action) {
			case "notes":
				notes.toggle();
				break;
			case "overview":
				dialogs.openOverview();
				break;
			case "goto":
				dialogs.openGoto();
				break;
			case "camera":
				window.__astlide_media?.toggleCamera();
				break;
			case "record":
				window.__astlide_media?.toggleRecording();
				break;
			case "draw":
				drawing.setTool("draw");
				break;
			case "laser":
				drawing.setTool("laser");
				break;
			case "presenter": {
				const u = new URL(window.location.href);
				u.searchParams.set("presenter", "");
				window.open(
					u.toString(),
					"astlide-presenter",
					"width=1280,height=800,menubar=no,toolbar=no,status=no",
				);
				break;
			}
			case "fullscreen": {
				if (document.fullscreenElement) document.exitFullscreen?.();
				else document.documentElement.requestFullscreen?.();
				break;
			}
			case "print":
				toggleUrlFlag("print");
				break;
			case "share":
				toggleUrlFlag("share");
				break;
			case "download":
				downloadPdf();
				break;
		}
	}
	mount.listen(document, "click", handleToolbarClick);

	function handleKeydown(e: KeyboardEvent): void {
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

		if (dialogs.overviewOpen) {
			if (e.key === "Escape" || e.key === "o") dialogs.closeOverview();
			return;
		}

		switch (e.key) {
			case "ArrowRight":
			case " ":
				e.preventDefault();
				moves.next();
				break;
			case "ArrowLeft":
				e.preventDefault();
				moves.prev();
				break;
			case "ArrowUp":
			case "Home":
				e.preventDefault();
				moves.to(firstSlide);
				break;
			case "ArrowDown":
			case "End":
				e.preventDefault();
				moves.to(lastSlide);
				break;
			case "f":
				if (!isPresenter) document.documentElement.requestFullscreen?.();
				break;
			case "Escape":
				if (drawing.tool) drawing.setTool(drawing.tool);
				else if (document.fullscreenElement) document.exitFullscreen?.();
				else if (notes.open) notes.toggle();
				break;
			case "o":
				if (!isPresenter) dialogs.openOverview();
				break;
			case "g":
				e.preventDefault(); // keep the "g" out of the dialog's input
				dialogs.openGoto();
				break;
			case "d":
				drawing.setTool("draw");
				break;
			case "l":
				drawing.setTool("laser");
				break;
			case "v":
				if (window.__astlide_media) window.__astlide_media.toggleCamera();
				break;
			case "r":
				if (window.__astlide_media) window.__astlide_media.toggleRecording();
				break;
			case "e":
				// Dev only: the editor module isn't loaded in production builds.
				if (window.__astlide_editor && !isPresenter) window.__astlide_editor.toggle();
				break;
			case "c":
				if (drawing.tool === "draw") drawing.clear(true);
				break;
			case "C":
				if (drawing.tool === "draw") drawing.clearDeck(true);
				break;
			case "p":
				if (!isPresenter) {
					const u = new URL(window.location.href);
					u.searchParams.set("presenter", "");
					window.open(
						u.toString(),
						"astlide-presenter",
						"width=1280,height=800,menubar=no,toolbar=no,status=no",
					);
				}
				break;
			case "n":
				if (!isPresenter) notes.toggle();
				break;
			case "s":
				if (!isPresenter) toggleUrlFlag("share");
				break;
			case ">":
			case ".":
				if (e.shiftKey) {
					e.preventDefault();
					notes.adjustFontSize(0.1);
				}
				break;
			case "<":
			case ",":
				if (e.shiftKey) {
					e.preventDefault();
					notes.adjustFontSize(-0.1);
				}
				break;
		}
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
