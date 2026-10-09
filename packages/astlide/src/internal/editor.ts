/**
 * In-browser slide editor — dev only (`astro dev`).
 *
 * Press `e` to open a panel next to the slide with the current slide's source.
 * Edits are saved automatically shortly after you stop typing (or right away
 * with `Cmd/Ctrl+S`) through the dev server (`internal/editor-server.ts`).
 *
 * Live preview without re-rendering the page: the server turns Astro's
 * post-write full reload into an `astlide:source-saved` HMR event. We then
 * fetch the re-rendered page and patch only the top-level blocks of the slide
 * that actually changed (compared against the previous server HTML, not the
 * live DOM, which fragments and diagrams have modified). Untouched blocks —
 * including rendered diagrams — stay as they are; nothing is re-scaled or
 * faded. Steps are rebuilt and kept at the current position. If the page
 * structure doesn't allow a patch, we fall back to a ClientRouter soft
 * navigation. The panel lives in a `transition:persist` host, so typing
 * (focus, caret, undo) is never interrupted.
 *
 * Adding or removing a slide file sends `astlide:deck-changed` instead: we
 * soft-navigate to the new deck, staying on the same source file (now maybe at
 * a different number), or on the same position if that file was removed.
 *
 * The panel stays open across slide navigation (sessionStorage) and reserves
 * room on the right so the slide scales into the remaining space.
 *
 * DeckLayout imports this behind `import.meta.env.DEV`, so production builds
 * don't include it.
 */

import { trailingSlash } from "@astlide/core/utils/base-path";

const ENDPOINT = "/__astlide/source";
const SOURCE_SAVED_EVENT = "astlide:source-saved";
const DECK_CHANGED_EVENT = "astlide:deck-changed";
/** Coalesce the burst of events after the content store committed a change… */
const DECK_SETTLE_MS = 100;
/** …or, if no event says so, give it this long. */
const DECK_FALLBACK_MS = 1500;
const AUTOSAVE_MS = 400;
const OPEN_KEY = "astlide:editor-open";
const PANEL_WIDTH = "min(42vw, 720px)";

interface EditorState {
	panel: HTMLElement;
	textarea: HTMLTextAreaElement;
	status: HTMLElement;
	path: string;
	saved: string;
}

let state: EditorState | null = null;
let autosaveTimer = 0;
/** Server HTML of each top-level block in `.slide-content`, for diffing. */
let baseline: { url: string; blocks: string[] } | null = null;
let saving: Promise<void> | null = null;

type AstlideWindow = Window & {
	__astlide_resync_steps?: () => void;
	__astlide_resync_notes?: () => void;
	__astlide_navigate?: (url: string, options?: { history?: "replace" }) => void;
	__astlide_step?: { slide: number; step: number };
	__astlide_pending_step?: { slide: number; step: number } | null;
};

/** Where the panel lives: a `transition:persist` host so it survives refreshes. */
function host(): HTMLElement {
	return document.getElementById("astlide-editor-host") ?? document.body;
}

function sourcePath(): string | null {
	return document.body.dataset.sourcePath || null;
}

function isDirty(): boolean {
	return !!state && state.textarea.value !== state.saved;
}

function setStatus(text: string, kind: "info" | "ok" | "error" = "info"): void {
	if (!state) return;
	state.status.textContent = text;
	state.status.dataset.kind = kind;
}

function reserveSpace(open: boolean): void {
	const root = document.documentElement;
	root.toggleAttribute("data-editor", open);
	if (open) root.style.setProperty("--astlide-reserved-right", PANEL_WIDTH);
	else root.style.removeProperty("--astlide-reserved-right");
	// DeckLayout rescales the slide on resize.
	window.dispatchEvent(new Event("resize"));
}

