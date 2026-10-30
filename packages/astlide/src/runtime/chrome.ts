/**
 * The markup around a slide that the deck runtime drives: the progress bar,
 * the presenter panel, the toolbar, the notes / PDF / overview / go-to
 * overlays. Plain HTML strings, so any host (Astro, React, Vue, a server
 * template) renders the same markup; the runtime finds its parts by id and
 * class.
 *
 * A slide page is, in order:
 *
 * ```html
 * <body>
 *   {deckChromeBefore(props)}
 *   <main class="presentation" aria-label="Slide presentation">
 *     <div class="slide-scaler" id="slide-scaler" tabindex="-1">
 *       …the slide…
 *       {SLIDE_OVERLAYS}
 *     </div>
 *   </div>
 *   {CAMERA_BUBBLE}
 *   {deckChromeAfter(props)}
 * </body>
 * ```
 *
 * with `@astlide/core/styles/deck.css` loaded. Experimental, like the runtime.
 *
 * @module
 */

/** What the chrome shows for one slide. */
export interface DeckChromeProps {
	currentSlide: number;
	totalSlides: number;
	prevSlide: number | null;
	nextSlide: number | null;
	/** Toolbar buttons, in order (see the `toolbar` option). */
	toolbar: readonly string[];
	/** URL of slide `n`, with an optional query (`?presenter`). */
	slideHref: (n: number, query?: string) => string;
	/** URL of the deck index (the toolbar's `home`). */
	homeHref: string;
	/** The slide's speaker notes as sanitized HTML, if any. */
	notesHtml?: string;
	/** Shown when there are no notes. */
	noNotesText: string;
}

