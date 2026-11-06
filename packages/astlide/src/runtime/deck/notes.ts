/**
 * Speaker notes: a slide's `<SpeakerNotes>` (or `<Notes>`) shown in the
 * presenter panel and the notes overlay, the overlay itself (n), and the
 * notes font size (kept in localStorage).
 *
 * @module
 */

import { sanitizeNotesHtml } from "../notes-sanitize";
import type { Mount } from "./mount";

export interface Notes {
	/** Open or close the notes overlay. */
	toggle(): void;
	readonly open: boolean;
	/** Change the notes font size by `delta` rem. */
	adjustFontSize(delta: number): void;
}

export function createNotes(mount: Mount): Notes {
	// If <SpeakerNotes> (alias <Notes>) is used in MDX, its HTML content takes priority
	// over frontmatter `notes`. We inject it into presenter notes & notes overlay.

	// Also re-run by the dev editor after it patches the slide (and the
	// server-rendered notes) in place.
	function applyNotesComponent() {
		const slideNotesEl = document.querySelector("[data-slide-notes]");
		if (slideNotesEl?.innerHTML.trim()) {
			const notesHTML = sanitizeNotesHtml(slideNotesEl.innerHTML);
			// Update presenter notes panel
			const presenterNotesContent = document.querySelector(".presenter-notes .notes-content");
			const presenterNoNotes = document.querySelector(".presenter-notes .no-notes");
			if (presenterNotesContent) {
				presenterNotesContent.innerHTML = notesHTML;
			} else if (presenterNoNotes) {
				const div = document.createElement("div");
				div.className = "notes-content";
				div.innerHTML = notesHTML;
				presenterNoNotes.replaceWith(div);
			}
			// Update notes overlay body
			const notesBody = document.querySelector(".notes-body");
			if (notesBody) {
				notesBody.innerHTML = notesHTML;
			}
		}
	}
	applyNotesComponent();
	window.__astlide_resync_notes = applyNotesComponent;
	mount.onDispose(() => {
		if (window.__astlide_resync_notes === applyNotesComponent)
			window.__astlide_resync_notes = undefined;
	});

	const notesOverlay = document.getElementById("notes-overlay");
	const notesClose = document.getElementById("notes-close");
	let notesOpen = false;

	function toggleNotes() {
		if (!notesOverlay) return;
		notesOpen = !notesOpen;
		notesOverlay.setAttribute("aria-hidden", String(!notesOpen));
		// Closed, it only slides off-screen: inert keeps its close button out of the Tab order.
		notesOverlay.inert = !notesOpen;
		notesOverlay.classList.toggle("open", notesOpen);
	}

	if (notesClose) mount.listen(notesClose, "click", toggleNotes);

	function applyNotesFontSize(size: number): void {
		const clamped = Math.max(0.7, Math.min(2.0, size));
		document.documentElement.style.setProperty("--astlide-notes-font-size", `${clamped}rem`);
		try {
			localStorage.setItem("astlide:notes-font-size", String(clamped));
		} catch (_) {}
	}
	try {
		const stored = parseFloat(localStorage.getItem("astlide:notes-font-size") || "");
		if (!Number.isNaN(stored) && stored > 0) applyNotesFontSize(stored);
	} catch (_) {}
	function adjustNotesFontSize(delta: number): void {
		const current =
			parseFloat(
				getComputedStyle(document.documentElement).getPropertyValue("--astlide-notes-font-size") ||
					"1",
			) || 1;
		applyNotesFontSize(current + delta);
	}
	function handleNotesFontClick(e: MouseEvent): void {
		const btn = (e.target as Element | null)?.closest?.("[data-notes-font]");
		if (!btn) return;
		const op = btn.getAttribute("data-notes-font");
		if (op === "inc") adjustNotesFontSize(0.1);
		else if (op === "dec") adjustNotesFontSize(-0.1);
		else if (op === "reset") applyNotesFontSize(1);
	}
	mount.listen(document, "click", handleNotesFontClick);

	return {
		toggle: toggleNotes,
		get open() {
			return notesOpen;
		},
		adjustFontSize: adjustNotesFontSize,
	};
}