function buildPanel(path: string): EditorState {
	const panel = document.createElement("aside");
	panel.className = "astlide-editor";
	panel.setAttribute("aria-label", "Slide source editor");
	panel.style.width = PANEL_WIDTH;

	const header = document.createElement("header");
	const title = document.createElement("span");
	title.className = "astlide-editor-path";
	title.textContent = path;
	const status = document.createElement("span");
	status.className = "astlide-editor-status";
	const save = document.createElement("button");
	save.type = "button";
	save.textContent = "Save";
	save.title = "Save (Cmd/Ctrl+S)";
	const close = document.createElement("button");
	close.type = "button";
	close.textContent = "✕";
	close.title = "Close (Esc)";
	close.setAttribute("aria-label", "Close editor");
	header.append(title, status, save, close);

	const textarea = document.createElement("textarea");
	textarea.spellcheck = false;
	textarea.setAttribute("aria-label", `Source of ${path}`);

	panel.append(header, textarea);
	applyStyles(panel, header, textarea, status);

	save.addEventListener("click", () => void saveSource());
	close.addEventListener("click", () => toggleEditor(false));
	textarea.addEventListener("keydown", (e) => {
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
			e.preventDefault();
			void saveSource();
		}
		// Esc closes the panel (saving first) — `e` would just type an "e" here.
		if (e.key === "Escape") {
			e.preventDefault();
			toggleEditor(false);
		}
		// Tab inserts two spaces instead of leaving the field.
		if (e.key === "Tab" && !e.shiftKey) {
			e.preventDefault();
			textarea.setRangeText("  ", textarea.selectionStart, textarea.selectionEnd, "end");
		}
	});
	textarea.addEventListener("input", () => {
		setStatus(isDirty() ? "Editing…" : "", "info");
		clearTimeout(autosaveTimer);
		autosaveTimer = window.setTimeout(() => void saveSource(), AUTOSAVE_MS);
	});

	return { panel, textarea, status, path, saved: "" };
}

/** Inline styles keep the panel self-contained (no scoped CSS to match). */
function applyStyles(
	panel: HTMLElement,
	header: HTMLElement,
	textarea: HTMLElement,
	status: HTMLElement,
): void {
	Object.assign(panel.style, {
		position: "fixed",
		top: "0",
		right: "0",
		bottom: "0",
		zIndex: "1200",
		display: "flex",
		flexDirection: "column",
		background: "#1e1e2e",
		color: "#e5e7eb",
		borderLeft: "1px solid rgba(255,255,255,0.12)",
		fontFamily: "system-ui, sans-serif",
	});
	Object.assign(header.style, {
		display: "flex",
		alignItems: "center",
		gap: "0.6rem",
		padding: "0.6rem 0.8rem",
		borderBottom: "1px solid rgba(255,255,255,0.1)",
		fontSize: "0.8rem",
	});
	for (const btn of header.querySelectorAll("button")) {
		Object.assign(btn.style, {
			background: "rgba(255,255,255,0.1)",
			color: "inherit",
			border: "1px solid rgba(255,255,255,0.2)",
			borderRadius: "4px",
			padding: "0.2rem 0.6rem",
			cursor: "pointer",
			font: "inherit",
		});
	}
	const path = header.querySelector<HTMLElement>(".astlide-editor-path");
	if (path)
		Object.assign(path.style, {
			flex: "1",
			fontFamily: "ui-monospace, monospace",
			opacity: "0.8",
			overflow: "hidden",
			textOverflow: "ellipsis",
			whiteSpace: "nowrap",
		});
	Object.assign(status.style, { fontSize: "0.75rem", opacity: "0.8" });
	Object.assign(textarea.style, {
		flex: "1",
		resize: "none",
		border: "none",
		outline: "none",
		padding: "0.9rem 1rem",
		background: "transparent",
		color: "inherit",
		font: "13px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace",
		tabSize: "2",
	});
}

async function loadSource(): Promise<void> {
	if (!state) return;
	const target = state;
	setStatus("Loading…");
	try {
		const res = await fetch(`${ENDPOINT}?path=${encodeURIComponent(target.path)}`, {
			cache: "no-store",
		});
		const body = (await res.json()) as { content?: string; error?: string };
		if (!res.ok || typeof body.content !== "string") throw new Error(body.error ?? res.statusText);
		// The panel may have moved to another slide while this was loading.
		if (state !== target) return;
		target.saved = body.content;
		target.textarea.value = body.content;
		setStatus("");
	} catch (error) {
		if (state === target) setStatus(`Couldn't load: ${(error as Error).message}`, "error");
	}
}

