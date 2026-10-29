"use client";

/**
 * A slide page for React: the toolbar, progress bar, presenter panel and
 * overlays of an Astlide site around one slide, driven by Astlide's deck
 * runtime (keyboard and touch navigation, fragments, presenter window and
 * sync, overview, go-to, pen and laser, notes, PDF). The markup matches
 * `@astlide/core/runtime/chrome`; load `@astlide/core/styles/deck.css`.
 *
 * One slide per URL (`<basePath>/<deck>/<n>`): give the host's router as
 * `navigate` (Next's `router.push` …) so moving between slides stays in the app.
 *
 * @module
 */

import type { DeckContext } from "@astlide/core/context";
import type { MermaidLoader } from "@astlide/core/internal/diagrams";
import {
	applyPageFlags,
	type DeckRuntimeConfig,
	mountDeck,
	type OutlineEntry,
} from "@astlide/core/runtime";
import { Fragment, type ReactNode, useEffect, useMemo } from "react";

export interface DeckPageProps {
	/** The deck's URL segment. */
	deck: string;
	slideNumber: number;
	totalSlides: number;
	/** Slides navigation lands on (default: the neighbours, first, last). */
	prevSlide?: number | null;
	nextSlide?: number | null;
	firstSlide?: number;
	lastSlide?: number;
	/** Slide titles for the go-to dialog (`g`). */
	outline?: OutlineEntry[];
	/** Where the deck's URLs start, e.g. `/talks` (default: the site root). */
	basePath?: string;
	/** Slide URLs end in `/`. */
	trailingSlash?: boolean;
	/** Toolbar buttons, in order (see the `toolbar` option). Default `prev`, `counter`, `next`. */
	toolbar?: readonly string[];
	/** The slide's speaker notes as sanitized HTML. */
	notesHtml?: string;
	/** Whether this site publishes notes (changes the "no notes" text). Default true. */
	notesPublished?: boolean;
	/** Keep pen drawings in localStorage. */
	persistDrawings?: boolean;
	/** Published as `window.__astlide` (see `getClientDeckContext`). */
	deckContext?: DeckContext;
	/**
	 * Render this page as the presenter window (`?presenter`): the slide goes
	 * in the presenter panel's area, as the runtime expects.
	 */
	presenter?: boolean;
	/** The host's client-side navigation. Default: full page loads. */
	navigate?: (url: string, options: { replace: boolean }) => void;
	/**
	 * Loads `mermaid` for ```mermaid diagrams: `() => import("mermaid")`.
	 * Without it, diagrams show as their source.
	 */
	loadMermaid?: MermaidLoader;
	/**
	 * Loads the in-browser PDF export for the toolbar's `download` button:
	 * `() => import("@astlide/core/internal/pdf-export")` (it needs the
	 * optional `@astlide/crispdf`). Without it, the button reports that PDF
	 * download isn't available.
	 */
	loadPdfExport?: () => Promise<typeof import("@astlide/core/internal/pdf-export")>;
	/** The slide (`<Slide>`). */
	children?: ReactNode;
}

