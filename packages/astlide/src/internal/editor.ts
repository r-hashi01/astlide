/**
 * In-browser slide editor — dev only (`astro dev`).
 *
 * Press `e` to open a panel next to the slide with the current slide's source
 * file. `Cmd/Ctrl+S` (or Save) writes it through the dev server
 * (`internal/editor-server.ts`); Astro then reloads the slide. The panel stays
 * open across slide navigation (sessionStorage) and reserves room on the right
 * so the slide scales into the remaining space.
 *
 * DeckLayout imports this behind `import.meta.env.DEV`, so production builds
 * don't include it.
 */

const ENDPOINT = "/__astlide/source";
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
	close.title = "Close (e)";
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
		if (e.key === "Escape") {
			e.preventDefault();
			textarea.blur();
		}
		// Tab inserts two spaces instead of leaving the field.
		if (e.key === "Tab" && !e.shiftKey) {
			e.preventDefault();
			textarea.setRangeText("  ", textarea.selectionStart, textarea.selectionEnd, "end");
		}
	});
	textarea.addEventListener("input", () => setStatus(isDirty() ? "Unsaved" : "", "info"));

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
	setStatus("Loading…");
	try {
		const res = await fetch(`${ENDPOINT}?path=${encodeURIComponent(state.path)}`, {
			cache: "no-store",
		});
		const body = (await res.json()) as { content?: string; error?: string };
		if (!res.ok || typeof body.content !== "string") throw new Error(body.error ?? res.statusText);
		state.saved = body.content;
		state.textarea.value = body.content;
		setStatus("");
	} catch (error) {
		setStatus(`Couldn't load: ${(error as Error).message}`, "error");
	}
}

async function saveSource(): Promise<void> {
	if (!state) return;
	const content = state.textarea.value;
	setStatus("Saving…");
	try {
		const res = await fetch(ENDPOINT, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ path: state.path, content }),
		});
		const body = (await res.json()) as { ok?: boolean; error?: string };
		if (!res.ok || !body.ok) throw new Error(body.error ?? res.statusText);
		state.saved = content;
		setStatus("Saved", "ok");
	} catch (error) {
		setStatus(`Couldn't save: ${(error as Error).message}`, "error");
	}
}

export function toggleEditor(force?: boolean): void {
	const open = force ?? !state;
	if (!open) {
		if (isDirty() && !window.confirm("Discard unsaved changes?")) return;
		state?.panel.remove();
		state = null;
		reserveSpace(false);
		sessionStorage.removeItem(OPEN_KEY);
		return;
	}
	const path = sourcePath();
	if (!path || state) return;
	state = buildPanel(path);
	document.body.append(state.panel);
	reserveSpace(true);
	sessionStorage.setItem(OPEN_KEY, "1");
	void loadSource().then(() => state?.textarea.focus({ preventScroll: true }));
}

/** Called on every page load: reopen the panel for the new slide if it was open. */
export function initEditor(): void {
	// The panel element was swapped away with the old page; drop the stale state.
	if (state && !document.body.contains(state.panel)) state = null;
	let wasOpen = false;
	try {
		wasOpen = sessionStorage.getItem(OPEN_KEY) === "1";
	} catch {
		// Storage unavailable: start closed.
	}
	if (wasOpen) toggleEditor(true);
	else reserveSpace(false);
}

// Warn before reloading or closing the tab with unsaved edits. (Moving to
// another slide drops them; the status line shows "Unsaved" while typing.)
window.addEventListener("beforeunload", (e) => {
	if (isDirty()) e.preventDefault();
});
