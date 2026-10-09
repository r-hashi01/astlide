/**
 * In-browser slide editor — dev only (`astro dev`).
 *
 * Press `e` to open a panel next to the slide with the current slide's source.
 * Edits are saved automatically shortly after you stop typing (or right away
 * with `Cmd/Ctrl+S`) through the dev server (`internal/editor-server.ts`).
 *
 * Live preview without a full reload: the server turns Astro's post-write
 * full reload into an `astlide:source-saved` HMR event, and we refresh only the
 * page content with a ClientRouter soft navigation. The panel lives in a
 * `transition:persist` host, so typing (focus, caret, undo) isn't interrupted,
 * and the current fragment / code step is carried over.
 *
 * The panel stays open across slide navigation (sessionStorage) and reserves
 * room on the right so the slide scales into the remaining space.
 *
 * DeckLayout imports this behind `import.meta.env.DEV`, so production builds
 * don't include it.
 */

const ENDPOINT = "/__astlide/source";
const SOURCE_SAVED_EVENT = "astlide:source-saved";
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
let saving: Promise<void> | null = null;

type AstlideWindow = Window & {
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

/** Re-render the current page in place (no full reload), keeping the step. */
function refreshSlide(): void {
	const w = window as AstlideWindow;
	if (!w.__astlide_navigate) {
		location.reload();
		return;
	}
	w.__astlide_pending_step = w.__astlide_step ?? null;
	w.__astlide_navigate(location.pathname + location.search, { history: "replace" });
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
export function initEditor(): void {
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
if (import.meta.hot) import.meta.hot.on(SOURCE_SAVED_EVENT, refreshSlide);

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
