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

import type { DeckContext } from "../context";
import type { Stroke } from "./globals";

type Point = [number, number];

/** A reveal: what it does when reached and when stepped back over. */
interface StepEvent {
	order: number;
	group: number | null;
	seq: number;
	run: () => void;
	undo: () => void;
}

/** One press of → : events sharing an index happen together. */
interface Step {
	group: number | null;
	events: StepEvent[];
}

/** Messages between the presenter and audience windows (checked by isSyncMessage). */
type SyncMessage =
	| { type: "navigate" | "draw-clear" | "draw-clear-all" | "laser-off"; slide: number }
	| { type: "step"; slide: number; step: number }
	| { type: "laser"; slide: number; x: number; y: number }
	| { type: "draw"; slide: number; stroke: Stroke };

/** One entry of the deck outline (go-to dialog, overview). */
export interface OutlineEntry {
	n: number;
	title: string;
}

/** What the runtime needs to know about the slide page it runs on. */
export interface DeckRuntimeConfig {
	deck: string;
	currentSlide: number;
	totalSlides: number;
	prevSlide: number | null;
	nextSlide: number | null;
	firstSlide: number;
	lastSlide: number;
	/** Slide URLs end with a slash (Astro's `trailingSlash` / directory builds). */
	trailingSlash: boolean;
	/** The site's base path ("" at the domain root). */
	basePath: string;
	outline: OutlineEntry[];
	/** Published as `window.__astlide` for client scripts (see `getClientDeckContext`). */
	deckContext: DeckContext | null;
	/** Keep pen drawings in localStorage. */
	persistDrawings: boolean;
}

export interface DeckRuntimeOptions {
	/**
	 * Client-side navigation of the host framework (Next's router, Astro's
	 * ClientRouter …). Without it the runtime uses `window.__astlide_navigate`
	 * if set, else a full page load.
	 */
	navigate?: (url: string, options: { replace: boolean }) => void;
	/**
	 * In the presenter window, move the slide into the presenter panel
	 * (default). A host that renders it there itself (React) passes false: the
	 * runtime then leaves the DOM to it.
	 */
	placeSlide?: boolean;
}

/**
 * Start the runtime on the current slide page. Returns a function that stops
 * it (also called by the next `mountDeck`).
 */