/** A slide page; see the module notes. */
export function DeckPage(props: DeckPageProps) {
	const {
		deck,
		slideNumber: n,
		totalSlides: total,
		basePath = "",
		trailingSlash = false,
		toolbar = ["prev", "counter", "next"],
		notesHtml,
		notesPublished = true,
		presenter = false,
	} = props;
	const prevSlide = props.prevSlide === undefined ? (n > 1 ? n - 1 : null) : props.prevSlide;
	const nextSlide = props.nextSlide === undefined ? (n < total ? n + 1 : null) : props.nextSlide;
	const firstSlide = props.firstSlide ?? 1;
	const lastSlide = props.lastSlide ?? total;
	const slideHref = (s: number, query = "") =>
		`${basePath}/${encodeURIComponent(deck)}/${s}${trailingSlash ? "/" : ""}${query}`;
	const noNotes = notesPublished
		? "No notes for this slide."
		: "Speaker notes are not published with this deck.";

	const config = useMemo<DeckRuntimeConfig>(
		() => ({
			deck,
			currentSlide: n,
			totalSlides: total,
			prevSlide,
			nextSlide,
			firstSlide,
			lastSlide,
			trailingSlash,
			basePath,
			outline: props.outline ?? [],
			deckContext: props.deckContext ?? null,
			persistDrawings: props.persistDrawings ?? false,
		}),
		[
			deck,
			n,
			total,
			prevSlide,
			nextSlide,
			firstSlide,
			lastSlide,
			trailingSlash,
			basePath,
			props.outline,
			props.deckContext,
			props.persistDrawings,
		],
	);
	const { navigate, loadMermaid, loadPdfExport } = props;
	// biome-ignore lint/correctness/useExhaustiveDependencies: `presenter` re-mounts the runtime on the slide's new element
	useEffect(() => {
		applyPageFlags();
		// What an Astro slide page has on <body> (exporters read the slide count there).
		const body = document.body.dataset;
		body.totalSlides = String(config.totalSlides);
		body.currentSlide = String(config.currentSlide);
		body.deck = config.deck;
		// React places the slide (presenter panel or not); the runtime mustn't move it.
		const unmount = mountDeck(config, { placeSlide: false, ...(navigate ? { navigate } : {}) });
		// What an Astro slide page's other scripts do on each slide.
		void import("@astlide/core/internal/diagrams").then((m) => m.renderDiagramsWith(loadMermaid));
		void import("@astlide/core/internal/recording").then((m) => m.syncMediaUi());
		return unmount;
		// Again when the slide moves between the presenter panel and the page: a new element.
	}, [config, navigate, loadMermaid, presenter]);
	// Camera, recording and the toolbar's PDF download, set up once per page.
	useEffect(() => {
		void import("@astlide/core/internal/recording").then(({ toggleCamera, toggleRecording }) => {
			window.__astlide_media = {
				toggleCamera,
				toggleRecording: () => toggleRecording(window.__astlide?.deck ?? deck),
			};
		});
		window.__astlide_download_pdf = loadPdfExport
			? async (options) => {
					const mod = await loadPdfExport();
					const result = await mod.exportDeckToPdf(options);
					mod.downloadBlob(result.blob, `${options.deck}.pdf`);
					return result;
				}
			: undefined;
	}, [deck, loadPdfExport]);

	const notes = (className: string) =>
		notesHtml ? (
			// biome-ignore lint/security/noDangerouslySetInnerHtml: notes are sanitized HTML (see the prop)
			<div className={className} dangerouslySetInnerHTML={{ __html: notesHtml }} />
		) : (
			<p className="no-notes">{noNotes}</p>
		);
	const navLink = (
		href: string | null,
		className: string,
		label: string | undefined,
		text: string,
	) =>
		href === null ? (
			<a className={`${className} disabled`} aria-label={label} aria-disabled="true" tabIndex={-1}>
				{text}
			</a>
		) : (
			<a href={href} className={className} aria-label={label}>
				{text}
			</a>
		);
	const scaler = (
		<div className="slide-scaler" id="slide-scaler" tabIndex={-1}>
			{props.children}
			<canvas className="draw-layer" id="draw-layer" aria-hidden="true" />
			<div className="laser-dot" id="laser-dot" aria-hidden="true" hidden />
		</div>
	);

	return (
		<>
			<a href="#slide-scaler" className="skip-link">
				Skip to slide content
			</a>
			<div className="sr-only" aria-live="polite" aria-atomic="true" id="slide-announcer">
				Slide {n} of {total}
			</div>
			<div
				className="progress-bar"
				style={{ width: `${(n / total) * 100}%` }}
				role="progressbar"
				aria-valuenow={n}
				aria-valuemin={1}
				aria-valuemax={total}
				aria-label={`Slide progress: ${n} of ${total}`}
			/>
			<div className="presenter-layout">
				<div className="presenter-slide-area">
					<div className="presenter-current">{presenter ? scaler : null}</div>
				</div>
				<aside className="presenter-panel" aria-label="Presenter controls">
					<div className="presenter-info">
						<span className="presenter-counter">
							{n} / {total}
						</span>
						<div className="timer-wrapper">
							<span className="presenter-timer" id="presenter-timer">
								00:00
							</span>
							<button
								className="timer-btn"
								id="timer-btn"
								type="button"
								aria-label="Start timer"
								title="Start timer"
							>
								▶
							</button>
							<button
								className="timer-reset-btn"
								id="timer-reset"
								type="button"
								aria-label="Reset timer"
								title="Reset timer"
							>
								↺
							</button>
						</div>
					</div>
					<section className="presenter-next" aria-label="Next slide">
						<div className="presenter-section-header">
							<h3>Next</h3>
							<span className="presenter-steps-left" id="presenter-steps-left" hidden />
						</div>
						{nextSlide !== null ? (
							<div className="presenter-next-frame" />
						) : (
							<p className="presenter-next-end">End of deck</p>
						)}
					</section>
					<div className="presenter-notes">
						<div className="presenter-notes-header">
							<h3>Notes</h3>
							<div className="notes-font-controls" role="group" aria-label="Adjust notes font size">
								<button
									type="button"
									className="notes-font-btn"
									data-notes-font="dec"
									aria-label="Decrease notes font size"
									title="Smaller (Shift+,)"
								>
									A−
								</button>
								<button
									type="button"
									className="notes-font-btn"
									data-notes-font="reset"
									aria-label="Reset notes font size"
									title="Reset"
								>
									A
								</button>
								<button
									type="button"
									className="notes-font-btn"
									data-notes-font="inc"
									aria-label="Increase notes font size"
									title="Larger (Shift+.)"
								>
									A+
								</button>
							</div>
						</div>
						{notes("notes-content")}
					</div>
					<div className="presenter-nav">
						{navLink(
							prevSlide === null ? null : slideHref(prevSlide, "?presenter"),
							"pnav-btn",
							undefined,
							"← Prev",
						)}
						{navLink(
							nextSlide === null ? null : slideHref(nextSlide, "?presenter"),
							"pnav-btn",
							undefined,
							"Next →",
						)}
					</div>
				</aside>
			</div>
			<div className="presentation" role="main" aria-label="Slide presentation">
				{presenter ? null : scaler}
			</div>
			<div id="astlide-camera" className="camera-bubble" aria-label="Camera" hidden>
				<video autoPlay muted playsInline />
			</div>
			<div className="recording-indicator" role="status" aria-label="Recording">
				<span className="recording-dot" aria-hidden="true" />
				<span id="astlide-recording-time">0:00</span>
			</div>
			<nav className="slide-nav" aria-label="Slide navigation">
				{toolbar.map((item, i) => {
					const key = `${item}-${i}`;
					if (item === "home")
						return (
							<a
								key={key}
								href={`${basePath}/`}
								className="nav-btn nav-action"
								aria-label="Back to deck index"
								title="Back to deck index"
							>
								⌂
							</a>
						);
					if (item === "prev")
						return (
							<Fragment key={key}>
								{navLink(
									prevSlide === null ? null : slideHref(prevSlide),
									"nav-btn",
									"Previous slide",
									"←",
								)}
							</Fragment>
						);
					if (item === "next")
						return (
							<Fragment key={key}>
								{navLink(
									nextSlide === null ? null : slideHref(nextSlide),
									"nav-btn",
									"Next slide",
									"→",
								)}
							</Fragment>
						);
					if (item === "counter")
						return (
							<span key={key} className="nav-indicator">
								{n} / {total}
							</span>
						);
					if (item === "spacer")
						return <span key={key} className="nav-spacer" aria-hidden="true" />;
					const action = ACTIONS[item];
					if (!action) return null;
					const [label, title, text, pressed] = action;
					return (
						<button
							key={key}
							type="button"
							className="nav-btn nav-action"
							data-action={item}
							aria-label={label}
							aria-pressed={pressed ? "false" : undefined}
							title={title}
						>
							{text}
						</button>
					);
				})}
			</nav>
			<div
				className="notes-overlay"
				id="notes-overlay"
				role="complementary"
				aria-label="Speaker notes"
				aria-hidden="true"
			>
				<div className="notes-overlay-content">
					<div className="notes-overlay-header">
						<span>Speaker Notes</span>
						<button className="notes-close" id="notes-close" aria-label="Close speaker notes">
							✕
						</button>
					</div>
					{notesHtml ? notes("notes-body") : <div className="notes-body">{notes("")}</div>}
				</div>
			</div>
			<div
				className="pdf-overlay"
				id="pdf-overlay"
				role="dialog"
				aria-label="Generating PDF"
				aria-hidden="true"
			>
				<div className="pdf-overlay-card">
					<div className="pdf-overlay-title">Generating PDF</div>
					<div className="pdf-overlay-progress">
						<div className="pdf-overlay-bar" id="pdf-overlay-bar" style={{ width: "0%" }} />
					</div>
					<div className="pdf-overlay-status" id="pdf-overlay-status">
						Preparing…
					</div>
				</div>
			</div>
			<div
				className="overview"
				id="overview"
				role="dialog"
				aria-label="Slide overview"
				aria-hidden="true"
			>
				<div className="overview-header">
					Overview — press <kbd>o</kbd> or <kbd>Esc</kbd> to close
				</div>
				<div className="overview-grid" id="overview-grid" role="list" />
			</div>
			<div
				className="goto"
				id="goto"
				role="dialog"
				aria-modal="true"
				aria-label="Go to slide"
				aria-hidden="true"
			>
				<div className="goto-card">
					<input
						className="goto-input"
						id="goto-input"
						type="text"
						autoComplete="off"
						spellCheck={false}
						placeholder="Go to slide — number or title"
						role="combobox"
						aria-expanded="true"
						aria-controls="goto-list"
						aria-autocomplete="list"
					/>
					<ul className="goto-list" id="goto-list" role="listbox" aria-label="Slides" />
				</div>
			</div>
		</>
	);
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
