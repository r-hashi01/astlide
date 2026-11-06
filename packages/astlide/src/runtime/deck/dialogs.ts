/**
 * The overview of every slide (o) and the go-to-slide dialog (g). While one is
 * open, the page behind it is inert.
 *
 * @module
 */

import type { OutlineEntry } from "../types";
import type { Mount } from "./mount";

export interface Dialogs {
	openOverview(): void;
	closeOverview(): void;
	readonly overviewOpen: boolean;
	openGoto(): void;
}

/** `go`: move to a slide (and tell the other window). */
export function createDialogs(mount: Mount, go: (n: number) => void): Dialogs {
	const { currentSlide, totalSlides, outline } = mount.config;
	const { scaler, isPresenter, isEmbedded, slideUrl } = mount;

	/**
	 * While a dialog is open, the page behind it is inert (no focus, hidden from
	 * screen readers): its siblings, except those inert already. Closing restores
	 * them and returns focus to where it was.
	 */
	const modalState = new Map<
		HTMLElement,
		{ madeInert: HTMLElement[]; returnFocus: Element | null }
	>();
	function setModal(dialog: HTMLElement, open: boolean): void {
		if (open) {
			if (modalState.has(dialog)) return;
			const madeInert: HTMLElement[] = [];
			for (const el of dialog.parentElement?.children ?? []) {
				if (el === dialog || !(el instanceof HTMLElement) || el.inert) continue;
				el.inert = true;
				madeInert.push(el);
			}
			modalState.set(dialog, { madeInert, returnFocus: document.activeElement });
			return;
		}
		const state = modalState.get(dialog);
		if (!state) return;
		modalState.delete(dialog);
		for (const el of state.madeInert) el.inert = false;
		if (state.returnFocus instanceof HTMLElement && state.returnFocus.isConnected)
			state.returnFocus.focus({ preventScroll: true });
	}

	const overview = document.getElementById("overview");
	const overviewGrid = document.getElementById("overview-grid");
	// Built on first open, for this slide (React and Vue keep the grid across slides).
	overviewGrid?.replaceChildren();
	let overviewOpen = false;

	function openOverview() {
		if (!overview) return;
		overviewOpen = true;
		setModal(overview, true);
		overview.setAttribute("aria-hidden", "false");
		overview.classList.add("open");
		if (overviewGrid && overviewGrid.children.length === 0) {
			// The outline lists the slides you can visit (no hidden ones in production).
			const numbers =
				outline.length > 0
					? outline.map((s) => s.n)
					: Array.from({ length: totalSlides }, (_, k) => k + 1);
			for (const i of numbers) {
				const item = document.createElement("a");
				item.href = slideUrl(i);
				item.className = `overview-item${i === currentSlide ? " current" : ""}`;
				item.setAttribute(
					"aria-label",
					`Slide ${i} of ${totalSlides}${i === currentSlide ? " (current)" : ""}`,
				);

				const iframe = document.createElement("iframe");
				iframe.src = slideUrl(i);
				// No sandbox: same-origin frames with scripts can lift any sandbox, so it
				// only added a console warning per slide. The page runs in embed mode
				// (no navigation, keys or sync), like the presenter's next-slide preview.
				iframe.setAttribute("scrolling", "no");
				iframe.tabIndex = -1;
				iframe.setAttribute("aria-hidden", "true");
				item.appendChild(iframe);

				const label = document.createElement("span");
				label.className = "overview-item-label";
				label.textContent = String(i);
				item.appendChild(label);

				const li = document.createElement("li");
				li.appendChild(item);
				overviewGrid.appendChild(li);
			}
		}
		(
			overviewGrid?.querySelector<HTMLElement>(".overview-item.current") ??
			overviewGrid?.querySelector<HTMLElement>(".overview-item")
		)?.focus();
	}

	function closeOverview() {
		if (!overview) return;
		overviewOpen = false;
		overview.setAttribute("aria-hidden", "true");
		overview.classList.remove("open");
		setModal(overview, false);
	}

	if (overview)
		mount.listen(overview, "click", (e) => {
			if (e.target === overview) closeOverview();
		});

	// The go-to-slide dialog (g).
	const gotoEl = document.getElementById("goto");
	const gotoInput = document.getElementById("goto-input") as HTMLInputElement | null;
	const gotoList = document.getElementById("goto-list");
	let gotoOpen = false;
	let gotoMatches: OutlineEntry[] = [];
	let gotoActive = 0;

	function filterOutline(query: string): OutlineEntry[] {
		const q = query.trim().toLowerCase();
		if (!q) return outline;
		const hits = outline.filter(
			(s) => String(s.n).startsWith(q) || s.title.toLowerCase().includes(q),
		);
		// An exact slide number always comes first.
		return hits.sort((a, b) => Number(String(b.n) === q) - Number(String(a.n) === q));
	}

	function renderGoto() {
		if (!gotoInput || !gotoList) return;
		gotoMatches = filterOutline(gotoInput.value);
		gotoActive = Math.min(gotoActive, Math.max(gotoMatches.length - 1, 0));
		gotoList.replaceChildren(
			...gotoMatches.map((s, i) => {
				const li = document.createElement("li");
				li.id = `goto-option-${s.n}`;
				li.className = `goto-option${s.n === currentSlide ? " current" : ""}`;
				li.setAttribute("role", "option");
				li.setAttribute("aria-selected", String(i === gotoActive));
				li.dataset.slide = String(s.n);
				const num = document.createElement("span");
				num.className = "goto-num";
				num.textContent = String(s.n);
				const label = document.createElement("span");
				label.className = "goto-title";
				label.textContent = s.title;
				li.append(num, label);
				return li;
			}),
		);
		const active = gotoMatches[gotoActive];
		if (active) {
			gotoInput.setAttribute("aria-activedescendant", `goto-option-${active.n}`);
			document.getElementById(`goto-option-${active.n}`)?.scrollIntoView({ block: "nearest" });
		} else {
			gotoInput.removeAttribute("aria-activedescendant");
		}
	}

	function openGoto() {
		if (!gotoEl || !gotoInput || !gotoList) return;
		gotoOpen = true;
		gotoInput.value = "";
		gotoActive = Math.max(
			outline.findIndex((s) => s.n === currentSlide),
			0,
		);
		setModal(gotoEl, true);
		gotoEl.setAttribute("aria-hidden", "false");
		gotoEl.classList.add("open");
		renderGoto();
		gotoInput.focus();
	}

	function closeGoto() {
		if (!gotoEl) return;
		gotoOpen = false;
		gotoEl.setAttribute("aria-hidden", "true");
		gotoEl.classList.remove("open");
		setModal(gotoEl, false);
		if (scaler && !isPresenter) scaler.focus({ preventScroll: true });
	}

	function goToSlide(n: number): void {
		closeGoto();
		if (n === currentSlide) return;
		go(n);
	}

	function handleGotoKeydown(e: KeyboardEvent): void {
		switch (e.key) {
			case "ArrowDown":
				e.preventDefault();
				gotoActive = Math.min(gotoActive + 1, gotoMatches.length - 1);
				renderGoto();
				break;
			case "ArrowUp":
				e.preventDefault();
				gotoActive = Math.max(gotoActive - 1, 0);
				renderGoto();
				break;
			case "Enter":
				e.preventDefault();
				if (gotoMatches[gotoActive]) goToSlide(gotoMatches[gotoActive].n);
				break;
			case "Escape":
				e.preventDefault();
				closeGoto();
				break;
		}
	}

	function handleGotoClick(e: MouseEvent): void {
		if (e.target === gotoEl) {
			closeGoto();
			return;
		}
		const option = (e.target as Element | null)?.closest?.<HTMLElement>(".goto-option");
		if (option) goToSlide(parseInt(option.dataset.slide ?? "", 10));
	}

	function handleGotoInput() {
		gotoActive = 0;
		renderGoto();
	}

	if (gotoEl && gotoInput && !isEmbedded) {
		mount.listen(gotoInput, "keydown", handleGotoKeydown);
		mount.listen(gotoInput, "input", handleGotoInput);
		mount.listen(gotoEl, "click", handleGotoClick);
	}

	// An open dialog would otherwise stay open, with the page behind it inert.
	mount.onDispose(() => {
		if (overviewOpen) closeOverview();
		if (gotoOpen) closeGoto();
		for (const dialog of [...modalState.keys()]) setModal(dialog, false);
	});

	return {
		openOverview,
		closeOverview,
		get overviewOpen() {
			return overviewOpen;
		},
		openGoto,
	};
}