async function saveSource(): Promise<void> {
	if (!state) return;
	clearTimeout(autosaveTimer);
	// Capture what to write *now*: the panel may be retargeted to another slide
	// before an earlier save finishes, and this text belongs to this file.
	const current = state;
	const path = current.path;
	const content = current.textarea.value;
	if (content === current.saved) return;
	// One write at a time.
	if (saving) await saving;
	setStatus("Saving…");
	saving = (async () => {
		try {
			const res = await fetch(ENDPOINT, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ path, content }),
			});
			const body = (await res.json()) as { ok?: boolean; error?: string };
			if (!res.ok || !body.ok) throw new Error(body.error ?? res.statusText);
			current.saved = content;
			if (state === current) setStatus(isDirty() ? "Editing…" : "Saved", "ok");
		} catch (error) {
			if (state === current) setStatus(`Couldn't save: ${(error as Error).message}`, "error");
		} finally {
			saving = null;
		}
	})();
	await saving;
}

async function fetchPage(): Promise<Document> {
	const res = await fetch(location.pathname + location.search, { cache: "no-store" });
	if (!res.ok) throw new Error(res.statusText);
	return new DOMParser().parseFromString(await res.text(), "text/html");
}

function slideContent(doc: Document): HTMLElement | null {
	return doc.querySelector<HTMLElement>("#slide-scaler .slide > .slide-content");
}

function blocksOf(content: HTMLElement): string[] {
	return Array.from(content.children, (el) => el.outerHTML);
}

/** Remember the current slide's server-rendered blocks (before any edit lands). */
async function captureBaseline(): Promise<void> {
	const url = location.pathname;
	try {
		const content = slideContent(await fetchPage());
		if (content && location.pathname === url) baseline = { url, blocks: blocksOf(content) };
	} catch {
		baseline = null;
	}
}

/** Add stylesheets the new render needs (e.g. a component used for the first time). */
function syncHeadStyles(doc: Document): void {
	const present = new Set(
		Array.from(
			document.head.querySelectorAll("style[data-vite-dev-id], link[rel='stylesheet']"),
			(el) => el.getAttribute("data-vite-dev-id") ?? el.getAttribute("href"),
		),
	);
	for (const el of doc.head.querySelectorAll("style[data-vite-dev-id], link[rel='stylesheet']")) {
		const key = el.getAttribute("data-vite-dev-id") ?? el.getAttribute("href");
		if (key && !present.has(key)) document.head.append(document.importNode(el, true));
	}
}

/**
 * Refresh the notes shown in the presenter panel and the notes overlay: copy
 * the server-rendered (frontmatter) notes from `doc`, then let DeckLayout apply
 * a `<Notes>` component from the patched slide, which takes priority.
 */
function syncNotes(doc: Document): void {
	const pairs: Array<[string, string]> = [
		[
			".presenter-notes .notes-content, .presenter-notes .no-notes",
			".presenter-notes .notes-content, .presenter-notes .no-notes",
		],
		["#notes-overlay .notes-body", "#notes-overlay .notes-body"],
	];
	for (const [liveSelector, nextSelector] of pairs) {
		const live = document.querySelector(liveSelector);
		const next = doc.querySelector(nextSelector);
		if (live && next) live.replaceWith(document.importNode(next, true));
	}
	(window as AstlideWindow).__astlide_resync_notes?.();
}

/**
 * Patch the live slide to match `doc`: sync the `.slide` element's attributes
 * (layout class, background…) and replace only the changed run of top-level
 * blocks. Returns false when the structure doesn't allow a patch.
 */