const escapeText = (s: string) =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (s: string) => escapeText(s).replace(/"/g, "&quot;");

/** A link to a neighbouring slide, or a disabled button when there is none. */
function navLink(href: string | null, className: string, label: string, text: string): string {
	const aria = label ? ` aria-label="${escapeAttr(label)}"` : "";
	if (href === null)
		return `<button type="button" class="${className} disabled"${aria} disabled>${text}</button>`;
	return `<a href="${escapeAttr(href)}" class="${className}"${aria}>${text}</a>`;
}

/** A toolbar button running a runtime action (`data-action`). */
function actionButton(action: string, label: string, title: string, text: string, pressed = false) {
	return `<button type="button" class="nav-btn nav-action" data-action="${action}" aria-label="${label}"${pressed ? ' aria-pressed="false"' : ""} title="${title}">${text}</button>`;
}

const ACTIONS: Record<string, [label: string, title: string, text: string, pressed?: boolean]> = {
	notes: ["Toggle speaker notes", "Toggle speaker notes (n)", "📝"],
	goto: ["Go to slide", "Go to slide (g)", "⌕"],
	draw: ["Toggle drawing", "Draw on the slide (d) — c clears", "✎", true],
	laser: ["Toggle laser pointer", "Laser pointer (l)", "◉", true],
	camera: ["Toggle camera", "Camera (v)", "◎", true],
	record: ["Record the talk", "Record (r)", "⏺", true],
	overview: ["Open slide overview", "Slide overview (o)", "▦"],
	presenter: ["Open presenter window", "Open presenter window (p)", "🎤"],
	fullscreen: ["Toggle fullscreen", "Toggle fullscreen (f)", "⛶"],
	print: ["Toggle print mode", "Toggle print mode", "🖨"],
	share: ["Toggle share mode", "Toggle share mode (clean canvas)", "📺"],
	download: ["Download deck as PDF", "Download deck as PDF", "⬇"],
};

function toolbarItem(item: string, p: DeckChromeProps): string {
	const href = (n: number | null) => (n === null ? null : p.slideHref(n));
	if (item === "home")
		return `<a href="${escapeAttr(p.homeHref)}" class="nav-btn nav-action" aria-label="Back to deck index" title="Back to deck index">⌂</a>`;
	if (item === "prev") return navLink(href(p.prevSlide), "nav-btn", "Previous slide", "←");
	if (item === "next") return navLink(href(p.nextSlide), "nav-btn", "Next slide", "→");
	if (item === "counter")
		return `<span class="nav-indicator">${p.currentSlide} / ${p.totalSlides}</span>`;
	if (item === "spacer") return '<span class="nav-spacer" aria-hidden="true"></span>';
	const action = ACTIONS[item];
	return action ? actionButton(item, ...action) : "";
}

function notesBlock(p: DeckChromeProps, className: string): string {
	return p.notesHtml
		? `<div class="${className}">${p.notesHtml}</div>`
		: `<p class="no-notes">${escapeText(p.noNotesText)}</p>`;
}

/** Before the slide: skip link, screen-reader announcer, progress bar, presenter panel. */
export function deckChromeBefore(p: DeckChromeProps): string {
	const { currentSlide: n, totalSlides: total } = p;
	const presenterHref = (s: number | null) => (s === null ? null : p.slideHref(s, "?presenter"));
	return `<a href="#slide-scaler" class="skip-link">Skip to slide content</a>
<div class="sr-only" aria-live="polite" aria-atomic="true" id="slide-announcer">Slide ${n} of ${total}</div>
<div class="progress-bar" style="width: ${(n / total) * 100}%" role="progressbar" aria-valuenow="${n}" aria-valuemin="1" aria-valuemax="${total}" aria-label="Slide progress: ${n} of ${total}"></div>
<div class="presenter-layout">
<div class="presenter-slide-area"><div class="presenter-current"></div></div>
<aside class="presenter-panel" aria-label="Presenter controls">
<div class="presenter-info">
<span class="presenter-counter">${n} / ${total}</span>
<div class="timer-wrapper">
<span class="presenter-timer" id="presenter-timer">00:00</span>
<button class="timer-btn" id="timer-btn" type="button" aria-label="Start timer" title="Start timer">▶</button>
<button class="timer-reset-btn" id="timer-reset" type="button" aria-label="Reset timer" title="Reset timer">↺</button>
</div>
</div>
<section class="presenter-next" aria-label="Next slide">
<div class="presenter-section-header"><h3>Next</h3><span class="presenter-steps-left" id="presenter-steps-left" hidden></span></div>
${p.nextSlide !== null ? '<div class="presenter-next-frame"></div>' : '<p class="presenter-next-end">End of deck</p>'}
</section>
<div class="presenter-notes">
<div class="presenter-notes-header">
<h3>Notes</h3>
<fieldset class="notes-font-controls" aria-label="Adjust notes font size">
<button type="button" class="notes-font-btn" data-notes-font="dec" aria-label="Decrease notes font size" title="Smaller (Shift+,)">A−</button>
<button type="button" class="notes-font-btn" data-notes-font="reset" aria-label="Reset notes font size" title="Reset">A</button>
<button type="button" class="notes-font-btn" data-notes-font="inc" aria-label="Increase notes font size" title="Larger (Shift+.)">A+</button>
</fieldset>
</div>
${notesBlock(p, "notes-content")}
</div>
<div class="presenter-nav">
${navLink(presenterHref(p.prevSlide), "pnav-btn", "", "← Prev")}
${navLink(presenterHref(p.nextSlide), "pnav-btn", "", "Next →")}
</div>
</aside>
</div>`;
}

/** Inside `#slide-scaler`, after the slide: the pen and laser layers. */
export const SLIDE_OVERLAYS =
	'<canvas class="draw-layer" id="draw-layer" aria-hidden="true"></canvas><div class="laser-dot" id="laser-dot" aria-hidden="true" hidden></div>';

/** The camera bubble (`v`). Hosts with client-side navigation should keep it across slides. */
export const CAMERA_BUBBLE =
	'<div id="astlide-camera" class="camera-bubble" hidden><video aria-label="Camera" autoplay muted playsinline></video></div>';

/** After the slide: recording indicator, toolbar, and the notes / PDF / overview / go-to overlays. */
export function deckChromeAfter(p: DeckChromeProps): string {
	const notes = p.notesHtml
		? `<div class="notes-body">${p.notesHtml}</div>`
		: `<div class="notes-body"><p class="no-notes">${escapeText(p.noNotesText)}</p></div>`;
	return `<div class="recording-indicator" role="status" aria-label="Recording"><span class="recording-dot" aria-hidden="true"></span><span id="astlide-recording-time">0:00</span></div>
<nav class="slide-nav" aria-label="Slide navigation">${p.toolbar.map((item) => toolbarItem(item, p)).join("")}</nav>
<aside class="notes-overlay" id="notes-overlay" aria-label="Speaker notes" aria-hidden="true" inert>
<div class="notes-overlay-content">
<div class="notes-overlay-header"><span>Speaker Notes</span><button type="button" class="notes-close" id="notes-close" aria-label="Close speaker notes">✕</button></div>
${notes}
</div>
</aside>
<div class="pdf-overlay" id="pdf-overlay" role="dialog" aria-label="Generating PDF" aria-hidden="true">
<div class="pdf-overlay-card">
<div class="pdf-overlay-title">Generating PDF</div>
<div class="pdf-overlay-progress"><div class="pdf-overlay-bar" id="pdf-overlay-bar" style="width: 0%"></div></div>
<div class="pdf-overlay-status" id="pdf-overlay-status">Preparing…</div>
</div>
</div>
<div class="overview" id="overview" role="dialog" aria-modal="true" aria-label="Slide overview" aria-hidden="true">
<div class="overview-header">Overview — press <kbd>o</kbd> or <kbd>Esc</kbd> to close</div>
<ul class="overview-grid" id="overview-grid"></ul>
</div>
<div class="goto" id="goto" role="dialog" aria-modal="true" aria-label="Go to slide" aria-hidden="true">
<div class="goto-card">
<input class="goto-input" id="goto-input" type="text" autocomplete="off" spellcheck="false" placeholder="Go to slide — number or title" role="combobox" aria-expanded="true" aria-controls="goto-list" aria-autocomplete="list" />
<ul class="goto-list" id="goto-list" role="listbox" aria-label="Slides"></ul>
</div>
</div>`;
}
