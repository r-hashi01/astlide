/**
 * `<astlide-deck>` — show a built Astlide deck inside any page.
 *
 * A framework-agnostic custom element: it loads the deck in an iframe at 16:9
 * (sized by its container's width) and drives it over a small `postMessage`
 * protocol. Works in plain HTML, Markdown/MDX pages, and any framework; see
 * `@astlide/core/embed/react` and `@astlide/core/embed/vue` for thin wrappers
 * and `@astlide/core/components/DeckEmbed.astro` for Astro sites.
 *
 * ```html
 * <script type="module">import "@astlide/core/embed";</script>
 * <astlide-deck src="/my-talk/" start="2" controls></astlide-deck>
 * ```
 *
 * Importing the module registers the element (in browsers only — it is safe to
 * import during SSR).
 *
 * ## Protocol
 *
 * Messages are plain objects. The host page sends
 * `{ source: "astlide-embed", type: "hello" | "next" | "prev" | "goto", slide? }`
 * to the iframe, targeted at the deck's origin. The deck page only listens when
 * it is framed, only to its parent window, and answers to the origin that sent
 * `hello` with `{ source: "astlide-deck", type: "slidechange", deck, slide, total, step, steps }`.
 * The element in turn only accepts messages from its own iframe and the deck's origin.
 *
 * @module
 */

/** `source` of messages the host page sends to the deck. */
export const EMBED_SOURCE = "astlide-embed";
/** `source` of messages the deck sends back to the host page. */
export const DECK_SOURCE = "astlide-deck";

/** Detail of the `slidechange` event fired by `<astlide-deck>`. */
export interface SlideChangeDetail {
	/** Deck name (its directory under `src/content/decks/`). */
	deck: string;
	/** Current slide number, 1-based. */
	slide: number;
	/** Number of slides in the deck. */
	total: number;
	/** Steps (fragments / code steps) revealed on the current slide, `0` when none. */
	step: number;
	/** Number of steps the current slide has. */
	steps: number;
}

/** A command the host page sends to an embedded deck. */
export type EmbedCommand =
	| { source: typeof EMBED_SOURCE; type: "hello" | "next" | "prev" | "first" | "last" }
	| { source: typeof EMBED_SOURCE; type: "goto"; slide: number };

/**
 * The URL of slide `n` of the deck whose root URL is `src`, following `src`'s
 * trailing-slash style: `"/talk/"` → `"/talk/3/"`, `"/talk"` → `"/talk/3"`.
 * A query string or hash on `src` is kept.
 *
 * @example
 * slideSrc("/astlide/my-talk/", 2); // → "/astlide/my-talk/2/"
 */