function patchSlide(doc: Document): boolean {
	const liveSlide = document.querySelector<HTMLElement>("#slide-scaler .slide");
	const nextSlide = doc.querySelector<HTMLElement>("#slide-scaler .slide");
	const live = slideContent(document);
	const next = slideContent(doc);
	if (
		!liveSlide ||
		!nextSlide ||
		!live ||
		!next ||
		!baseline ||
		baseline.url !== location.pathname
	) {
		return false;
	}
	if (live.children.length !== baseline.blocks.length) return false;

	for (const { name } of Array.from(liveSlide.attributes)) {
		if (!nextSlide.hasAttribute(name)) liveSlide.removeAttribute(name);
	}
	for (const { name, value } of Array.from(nextSlide.attributes)) {
		if (liveSlide.getAttribute(name) !== value) liveSlide.setAttribute(name, value);
	}

	// Keep the unchanged prefix and suffix; swap the blocks in between.
	const before = baseline.blocks;
	const after = blocksOf(next);
	let head = 0;
	while (head < before.length && head < after.length && before[head] === after[head]) head++;
	let tail = 0;
	while (
		tail < before.length - head &&
		tail < after.length - head &&
		before[before.length - 1 - tail] === after[after.length - 1 - tail]
	) {
		tail++;
	}
	const liveBlocks = Array.from(live.children);
	const anchor = liveBlocks[before.length - tail] ?? null;
	for (const el of liveBlocks.slice(head, before.length - tail)) el.remove();
	for (const el of Array.from(next.children).slice(head, after.length - tail)) {
		live.insertBefore(document.importNode(el, true), anchor);
	}

	baseline = { url: location.pathname, blocks: after };
	return true;
}

/** Apply a saved edit to the slide in place; fall back to a soft navigation. */
async function refreshSlide(): Promise<void> {
	const w = window as AstlideWindow;
	try {
		const doc = await fetchPage();
		syncHeadStyles(doc);
		if (patchSlide(doc)) {
			w.__astlide_resync_steps?.();
			syncNotes(doc);
			// New ```mermaid blocks need rendering; unchanged ones were left alone.
			const { renderDiagrams } = await import("@astlide/core/internal/diagrams");
			void renderDiagrams();
			return;
		}
	} catch {
		// Fall through to a navigation.
	}
	if (!w.__astlide_navigate) {
		location.reload();
		return;
	}
	w.__astlide_pending_step = w.__astlide_step ?? null;
	w.__astlide_navigate(location.pathname + location.search, { history: "replace" });
}

function dirOf(path: string): string {
	return path.slice(0, path.lastIndexOf("/"));
}

/**
 * After slide files were added or removed: navigate to the current source file's
 * new number (keeping the step), or to the same position if it was removed.
 * Every page of the deck now has new totals and outline, so this is a soft
 * navigation rather than a patch.
 */
async function followDeck(): Promise<void> {
	const w = window as AstlideWindow;
	const current = sourcePath();
	const deckUrl = location.pathname.replace(/\/\d+\/?$/, "");
	const here = Number(document.body.dataset.currentSlide) || 1;
	let sources: string[] = [];
	// The dev server may still be settling (error page while modules reload).
	for (let attempt = 0; attempt < 5 && sources.length === 0; attempt++) {
		if (attempt > 0) await new Promise((r) => setTimeout(r, 400));
		try {
			const res = await fetch(`${deckUrl}/1${trailingSlash ? "/" : ""}`, { cache: "no-store" });
			if (!res.ok) continue;
			const doc = new DOMParser().parseFromString(await res.text(), "text/html");
			sources = JSON.parse(doc.body.dataset.deckSources ?? "[]") as string[];
		} catch {
			// Try again.
		}
	}
	if (!w.__astlide_navigate || sources.length === 0) {
		location.reload();
		return;
	}
	const index = current ? sources.indexOf(current) : -1;
	const n = index >= 0 ? index + 1 : Math.min(here, sources.length);
	w.__astlide_pending_step =
		index >= 0 && w.__astlide_step ? { slide: n, step: w.__astlide_step.step } : null;
	w.__astlide_navigate(`${deckUrl}/${n}${trailingSlash ? "/" : ""}${location.search}`, {
		history: "replace",
	});
}

export function toggleEditor(force?: boolean): void {
	const open = force ?? !state;
	if (!open) {
		// Flush a pending autosave before the panel goes away.
		if (isDirty()) void saveSource();
		state?.panel.remove();
		state = null;
		reserveSpace(false);
		sessionStorage.removeItem(OPEN_KEY);
		return;
	}
	const path = sourcePath();
	if (!path || state) return;
	state = buildPanel(path);
	host().append(state.panel);
	reserveSpace(true);
	sessionStorage.setItem(OPEN_KEY, "1");
	void loadSource().then(() => state?.textarea.focus({ preventScroll: true }));
}