export function mountDeck(config: DeckRuntimeConfig, options: DeckRuntimeOptions = {}): () => void {
	const {
		trailingSlash,
		currentSlide,
		totalSlides,
		prevSlide,
		nextSlide,
		firstSlide,
		lastSlide,
		deck,
		deckContext,
		outline,
		basePath,
		persistDrawings,
	} = config;
	const { navigate, placeSlide = true } = options;

	// ── 0. Publish typed deck/slide metadata for client scripts ──
	// Replaces parsing document.title / body.dataset. See @astlide/core/context.
	if (deckContext) window.__astlide = deckContext;

	// ── 0. Presenter mode (detected from live URL, works for SSG) ─
	const isPresenter = document.documentElement.hasAttribute("data-presenter");
	// Inside an iframe (overview thumbnail / presenter next-slide preview) the page
	// only renders: no focus grab, keyboard/touch navigation or presenter sync —
	// otherwise a thumbnail would follow the presenter's navigation broadcasts.
	const isEmbedded = document.documentElement.hasAttribute("data-embed");

	// Encode deck name for safe URL construction (SSG value, but encode defensively
	// to prevent open-redirect if the deck directory name contains special characters).
	const deckPath = encodeURIComponent(deck);
	// URL prefix for this deck's slides, including Astro's `base` (sub-path deploys).
	const deckUrl = `${basePath}/${deckPath}`;
	// A slide's URL, following the site's trailing-slash convention (static
	// hosts redirect /deck/3 to /deck/3/ for directory-format builds).
	function slideUrl(n: number, query?: string): string {
		return `${deckUrl}/${n}${trailingSlash ? "/" : ""}${query || ""}`;
	}

	// ── 1. Cleanup from previous page (ClientRouter) ─────────
	if (window.__astlide_cleanup) {
		try {
			window.__astlide_cleanup();
		} catch (_e) {
			/* ignore */
		}
	}

	// ── 2. Navigation helper (uses ClientRouter if available) ─
	function navTo(url: string): void {
		if (navigate) {
			navigate(url, { replace: isEmbedded && !!window.__astlide_embed_host });
			return;
		}
		if (window.__astlide_navigate) {
			// Embedded by <astlide-deck>: replace the history entry, so moving
			// through slides doesn't fill the host page's back button.
			window.__astlide_navigate(
				url,
				isEmbedded && window.__astlide_embed_host ? { history: "replace" } : undefined,
			);
		} else {
			window.location.href = url;
		}
	}

	// ── 3. Viewport scaling ────────────────────────────────────
	const scaler = document.getElementById("slide-scaler");
	const slideEl = scaler ? scaler.querySelector(".slide") : null;

	// Move slide content into presenter area if in presenter mode — unless the
	// host already rendered it there (a framework that owns the DOM, like React).
	if (isPresenter && scaler && placeSlide) {
		const presenterCurrent = document.querySelector(".presenter-current");
		if (presenterCurrent && scaler.parentElement !== presenterCurrent)
			presenterCurrent.appendChild(scaler);
	}

	function updateScale() {
		if (!slideEl || !scaler) return;
		const rootStyle = getComputedStyle(document.documentElement);
		const rawW = rootStyle.getPropertyValue("--slide-width").trim();
		const rawH = rootStyle.getPropertyValue("--slide-height").trim();
		const slideW = parseFloat(rawW) || 1920;
		const slideH = parseFloat(rawH) || 1080;

		let availW: number;
		let availH: number;
		if (isPresenter) {
			const area = document.querySelector(".presenter-current");
			availW = area ? area.clientWidth : window.innerWidth * 0.65;
			availH = area ? area.clientHeight : window.innerHeight;
		} else {
			// The dev editor (e) docks on the right and reserves its width here.
			const reserved = document.documentElement.hasAttribute("data-editor")
				? document.querySelector(".astlide-editor")?.getBoundingClientRect().width || 0
				: 0;
			availW = window.innerWidth - reserved;
			availH = window.innerHeight;
		}

		const scale = Math.min(availW / slideW, availH / slideH);
		scaler.style.width = `${slideW}px`;
		scaler.style.height = `${slideH}px`;
		scaler.style.transform = `scale(${scale})`;
	}

	updateScale();
	window.addEventListener("resize", updateScale);

	// Focus management: move focus to slide content on page load
	// Not while the dev editor is open: a live refresh must leave focus (and the
	// caret) in the editor.
	if (
		scaler &&
		!isPresenter &&
		!isEmbedded &&
		!document.documentElement.hasAttribute("data-editor")
	) {
		scaler.focus({ preventScroll: true });
	}

	// ── 3. Steps: <Fragment> reveals + code highlight steps ─────
	// Everything that changes on → is collected as an *event* with run()/undo().
	// Events are ordered by step number (data-fragment-index; unindexed = 0),
	// ties keep document order. Consecutive events with the same explicit
	// index form one step, so fragments sharing an index reveal together.
	function readIndex(el: Element, attr: string): number | null {
		const raw = el.getAttribute(attr);
		if (raw === null || raw === "") return null;
		const i = parseInt(raw, 10);
		return Number.isNaN(i) ? null : i;
	}

	// Code fences with `{2|3-5|all}` carry data-code-steps="2|3,4,5|*" (see
	// utils/code-highlight.ts). Segment 0 is the initial state rendered at build
	// time; each later segment becomes one event.
	function applyCodeSegment(pre: Element, segment: string | undefined): void {
		const lines = segment === "*" ? null : new Set((segment ?? "").split(",").filter(Boolean));
		for (const line of pre.querySelectorAll(".line[data-line]")) {
			line.classList.toggle(
				"highlighted",
				!lines || lines.has(line.getAttribute("data-line") ?? ""),
			);
		}
	}

	function setFragmentVisible(el: Element, visible: boolean): void {
		if (visible) el.setAttribute("data-fragment-visible", "true");
		else el.removeAttribute("data-fragment-visible");
		el.setAttribute("aria-hidden", visible ? "false" : "true");
	}

	let events: StepEvent[] = [];
	let steps: Step[] = [];

	// Collect steps from the DOM, every fragment / code block in its initial
	// state. Re-run by the dev editor after it patches slide content in place.
	function buildSteps() {
		// <Fragments>: every first-level list item (or direct child) becomes an
		// unindexed fragment with the group's effect.
		for (const group of document.querySelectorAll("[data-fragment-group]")) {
			const listItems = group.querySelectorAll(":scope > ul > li, :scope > ol > li");
			const items = listItems.length > 0 ? listItems : group.children;
			for (const item of items) {
				item.setAttribute("data-fragment", "");
				item.setAttribute(
					"data-fragment-effect",
					group.getAttribute("data-fragment-group") || "fade",
				);
			}
			group.setAttribute("data-fragment-group-ready", "");
		}

		events = [];
		let eventSeq = 0;
		function addEvent(index: number | null, run: () => void, undo: () => void): void {
			events.push({
				order: index ?? 0,
				group: index === null ? null : index,
				seq: eventSeq++,
				run,
				undo,
			});
		}

		for (const el of document.querySelectorAll("[data-fragment], pre[data-code-steps]")) {
			const index = readIndex(el, "data-fragment-index");
			if (el.hasAttribute("data-fragment")) {
				// Fragment.astro omits static aria-hidden so screen readers can access
				// content when JS is unavailable (CSS hides it visually). With JS running,
				// we manage aria-hidden here to match the visual reveal state.
				if (el.hasAttribute("data-fragment-hide")) {
					setFragmentVisible(el, true);
					addEvent(
						index,
						() => setFragmentVisible(el, false),
						() => setFragmentVisible(el, true),
					);
				} else {
					setFragmentVisible(el, false);
					addEvent(
						index,
						() => setFragmentVisible(el, true),
						() => setFragmentVisible(el, false),
					);
					const until = readIndex(el, "data-fragment-until");
					if (until !== null) {
						addEvent(
							until,
							() => setFragmentVisible(el, false),
							() => setFragmentVisible(el, true),
						);
					}
				}
			} else {
				const segments = (el.getAttribute("data-code-steps") ?? "").split("|");
				applyCodeSegment(el, segments[0]);
				for (let i = 1; i < segments.length; i++) {
					addEvent(
						index,
						() => applyCodeSegment(el, segments[i]),
						() => applyCodeSegment(el, segments[i - 1]),
					);
				}
			}
		}
		events.sort((a, b) => a.order - b.order || a.seq - b.seq);

		steps = [];
		for (const event of events) {
			const last = steps[steps.length - 1];
			if (last && event.group !== null && last.group === event.group) last.events.push(event);
			else steps.push({ group: event.group, events: [event] });
		}
	}
	buildSteps();

	let currentStep = -1;

	// Presenter panel: "+N steps" next to the next-slide preview, so the speaker
	// knows whether → reveals more on this slide or moves on.
	const stepsLeftEl = document.getElementById("presenter-steps-left");
	function updateStepsLeft() {
		// Exposed so the dev editor can keep the step across live refreshes.
		window.__astlide_step = { slide: currentSlide, step: currentStep };
		if (!stepsLeftEl) return;
		const left = steps.length - 1 - currentStep;
		stepsLeftEl.hidden = left <= 0;
		stepsLeftEl.textContent = `+${left}${left === 1 ? " step" : " steps"}`;
	}
	updateStepsLeft();

	function showNextStep() {
		if (currentStep < steps.length - 1) {
			currentStep++;
			for (const event of steps[currentStep].events) event.run();
			updateStepsLeft();
			return true;
		}
		return false;
	}

	function showPrevStep() {
		if (currentStep >= 0) {
			const { events: stepEvents } = steps[currentStep];
			for (let i = stepEvents.length - 1; i >= 0; i--) stepEvents[i].undo();
			currentStep--;
			updateStepsLeft();
			return true;
		}
		return false;
	}

	// Jump to a given step (used to mirror the other window's position).
	function goToStep(target: number): void {
		const clamped = Math.max(-1, Math.min(target, steps.length - 1));
		while (currentStep < clamped) showNextStep();
		while (currentStep > clamped) showPrevStep();
	}

	// Dev editor: after slide content is patched in place, rebuild the steps
	// from the new DOM and return to the same step.
	window.__astlide_resync_steps = () => {
		const target = currentStep;
		buildSteps();
		currentStep = -1;
		goToStep(target);
		updateStepsLeft();
	};

	// Next-slide preview: only the presenter window loads the iframe, so the
	// audience view never fetches an extra page. The embedded page scales itself
	// to the iframe's viewport (see updateScale / isEmbedded).
	if (isPresenter && !isEmbedded) {
		const nextFrame = document.querySelector(".presenter-next-frame");
		// The URL comes from the config, not from the page's markup.
		if (nextFrame && nextSlide !== null && !nextFrame.querySelector("iframe")) {
			const iframe = document.createElement("iframe");
			iframe.src = slideUrl(nextSlide);
			iframe.title = "Next slide preview";
			iframe.setAttribute("scrolling", "no");
			iframe.tabIndex = -1;
			nextFrame.appendChild(iframe);
		}
	}

	// ── 4. Presenter sync (BroadcastChannel with fallback) ────
	let syncChannel: BroadcastChannel | null = null;
	try {
		if (!isEmbedded && typeof BroadcastChannel !== "undefined") {
			// Keyed by base path too: two sites on one origin (user.github.io/a, /b) don't share it.
			syncChannel = new BroadcastChannel(`astlide-sync-${basePath}/${deck}`);
			syncChannel.onmessage = (e) => {
				const data = e.data;
				if (!isSyncMessage(data)) return;
				if (data.type === "navigate" && data.slide !== currentSlide) {
					navTo(slideUrl(data.slide, isPresenter ? "?presenter" : ""));
				} else if (data.type === "step") {
					// Mirror fragment / code-step progress. A step for another slide
					// usually means we are still navigating there: keep it for the next
					// page to apply once its steps exist.
					if (data.slide === currentSlide) goToStep(data.step);
					else window.__astlide_pending_step = data;
				} else if (
					data.type === "draw" ||
					data.type === "draw-clear" ||
					data.type === "draw-clear-all" ||
					data.type === "laser" ||
					data.type === "laser-off"
				) {
					receiveDrawing(data);
				}
			};
		}
	} catch (_) {
		// BroadcastChannel not available — each window navigates independently
		syncChannel = null;
	}

	/**
	 * Whether a sync message is well-formed: a slide number of this deck, and
	 * numbers / short strings where numbers / strings are used. Anything else
	 * on the channel (another tab, a stale version) is ignored.
	 */
	/** A pen stroke as drawn and saved: bounded strings, finite numbers. */
	// biome-ignore lint/suspicious/noExplicitAny: checks untrusted data field by field
	function isStroke(s: any): s is Stroke {
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

	// biome-ignore lint/suspicious/noExplicitAny: checks untrusted data field by field
	function isSyncMessage(data: any): data is SyncMessage {
		const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
		if (!data || typeof data !== "object") return false;
		if (!(Number.isInteger(data.slide) && data.slide >= 1 && data.slide <= totalSlides))
			return false;
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

	function broadcastSlide(slideNum: number): void {
		if (syncChannel) {
			try {
				syncChannel.postMessage({ type: "navigate", slide: slideNum });
			} catch (_) {
				/* ignore */
			}
		}
	}

	function postSync(message: SyncMessage): void {
		if (syncChannel) {
			try {
				syncChannel.postMessage(message);
			} catch (_) {
				/* ignore */
			}
		}
	}

	function broadcastStep() {
		if (syncChannel) {
			try {
				syncChannel.postMessage({ type: "step", slide: currentSlide, step: currentStep });
			} catch (_) {
				/* ignore */
			}
		}
	}

	// Apply a step that arrived while this page was still loading.
	const pendingStep = window.__astlide_pending_step;
	window.__astlide_pending_step = null;
	if (pendingStep && pendingStep.slide === currentSlide) goToStep(pendingStep.step);

	// ── 4b. Broadcast on link click (A-3) ──────────────────────
	// Nav buttons and presenter-panel buttons navigate via <a href>, bypassing
	// goNext()/goPrev(). Capture clicks on those links to keep the sibling
	// window in sync.
	function handleNavClick(e: MouseEvent): void {
		const a = (e.target as Element | null)?.closest?.("a.nav-btn, a.pnav-btn");
		if (!a || a.classList.contains("disabled")) return;
		const href = a.getAttribute("href");
		if (!href) return;
		const m = href.match(/\/([^/?#]+)\/(\d+)\/?(?:[?#]|$)/);
		if (!m) return;
		const targetDeck = decodeURIComponent(m[1]);
		const targetSlide = parseInt(m[2], 10);
		if (targetDeck !== deck || Number.isNaN(targetSlide)) return;
		broadcastSlide(targetSlide);
	}
	document.addEventListener("click", handleNavClick, true);

	// ── 5. Navigation ──────────────────────────────────────────
	function goNext() {
		if (showNextStep()) {
			broadcastStep();
			return;
		}
		// nextSlide / prevSlide skip hidden slides in production.
		if (nextSlide) {
			broadcastSlide(nextSlide);
			navTo(slideUrl(nextSlide, isPresenter ? "?presenter" : ""));
		}
	}

	function goPrev() {
		if (showPrevStep()) {
			broadcastStep();
			return;
		}
		if (prevSlide) {
			broadcastSlide(prevSlide);
			navTo(slideUrl(prevSlide, isPresenter ? "?presenter" : ""));
		}
	}

	// ── 6. Overview mode ───────────────────────────────────────
	const overview = document.getElementById("overview");
	const overviewGrid = document.getElementById("overview-grid");
	let overviewOpen = false;

	function openOverview() {
		if (!overview) return;
		overviewOpen = true;
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
				item.setAttribute("role", "listitem");
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

				overviewGrid.appendChild(item);
			}
		}
	}

	function closeOverview() {
		if (!overview) return;
		overviewOpen = false;
		overview.setAttribute("aria-hidden", "true");
		overview.classList.remove("open");
	}

	if (overview)
		overview.addEventListener("click", (e) => {
			if (e.target === overview) closeOverview();
		});

	// ── 6b. Go-to-slide dialog (g) ─────────────────────────────
	const gotoEl = document.getElementById("goto");
	const gotoInput = document.getElementById("goto-input") as HTMLInputElement | null;
	const gotoList = document.getElementById("goto-list");
	let _gotoOpen = false;
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
		_gotoOpen = true;
		gotoInput.value = "";
		gotoActive = Math.max(
			outline.findIndex((s) => s.n === currentSlide),
			0,
		);
		gotoEl.setAttribute("aria-hidden", "false");
		gotoEl.classList.add("open");
		renderGoto();
		gotoInput.focus();
	}

	function closeGoto() {
		if (!gotoEl) return;
		_gotoOpen = false;
		gotoEl.setAttribute("aria-hidden", "true");
		gotoEl.classList.remove("open");
		if (scaler && !isPresenter) scaler.focus({ preventScroll: true });
	}

	function goToSlide(n: number): void {
		closeGoto();
		if (n === currentSlide) return;
		broadcastSlide(n);
		navTo(slideUrl(n, isPresenter ? "?presenter" : ""));
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
		gotoInput.addEventListener("keydown", handleGotoKeydown);
		gotoInput.addEventListener("input", handleGotoInput);
		gotoEl.addEventListener("click", handleGotoClick);
	}

	// ── 6c. Pen & laser pointer (d / l) ─────────────────────────
	// Both overlays live inside #slide-scaler in slide coordinates, so they
	// scale with the slide and line up in every window. Strokes and laser
	// positions are broadcast, so drawing in the presenter window shows on the
	// audience screen (and vice versa). Strokes are kept per slide on `window`,
	// which survives ClientRouter navigations.
	const drawLayer = document.getElementById("draw-layer") as HTMLCanvasElement | null;
	const laserDot = document.getElementById("laser-dot");
	const drawCtx = drawLayer?.getContext ? drawLayer.getContext("2d") : null;
	window.__astlide_drawings ??= {};
	const drawings = window.__astlide_drawings;
	const drawingKey = `${deck}/${currentSlide}`;

	// drawings.persist: keep this deck's strokes in localStorage. The key
	// includes the base path because several sites can share one origin
	// (e.g. user.github.io/<repo>). Loaded once per deck per window.
	const drawingsStorageKey = `astlide:drawings:${basePath}/${deck}`;
	window.__astlide_drawings_loaded ??= {};
	const loadedDecks = window.__astlide_drawings_loaded;
	if (persistDrawings && !loadedDecks[drawingsStorageKey]) {
		loadedDecks[drawingsStorageKey] = true;
		try {
			const saved = JSON.parse(localStorage.getItem(drawingsStorageKey) || "{}");
			// Only this deck's slides, and only well-formed strokes: storage is
			// shared with every page of the origin.
			for (const key of Object.keys(saved)) {
				if (!key.startsWith(`${deck}/`) || Object.hasOwn(drawings, key)) continue;
				const strokes = saved[key];
				if (Array.isArray(strokes) && strokes.every(isStroke)) drawings[key] = strokes;
			}
		} catch (_) {
			/* unavailable or corrupt storage: start empty */
		}
	}
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	function saveDrawings() {
		if (!persistDrawings) return;
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			const deckDrawings: Record<string, Stroke[]> = {};
			for (const key of Object.keys(drawings)) {
				const strokes = drawings[key];
				if (key.startsWith(`${deck}/`) && strokes && strokes.length > 0)
					deckDrawings[key] = strokes;
			}
			try {
				if (Object.keys(deckDrawings).length > 0)
					localStorage.setItem(drawingsStorageKey, JSON.stringify(deckDrawings));
				else localStorage.removeItem(drawingsStorageKey);
			} catch (error) {
				console.warn("[astlide] Could not save drawings", error);
			}
		}, 300);
	}
	let tool: "draw" | "laser" | null = null;
	let activeStroke: Stroke | null = null;
	let laserTimer: ReturnType<typeof setTimeout> | undefined;

	function slideStrokes() {
		drawings[drawingKey] ??= [];
		return drawings[drawingKey];
	}

	function sizeDrawLayer() {
		if (!drawLayer || !scaler) return;
		const w = parseFloat(scaler.style.width) || 1920;
		const h = parseFloat(scaler.style.height) || 1080;
		if (drawLayer.width !== w || drawLayer.height !== h) {
			drawLayer.width = w;
			drawLayer.height = h;
			redrawStrokes();
		}
	}

	function drawSegment(stroke: Stroke, from: Point, to: Point): void {
		if (!drawCtx) return;
		drawCtx.strokeStyle = stroke.color;
		drawCtx.lineWidth = stroke.width;
		drawCtx.lineCap = "round";
		drawCtx.lineJoin = "round";
		drawCtx.beginPath();
		drawCtx.moveTo(from[0], from[1]);
		drawCtx.lineTo(to[0], to[1]);
		drawCtx.stroke();
	}

	function drawStroke(stroke: Stroke): void {
		const pts = stroke.points;
		if (pts.length === 1) drawSegment(stroke, pts[0], pts[0]);
		for (let i = 1; i < pts.length; i++) drawSegment(stroke, pts[i - 1], pts[i]);
	}

	function redrawStrokes() {
		if (!drawCtx || !drawLayer) return;
		drawCtx.clearRect(0, 0, drawLayer.width, drawLayer.height);
		for (const stroke of slideStrokes()) drawStroke(stroke);
	}

	// Pointer position → slide coordinates (undoes the scaler's CSS transform).
	function toSlidePoint(e: PointerEvent): Point {
		if (!drawLayer) return [0, 0];
		const rect = drawLayer.getBoundingClientRect();
		return [
			Math.round(((e.clientX - rect.left) / rect.width) * drawLayer.width),
			Math.round(((e.clientY - rect.top) / rect.height) * drawLayer.height),
		];
	}

	function setTool(next: "draw" | "laser" | null): void {
		tool = tool === next ? null : next;
		window.__astlide_tool = tool;
		if (tool) document.documentElement.setAttribute("data-tool", tool);
		else document.documentElement.removeAttribute("data-tool");
		for (const btn of document.querySelectorAll(
			'.nav-btn[data-action="draw"], .nav-btn[data-action="laser"]',
		)) {
			btn.setAttribute("aria-pressed", String(btn.getAttribute("data-action") === tool));
		}
		if (tool !== "laser") hideLaser(true);
	}

	function clearDrawings(broadcast: boolean): void {
		drawings[drawingKey] = [];
		redrawStrokes();
		saveDrawings();
		if (broadcast) postSync({ type: "draw-clear", slide: currentSlide });
	}

	// Shift+C: every slide of this deck.
	function clearDeckDrawings(broadcast: boolean): void {
		for (const key of Object.keys(drawings)) {
			if (key.startsWith(`${deck}/`)) drawings[key] = [];
		}
		redrawStrokes();
		saveDrawings();
		if (broadcast) postSync({ type: "draw-clear-all", slide: currentSlide });
	}

	function showLaser(point: Point, broadcast: boolean): void {
		if (!laserDot) return;
		laserDot.hidden = false;
		laserDot.style.transform = `translate(${point[0]}px, ${point[1]}px)`;
		clearTimeout(laserTimer);
		// Fade out remote pointers that stop updating (e.g. the window lost focus).
		if (!broadcast)
			laserTimer = setTimeout(() => {
				laserDot.hidden = true;
			}, 2000);
		if (broadcast) postSync({ type: "laser", slide: currentSlide, x: point[0], y: point[1] });
	}

	function hideLaser(broadcast: boolean): void {
		if (laserDot) laserDot.hidden = true;
		if (broadcast) postSync({ type: "laser-off", slide: currentSlide });
	}

	function handleDrawPointerDown(e: PointerEvent): void {
		if (tool !== "draw") return;
		e.preventDefault();
		try {
			drawLayer?.setPointerCapture(e.pointerId);
		} catch (_) {
			/* keep drawing without capture */
		}
		const color =
			getComputedStyle(document.documentElement).getPropertyValue("--astlide-pen-color").trim() ||
			"#ef4444";
		activeStroke = {
			id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
			color,
			width: 6,
			points: [toSlidePoint(e)],
		};
		slideStrokes().push(activeStroke);
		drawStroke(activeStroke);
		postSync({ type: "draw", slide: currentSlide, stroke: activeStroke });
	}

	function handleDrawPointerMove(e: PointerEvent): void {
		if (tool === "laser") {
			showLaser(toSlidePoint(e), true);
			return;
		}
		if (tool !== "draw" || !activeStroke) return;
		const point = toSlidePoint(e);
		const pts = activeStroke.points;
		drawSegment(activeStroke, pts[pts.length - 1], point);
		pts.push(point);
		postSync({
			type: "draw",
			slide: currentSlide,
			stroke: {
				id: activeStroke.id,
				color: activeStroke.color,
				width: activeStroke.width,
				points: [pts[pts.length - 2], point],
			},
		});
	}

	function handleDrawPointerUp() {
		if (activeStroke) saveDrawings();
		activeStroke = null;
	}

	function handleDrawPointerLeave() {
		if (tool === "laser") hideLaser(true);
	}

	// Incoming pen / laser messages from the other window.
	function receiveDrawing(data: SyncMessage): void {
		if (data.type === "draw-clear-all") {
			clearDeckDrawings(false);
			return;
		}
		if (data.slide !== currentSlide) return;
		if (data.type === "laser") showLaser([data.x, data.y], false);
		else if (data.type === "laser-off") hideLaser(false);
		else if (data.type === "draw-clear") clearDrawings(false);
		else if (data.type === "draw") {
			const strokes = slideStrokes();
			let stroke = strokes.find((s) => s.id === data.stroke.id);
			if (!stroke) {
				stroke = {
					id: data.stroke.id,
					color: data.stroke.color,
					width: data.stroke.width,
					points: [],
				};
				strokes.push(stroke);
			}
			const incoming =
				stroke.points.length === 0 ? data.stroke.points : data.stroke.points.slice(1);
			for (const point of incoming) {
				const last = stroke.points[stroke.points.length - 1] || point;
				drawSegment(stroke, last, point);
				stroke.points.push(point);
			}
			saveDrawings();
		}
	}

	if (drawLayer && !isEmbedded) {
		sizeDrawLayer();
		drawLayer.addEventListener("pointerdown", handleDrawPointerDown);
		drawLayer.addEventListener("pointermove", handleDrawPointerMove);
		drawLayer.addEventListener("pointerup", handleDrawPointerUp);
		drawLayer.addEventListener("pointercancel", handleDrawPointerUp);
		drawLayer.addEventListener("pointerleave", handleDrawPointerLeave);
		// Keep the tool active across slide changes.
		if (window.__astlide_tool) setTool(window.__astlide_tool);
	}

	// ── 7. <SpeakerNotes> (or <Notes>) detection ──────────────────────────
	// If <SpeakerNotes> (alias <Notes>) is used in MDX, its HTML content takes priority
	// over frontmatter `notes`. We inject it into presenter notes & notes overlay.

	/**
	 * Client-side HTML sanitizer for Notes content.
	 * Uses DOMParser so scripts never execute during parsing.
	 *
	 * Strategy mirrors the server-side sanitizeHTML() in utils/sanitize.ts:
	 *   1. Remove known-dangerous tags (with content) entirely.
	 *   2. Allowlist safe tags — strip any tag not in the list (promote children).
	 *   3. Keep only allowlisted attributes, and safe URLs in href.
	 */
	function sanitizeNotesHTML(html: string): string {
		const doc = new DOMParser().parseFromString(html, "text/html");

		// 1. Remove dangerous tags entirely (mirrors server-side STRIP_WITH_CONTENT)
		const STRIP_TAGS = [
			"script",
			"style",
			"iframe",
			"object",
			"embed",
			"form",
			"input",
			"textarea",
			"select",
			"button",
			"link",
			"meta",
			"base",
			"applet",
			"frame",
			"frameset",
			"layer",
			"ilayer",
			"bgsound",
		];
		for (const tag of STRIP_TAGS) {
			for (const el of doc.body.querySelectorAll(tag)) el.remove();
		}

		// 2. Allowlist safe tags (mirrors server-side ALLOWED_TAGS set).
		//    Process deepest elements first so nested unknown tags are safely unwrapped.
		const ALLOWED_TAGS = new Set([
			"b",
			"i",
			"em",
			"strong",
			"code",
			"pre",
			"a",
			"ul",
			"ol",
			"li",
			"p",
			"br",
			"h1",
			"h2",
			"h3",
			"h4",
			"h5",
			"h6",
			"blockquote",
			"span",
			"div",
			"hr",
			"table",
			"thead",
			"tbody",
			"tr",
			"th",
			"td",
			"dl",
			"dt",
			"dd",
			"sup",
			"sub",
			"mark",
			"del",
			"ins",
			"kbd",
			"abbr",
			"small",
			"details",
			"summary",
		]);
		Array.from(doc.body.querySelectorAll("*"))
			.reverse()
			.forEach((el) => {
				if (!ALLOWED_TAGS.has(el.tagName.toLowerCase())) {
					el.replaceWith(...Array.from(el.childNodes));
				}
			});

		// 3. Keep only allowlisted attributes (mirrors server-side ALLOWED_ATTRS /
		//    TAG_ATTRS), and only safe URLs in href.
		const ALLOWED_ATTRS = new Set([
			"class",
			"id",
			"title",
			"lang",
			"dir",
			"role",
			"aria-label",
			"aria-hidden",
			"aria-describedby",
			"data-fragment",
			"data-fragment-index",
			"data-fragment-effect",
		]);
		const TAG_ATTRS: Record<string, string[]> = {
			a: ["href", "target", "rel"],
			td: ["colspan", "rowspan"],
			th: ["colspan", "rowspan", "scope"],
			ol: ["start", "type"],
		};
		doc.body.querySelectorAll("*").forEach((el) => {
			const tagAttrs = TAG_ATTRS[el.tagName.toLowerCase()] || [];
			Array.from(el.attributes).forEach((attr) => {
				const name = attr.name.toLowerCase();
				const allowed = ALLOWED_ATTRS.has(name) || tagAttrs.includes(name);
				const safeUrl =
					name !== "href" ||
					// biome-ignore lint/suspicious/noControlCharactersInRegex: strips control characters browsers ignore in a URL scheme
					/^(?:https?:|mailto:|#|\/)/i.test(attr.value.replace(/[\u0000-\u0020]+/g, ""));
				if (!allowed || !safeUrl) el.removeAttribute(attr.name);
			});
		});

		return doc.body.innerHTML;
	}

	// Also re-run by the dev editor after it patches the slide (and the
	// server-rendered notes) in place.
	function applyNotesComponent() {
		const slideNotesEl = document.querySelector("[data-slide-notes]");
		if (slideNotesEl?.innerHTML.trim()) {
			const notesHTML = sanitizeNotesHTML(slideNotesEl.innerHTML);
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

	// ── 8. Notes overlay ───────────────────────────────────────
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

	if (notesClose) notesClose.addEventListener("click", toggleNotes);

	// ── 8b. URL flag toggles (share / print) ───────────────────
	function toggleUrlFlag(flag: string): void {
		const u = new URL(window.location.href);
		if (u.searchParams.has(flag)) u.searchParams.delete(flag);
		else u.searchParams.set(flag, "");
		// Built from the slide number, not `u.pathname`: a path starting with
		// `//` (some static hosts serve one) would make it protocol-relative.
		navTo(slideUrl(currentSlide, u.search) + u.hash);
	}

	// ── 8c. Notes font-size controls (persisted in localStorage) ─
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
	document.addEventListener("click", handleNotesFontClick);

	// ── 8d. Toolbar button actions (C-3) ────────────────────────
	function handleToolbarClick(e: MouseEvent): void {
		const btn = (e.target as Element | null)?.closest?.(".nav-btn[data-action]");
		if (!btn) return;
		e.preventDefault();
		const action = btn.getAttribute("data-action");
		switch (action) {
			case "notes":
				toggleNotes();
				break;
			case "overview":
				openOverview();
				break;
			case "goto":
				openGoto();
				break;
			case "camera":
				window.__astlide_media?.toggleCamera();
				break;
			case "record":
				window.__astlide_media?.toggleRecording();
				break;
			case "draw":
				setTool("draw");
				break;
			case "laser":
				setTool("laser");
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
	document.addEventListener("click", handleToolbarClick);

	// ── 8e. PDF download via @astlide/crispdf (lazy-loaded) ─────
	const pdfOverlay = document.getElementById("pdf-overlay");
	const pdfBar = document.getElementById("pdf-overlay-bar");
	const pdfStatus = document.getElementById("pdf-overlay-status");
	let pdfBusy = false;

	function setPdfStatus(text: string, percent: number): void {
		if (pdfStatus) pdfStatus.textContent = text;
		if (pdfBar && typeof percent === "number")
			pdfBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
	}

	function showPdfOverlay(show: boolean): void {
		if (!pdfOverlay) return;
		pdfOverlay.setAttribute("aria-hidden", String(!show));
		pdfOverlay.classList.toggle("open", !!show);
	}

	async function downloadPdf() {
		if (pdfBusy) return;
		if (!window.__astlide_download_pdf) {
			console.error("[astlide] PDF download module is not available");
			return;
		}
		pdfBusy = true;
		showPdfOverlay(true);
		setPdfStatus("Loading PDF engine…", 0);
		try {
			const { warnings } = await window.__astlide_download_pdf({
				deck,
				onProgress: (done, total) => {
					setPdfStatus(`Rendering slide ${done} / ${total}`, (done / total) * 100);
				},
			});
			setPdfStatus("Saving…", 100);
			if (warnings?.length) {
				console.warn("[astlide] PDF export warnings:", warnings);
			}
		} catch (caught) {
			const err = caught as { message?: string; code?: string } | null;
			console.error("[astlide] PDF export failed:", err);
			// Friendly text ONLY when crispdf truly isn't installed — match the
			// specific Vite/Node "cannot find module" shape, not just any string
			// that happens to contain "crispdf".
			const missingCrispdf =
				err?.message &&
				(err.code === "ERR_MODULE_NOT_FOUND" ||
					/Cannot find (?:module|package) ['"]@astlide\/crispdf/i.test(err.message));
			const msg = missingCrispdf
				? "Install @astlide/crispdf to enable PDF download."
				: "PDF export failed — see console for details.";
			setPdfStatus(msg, 0);
			await new Promise((r) => setTimeout(r, 2500));
		} finally {
			showPdfOverlay(false);
			pdfBusy = false;
		}
	}

	// ── 9. Presenter timer (manual start/pause/reset) ──────────
	const timerEl = document.getElementById("presenter-timer");
	const timerBtn = document.getElementById("timer-btn");
	const timerResetBtn = document.getElementById("timer-reset");
	let timerInterval: ReturnType<typeof setInterval> | null = null;
	let timerRunning = false;
	let timerElapsed = 0;
	let timerStartTime = 0;

	function formatTimer(secs: number): string {
		const m = String(Math.floor(secs / 60)).padStart(2, "0");
		const s = String(secs % 60).padStart(2, "0");
		return `${m}:${s}`;
	}

	if (timerBtn) {
		timerBtn.addEventListener("click", () => {
			if (timerRunning) {
				timerElapsed += Math.floor((Date.now() - timerStartTime) / 1000);
				if (timerInterval) clearInterval(timerInterval);
				timerInterval = null;
				timerRunning = false;
				timerBtn.textContent = "▶";
				timerBtn.title = "Resume timer";
				timerBtn.setAttribute("aria-label", "Resume timer");
			} else {
				timerStartTime = Date.now();
				timerRunning = true;
				timerInterval = setInterval(() => {
					const elapsed = timerElapsed + Math.floor((Date.now() - timerStartTime) / 1000);
					if (timerEl) timerEl.textContent = formatTimer(elapsed);
				}, 1000);
				timerBtn.textContent = "⏸";
				timerBtn.title = "Pause timer";
				timerBtn.setAttribute("aria-label", "Pause timer");
			}
		});
	}

	if (timerResetBtn) {
		timerResetBtn.addEventListener("click", () => {
			if (timerInterval) clearInterval(timerInterval);
			timerInterval = null;
			timerRunning = false;
			timerElapsed = 0;
			timerStartTime = 0;
			if (timerEl) timerEl.textContent = "00:00";
			if (timerBtn) {
				timerBtn.textContent = "▶";
				timerBtn.title = "Start timer";
				timerBtn.setAttribute("aria-label", "Start timer");
			}
		});
	}

	// ── 10. Keyboard shortcuts ──────────────────────────────────
	function handleKeydown(e: KeyboardEvent): void {
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

		if (overviewOpen) {
			if (e.key === "Escape" || e.key === "o") closeOverview();
			return;
		}

		switch (e.key) {
			case "ArrowRight":
			case " ":
				e.preventDefault();
				goNext();
				break;
			case "ArrowLeft":
				e.preventDefault();
				goPrev();
				break;
			case "ArrowUp":
			case "Home":
				e.preventDefault();
				broadcastSlide(firstSlide);
				navTo(slideUrl(firstSlide, isPresenter ? "?presenter" : ""));
				break;
			case "ArrowDown":
			case "End":
				e.preventDefault();
				broadcastSlide(lastSlide);
				navTo(slideUrl(lastSlide, isPresenter ? "?presenter" : ""));
				break;
			case "f":
				if (!isPresenter) document.documentElement.requestFullscreen?.();
				break;
			case "Escape":
				if (tool) setTool(tool);
				else if (document.fullscreenElement) document.exitFullscreen?.();
				else if (notesOpen) toggleNotes();
				break;
			case "o":
				if (!isPresenter) openOverview();
				break;
			case "g":
				e.preventDefault(); // keep the "g" out of the dialog's input
				openGoto();
				break;
			case "d":
				setTool("draw");
				break;
			case "l":
				setTool("laser");
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
				if (tool === "draw") clearDrawings(true);
				break;
			case "C":
				if (tool === "draw") clearDeckDrawings(true);
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
				if (!isPresenter) toggleNotes();
				break;
			case "s":
				if (!isPresenter) toggleUrlFlag("share");
				break;
			case ">":
			case ".":
				if (e.shiftKey) {
					e.preventDefault();
					adjustNotesFontSize(0.1);
				}
				break;
			case "<":
			case ",":
				if (e.shiftKey) {
					e.preventDefault();
					adjustNotesFontSize(-0.1);
				}
				break;
		}
	}

	if (!isEmbedded) document.addEventListener("keydown", handleKeydown);

	// ── 11. Touch / swipe support ──────────────────────────────
	let touchStartX = 0;
	let touchStartY = 0;

	function handleTouchstart(e: TouchEvent): void {
		touchStartX = e.changedTouches[0].clientX;
		touchStartY = e.changedTouches[0].clientY;
	}

	function handleTouchend(e: TouchEvent): void {
		if (tool) return; // drawing / pointing, not swiping
		const dx = e.changedTouches[0].clientX - touchStartX;
		const dy = e.changedTouches[0].clientY - touchStartY;
		if (Math.abs(dx) < 30 && Math.abs(dy) < 30) return;
		if (Math.abs(dx) > Math.abs(dy)) {
			if (dx < 0) goNext();
			else goPrev();
		}
	}

	if (!isEmbedded) {
		document.addEventListener("touchstart", handleTouchstart, { passive: true });
		document.addEventListener("touchend", handleTouchend, { passive: true });
	}

	// ── 11b. Embedding API (<astlide-deck>, @astlide/core/embed) ──
	// Only in a frame, and only for messages from the parent window. The
	// parent's `hello` names the origin we report to; commands only move
	// within this deck. Overview thumbnails and the presenter preview are
	// framed too, but their parent never says hello, so nothing changes there.
	function embedState() {
		return {
			source: "astlide-deck",
			type: "slidechange",
			deck,
			slide: currentSlide,
			total: totalSlides,
			step: currentStep + 1,
			steps: steps.length,
		};
	}

	function postToHost() {
		const host = window.__astlide_embed_host;
		if (!host) return;
		// A "null" host (a file: page, a sandboxed frame) can't be named as the
		// target; the message still only goes to window.parent, and says no
		// more than any page that frames the deck can learn.
		try {
			window.parent.postMessage(embedState(), host === "null" ? "*" : host);
		} catch (_) {
			/* ignore */
		}
	}

	function embedCommand(type: string, slide?: number): void {
		const before = currentStep;
		if (type === "next") goNext();
		else if (type === "prev") goPrev();
		else if (type === "first" && firstSlide !== currentSlide) navTo(slideUrl(firstSlide));
		else if (type === "last" && lastSlide !== currentSlide) navTo(slideUrl(lastSlide));
		else if (
			type === "goto" &&
			slide !== undefined &&
			Number.isInteger(slide) &&
			slide >= 1 &&
			slide <= totalSlides &&
			slide !== currentSlide
		) {
			navTo(slideUrl(slide));
		}
		// A new slide reports itself once loaded; a step change is reported here.
		if (currentStep !== before) postToHost();
	}

	function handleEmbedMessage(e: MessageEvent): void {
		if (e.source !== window.parent) return;
		const data = e.data;
		if (!data || typeof data !== "object" || data.source !== "astlide-embed") return;
		if (data.type === "hello") {
			window.__astlide_embed_host = e.origin;
			postToHost();
			return;
		}
		if (e.origin !== window.__astlide_embed_host) return;
		embedCommand(data.type, data.slide);
	}

	// Keys pressed inside the embedded deck (once a host page has said hello).
	function handleEmbedKeydown(e: KeyboardEvent): void {
		if (!window.__astlide_embed_host || e.altKey || e.ctrlKey || e.metaKey) return;
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
		const type = (
			{
				ArrowRight: "next",
				" ": "next",
				PageDown: "next",
				ArrowLeft: "prev",
				PageUp: "prev",
				Home: "first",
				End: "last",
			} as Record<string, string>
		)[e.key];
		if (!type) return;
		e.preventDefault();
		embedCommand(type);
	}

	if (isEmbedded) {
		window.addEventListener("message", handleEmbedMessage);
		document.addEventListener("keydown", handleEmbedKeydown);
		// After a navigation inside the frame, tell the host where we are.
		postToHost();
	}

	// ── 12. Cleanup (called by the next mount, e.g. after a client-side navigation) ───
	window.__astlide_cleanup = () => {
		document.removeEventListener("keydown", handleKeydown);
		document.removeEventListener("keydown", handleEmbedKeydown);
		window.removeEventListener("message", handleEmbedMessage);
		document.removeEventListener("touchstart", handleTouchstart);
		document.removeEventListener("touchend", handleTouchend);
		document.removeEventListener("click", handleNavClick, true);
		document.removeEventListener("click", handleNotesFontClick);
		document.removeEventListener("click", handleToolbarClick);
		window.removeEventListener("resize", updateScale);
		if (timerInterval) clearInterval(timerInterval);
		if (syncChannel) {
			syncChannel.onmessage = null; // Remove listener to prevent memory leaks
			try {
				syncChannel.close();
			} catch (_e) {
				/* ignore */
			}
		}
	};

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