export function slideSrc(src: string, n: number): string {
	const cut = src.search(/[?#]/);
	const path = cut === -1 ? src : src.slice(0, cut);
	const rest = cut === -1 ? "" : src.slice(cut);
	const slash = path.endsWith("/");
	const slide = Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
	return `${path.replace(/\/+$/, "")}/${slide}${slash ? "/" : ""}${rest}`;
}

/** Parse a `slidechange` message from a deck, or `null` when it isn't one. */
export function parseDeckMessage(data: unknown): SlideChangeDetail | null {
	if (!data || typeof data !== "object") return null;
	const d = data as Record<string, unknown>;
	if (d.source !== DECK_SOURCE || d.type !== "slidechange") return null;
	const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
	return {
		deck: typeof d.deck === "string" ? d.deck : "",
		slide: num(d.slide),
		total: num(d.total),
		step: num(d.step),
		steps: num(d.steps),
	};
}

const STYLE = `
:host {
	display: block;
	position: relative;
	width: 100%;
	color-scheme: dark;
	font: 14px/1.2 system-ui, sans-serif;
}
:host([hidden]) { display: none; }
.frame {
	position: relative;
	width: 100%;
	aspect-ratio: var(--astlide-aspect-ratio, 16 / 9);
	background: #000;
	overflow: hidden;
}
iframe {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	border: 0;
}
.controls {
	display: none;
	align-items: center;
	gap: 0.25rem;
	padding: 0.25rem;
	background: #111;
	color: #eee;
}
:host([controls]) .controls { display: flex; }
button {
	all: unset;
	cursor: pointer;
	padding: 0.25rem 0.6rem;
	border-radius: 4px;
	line-height: 1;
}
button:hover, button:focus-visible { background: rgba(255,255,255,0.15); }
button:focus-visible { outline: 2px solid #3b82f6; }
.counter { font-variant-numeric: tabular-nums; padding: 0 0.5rem; opacity: 0.8; }
.spacer { flex: 1; }
:host(:fullscreen) {
	display: flex;
	flex-direction: column;
	justify-content: center;
	background: #000;
	container-type: size;
	--bar: 0px;
}
:host([controls]:fullscreen) { --bar: 2.5rem; }
:host(:fullscreen) .frame {
	width: min(100cqw, calc((100cqh - var(--bar)) * (var(--astlide-aspect-ratio, 16 / 9))));
	margin: 0 auto;
}
`;

// Server-side (Node / SSR) there is no HTMLElement; a stand-in base keeps the
// class definition — and so this module — importable there.
const Base: typeof HTMLElement =
	typeof HTMLElement === "undefined" ? (class {} as unknown as typeof HTMLElement) : HTMLElement;

/**
 * The `<astlide-deck>` element.
 *
 * Attributes (each also a property):
 * - `src` — URL of the deck root (`/my-talk/`, `https://example.com/talks/my-talk/`).
 *   Its trailing slash decides the slide URLs' style (`/my-talk/3/` vs `/my-talk/3`).
 * - `start` — slide to open first (1-based, default 1).
 * - `controls` — show a bar with previous / next, a slide counter and fullscreen.
 * - `label` — accessible name of the iframe (default "Slide deck").
 *
 * Methods: {@link AstlideDeckElement.next | next()}, {@link AstlideDeckElement.prev | prev()},
 * {@link AstlideDeckElement.goTo | goTo(n)}, and the standard `requestFullscreen()`.
 *
 * Events: `slidechange` (`CustomEvent<SlideChangeDetail>`, bubbles) whenever
 * the slide or step changes, including once the deck has loaded.
 *
 * Sizing: the element is as wide as its container and keeps 16:9; set
 * `--astlide-aspect-ratio` (e.g. `4 / 3`) for decks of another shape.
 */
export class AstlideDeckElement extends Base {
	static get observedAttributes(): string[] {
		return ["src", "start", "label"];
	}

	#iframe: HTMLIFrameElement | null = null;
	#counter: HTMLElement | null = null;
	#ready = false;
	#queue: EmbedCommand[] = [];
	#state: SlideChangeDetail | null = null;
	#onMessage = (e: MessageEvent) => this.#receive(e);
	#onLoad = () => this.#hello();
	#onKeydown = (e: KeyboardEvent) => this.#key(e);

	/** URL of the deck root. */
	get src(): string {
		return this.getAttribute("src") ?? "";
	}
	set src(value: string) {
		this.setAttribute("src", value);
	}

	/** Slide shown first (1-based). */
	get start(): number {
		const n = Number.parseInt(this.getAttribute("start") ?? "", 10);
		return Number.isFinite(n) && n >= 1 ? n : 1;
	}
	set start(value: number) {
		this.setAttribute("start", String(value));
	}

	/** Whether the control bar is shown. */
	get controls(): boolean {
		return this.hasAttribute("controls");
	}
	set controls(value: boolean) {
		this.toggleAttribute("controls", Boolean(value));
	}

	/** Current slide (1-based), `0` until the deck has loaded. */
	get slide(): number {
		return this.#state?.slide ?? 0;
	}

	/** Number of slides, `0` until the deck has loaded. */
	get total(): number {
		return this.#state?.total ?? 0;
	}

	/** Steps revealed on the current slide. */
	get step(): number {
		return this.#state?.step ?? 0;
	}

	/** Origin the deck is served from (messages are only exchanged with it). */
	get deckOrigin(): string {
		try {
			return new URL(this.src || ".", document.baseURI).origin;
		} catch {
			return "";
		}
	}

	connectedCallback(): void {
		if (!this.shadowRoot) this.#render();
		window.addEventListener("message", this.#onMessage);
		this.addEventListener("keydown", this.#onKeydown);
		if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
		this.#load();
	}

	disconnectedCallback(): void {
		window.removeEventListener("message", this.#onMessage);
		this.removeEventListener("keydown", this.#onKeydown);
	}

	attributeChangedCallback(name: string, oldValue: string | null, value: string | null): void {
		if (!this.#iframe || oldValue === value) return;
		if (name === "label") this.#iframe.title = value || "Slide deck";
		else if (name === "start" && this.#ready) this.goTo(this.start);
		else this.#load();
	}

	/** Reveal the next step, or go to the next slide. */
	next(): void {
		this.#send({ source: EMBED_SOURCE, type: "next" });
	}

	/** Hide the last revealed step, or go to the previous slide. */
	prev(): void {
		this.#send({ source: EMBED_SOURCE, type: "prev" });
	}

	/** Go to slide `n` (1-based). */
	goTo(n: number): void {
		const slide = Math.floor(Number(n));
		if (!Number.isFinite(slide) || slide < 1) return;
		this.#send({ source: EMBED_SOURCE, type: "goto", slide });
	}

	#render(): void {
		const root = this.attachShadow({ mode: "open" });
		root.innerHTML = `<style>${STYLE}</style>
<div class="frame" part="frame"><iframe part="iframe" allow="fullscreen" loading="lazy"></iframe></div>
<div class="controls" part="controls">
	<button type="button" data-action="prev" aria-label="Previous">&#8592;</button>
	<span class="counter" aria-live="polite"></span>
	<button type="button" data-action="next" aria-label="Next">&#8594;</button>
	<span class="spacer"></span>
	<button type="button" data-action="fullscreen" aria-label="Fullscreen">&#x26F6;</button>
</div>`;
		this.#iframe = root.querySelector("iframe");
		this.#counter = root.querySelector(".counter");
		this.#iframe?.addEventListener("load", this.#onLoad);
		root.querySelector(".controls")?.addEventListener("click", (e) => {
			const button = (e.target as Element).closest?.("button");
			const action = button?.getAttribute("data-action");
			if (action === "prev") this.prev();
			else if (action === "next") this.next();
			else if (action === "fullscreen") this.#toggleFullscreen();
		});
	}

	#load(): void {
		const iframe = this.#iframe;
		if (!iframe) return;
		iframe.title = this.getAttribute("label") || "Slide deck";
		this.#ready = false;
		this.#queue = [];
		const src = this.src;
		if (!src) {
			iframe.removeAttribute("src");
			return;
		}
		iframe.src = slideSrc(src, this.start);
	}

	#hello(): void {
		// Fired on every full page load of the iframe; the deck answers with its state.
		this.#post({ source: EMBED_SOURCE, type: "hello" });
	}

	#send(command: EmbedCommand): void {
		if (this.#ready) this.#post(command);
		else this.#queue.push(command);
	}

	#post(message: EmbedCommand): void {
		const target = this.#iframe?.contentWindow;
		const origin = this.deckOrigin;
		if (!target || !origin) return;
		// "null" origins (file:, sandboxed) can't be targeted by name.
		target.postMessage(message, origin === "null" ? "*" : origin);
	}

	#receive(e: MessageEvent): void {
		if (!this.#iframe || e.source !== this.#iframe.contentWindow) return;
		if (e.origin !== this.deckOrigin) return;
		const detail = parseDeckMessage(e.data);
		if (!detail) return;
		this.#state = detail;
		if (!this.#ready) {
			this.#ready = true;
			const queued = this.#queue;
			this.#queue = [];
			for (const command of queued) this.#post(command);
		}
		if (this.#counter) {
			this.#counter.textContent = detail.total ? `${detail.slide} / ${detail.total}` : "";
		}
		this.dispatchEvent(
			new CustomEvent<SlideChangeDetail>("slidechange", {
				detail,
				bubbles: true,
				composed: true,
			}),
		);
	}

	#key(e: KeyboardEvent): void {
		// Keys pressed while the element (or its control bar) has focus. Inside the
		// iframe the deck handles keys itself.
		if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
		switch (e.key) {
			case "ArrowRight":
			case "PageDown":
			case " ":
				if (e.key === " " && e.composedPath()[0] !== this) return; // space on a button clicks it
				e.preventDefault();
				this.next();
				break;
			case "ArrowLeft":
			case "PageUp":
				e.preventDefault();
				this.prev();
				break;
			case "Home":
				e.preventDefault();
				this.#send({ source: EMBED_SOURCE, type: "first" });
				break;
			case "End":
				e.preventDefault();
				this.#send({ source: EMBED_SOURCE, type: "last" });
				break;
			case "f":
				this.#toggleFullscreen();
				break;
		}
	}

	#toggleFullscreen(): void {
		if (typeof document === "undefined") return;
		if (document.fullscreenElement === this) void document.exitFullscreen?.();
		else void this.requestFullscreen?.();
	}
}

/**
 * Register `<astlide-deck>` (or the element under another `name`). Called when
 * this module is imported; safe to call again, and a no-op outside browsers.
 */
export function defineAstlideDeck(name = "astlide-deck"): void {
	if (typeof customElements === "undefined" || customElements.get(name)) return;
	customElements.define(
		name,
		name === "astlide-deck" ? AstlideDeckElement : class extends AstlideDeckElement {},
	);
}

defineAstlideDeck();

declare global {
	interface HTMLElementTagNameMap {
		"astlide-deck": AstlideDeckElement;
	}
	interface HTMLElementEventMap {
		slidechange: CustomEvent<SlideChangeDetail>;
	}
}