/** Called on every page load: keep / retarget / reopen the panel. */
function isEmbedded(): boolean {
	return document.documentElement.hasAttribute("data-embed");
}

export function initEditor(): void {
	// Overview thumbnails and the presenter preview are iframes of slide pages:
	// they never edit or live-refresh.
	if (isEmbedded()) return;
	// Every window showing a slide (audience *and* presenter) keeps the server
	// HTML it was rendered from, so it can patch itself when the slide is saved.
	void captureBaseline();
	// The panel survived the swap (persisted host): retarget it if the slide changed.
	if (state && document.contains(state.panel)) {
		const path = sourcePath();
		if (path && path !== state.path) {
			// Moved to another slide: flush the old file, then point a fresh state
			// at the new one (the old state object keeps its own path for that save).
			if (isDirty()) void saveSource();
			state = { ...state, path, saved: "" };
			const title = state.panel.querySelector(".astlide-editor-path");
			if (title) title.textContent = path;
			state.textarea.setAttribute("aria-label", `Source of ${path}`);
			void loadSource();
		}
		reserveSpace(true);
		return;
	}
	state = null;
	let wasOpen = false;
	try {
		wasOpen = sessionStorage.getItem(OPEN_KEY) === "1";
	} catch {
		// Storage unavailable: start closed.
	}
	if (wasOpen) toggleEditor(true);
	else reserveSpace(false);
}

// The server sends this instead of a full reload after our own writes.
// Refreshes run one after another so quick successive saves apply in order.
let refreshQueue: Promise<void> = Promise.resolve();
// One save can bring several events; keep at most one refresh waiting behind
// the running one, so the last refresh always fetches the settled page.
let refreshWaiting = false;
if (import.meta.hot) {
	import.meta.hot.on(SOURCE_SAVED_EVENT, (data: { path?: string }) => {
		// Only windows showing the saved slide refresh (e.g. the audience window
		// and the presenter window on the same slide); others ignore it.
		if (isEmbedded() || !data?.path || data.path !== sourcePath()) return;
		if (refreshWaiting) return;
		refreshWaiting = true;
		refreshQueue = refreshQueue.then(() => {
			refreshWaiting = false;
			return refreshSlide();
		});
	});

	let deckTimer = 0;
	let deckCommitted = false;
	type DeckChange = { path?: string; removed?: boolean; committed?: boolean };
	import.meta.hot.on(DECK_CHANGED_EVENT, (data: DeckChange) => {
		const current = sourcePath();
		if (isEmbedded() || !data?.path || !current || dirOf(data.path) !== dirOf(current)) return;
		// The open file was deleted: drop its pending autosave, which would
		// otherwise write it back.
		if (data.removed && state?.path === data.path) {
			clearTimeout(autosaveTimer);
			state.saved = state.textarea.value;
		}
		// Earlier reloads (e.g. for the deleted module) arrive before the content
		// store has the change; follow once it has committed.
		if (data.committed) deckCommitted = true;
		clearTimeout(deckTimer);
		deckTimer = window.setTimeout(
			() => {
				deckCommitted = false;
				refreshQueue = refreshQueue.then(followDeck);
			},
			deckCommitted ? DECK_SETTLE_MS : DECK_FALLBACK_MS,
		);
	});
}

// Carry the docked layout into the incoming page so the slide doesn't flash at
// full width before initEditor runs (ClientRouter replaces <html> attributes).
document.addEventListener("astro:before-swap", (event) => {
	if (!state) return;
	const root = (event as Event & { newDocument: Document }).newDocument.documentElement;
	root.setAttribute("data-editor", "");
	root.style.setProperty("--astlide-reserved-right", PANEL_WIDTH);
});

// Warn before reloading or closing the tab while an edit hasn't been saved yet.
window.addEventListener("beforeunload", (e) => {
	if (isDirty()) e.preventDefault();
});
