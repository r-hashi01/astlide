/**
 * Astlide for Next.js (App Router): a folder of decks — the same
 * `_config.json` and numbered `.md` / `.mdx` / `.html` / `.pptx` slides as an
 * Astlide site — as pages, with the presenter window, overview, PDF and the
 * rest of the deck runtime.
 *
 * ```tsx
 * // lib/decks.ts
 * import { createDeckRoutes } from "@astlide/next";
 * export const decks = createDeckRoutes({ dir: "decks", basePath: "/decks" });
 *
 * // app/decks/[deck]/[slide]/page.tsx
 * import { decks } from "@/lib/decks";
 * export const generateStaticParams = decks.slideParams;
 * export const generateMetadata = decks.slideMetadata;
 * export default decks.SlidePage;
 *
 * // app/decks/[deck]/all/page.tsx — the print view (PDF export, printing)
 * export const generateStaticParams = decks.deckParams;
 * export default decks.PrintPage;
 *
 * // app/decks/page.tsx — the list of decks
 * export default decks.IndexPage;
 * ```
 *
 * Plus `withAstlide` in `next.config` (`@astlide/next/config`) and
 * `import "@astlide/next/styles"` in the root layout.
 *
 * MDX slides are compiled with Astro's MDX engine and rendered on the server
 * with `@astlide/react`'s components: the same `.mdx` decks as an Astlide site.
 *
 * @module
 */

import { join } from "node:path";
import { type Deck, evaluateSlideMdx, readDecks, renderNotesHtml } from "@astlide/core/deck";
import { slideTitle } from "@astlide/core/utils/slide-title";
import { mdxComponents, Slide } from "@astlide/react";
import type { ComponentType, ReactNode } from "react";
import * as runtime from "react/jsx-runtime";
import { NextDeckPage, PrintViewSetup } from "./client";

export interface DeckRoutesOptions {
	/** The folder holding the deck folders (default `decks`, from the project root). */
	dir?: string;
	/** The URL path the deck routes are under, e.g. `/decks` (default: the root). */
	basePath?: string;
	/** Slide URLs end in `/` (Next's `trailingSlash`). */
	trailingSlash?: boolean;
	/** Toolbar buttons, in order (see Astlide's `toolbar` option). */
	toolbar?: string[];
	/** Shiki theme for code blocks (default `github-dark`). */
	shikiTheme?: string;
	/** Show slides marked `hidden` (default: only in development). */
	showHidden?: boolean;
}

type SlideParams = { deck: string; slide: string };
type DeckParams = { deck: string };

const escapeAttr = (s: string) => s.replace(/[^\w-]/g, "");

/** Routes and pages for the decks in one folder; see the module notes. */
export function createDeckRoutes(options: DeckRoutesOptions = {}) {
	const dir = join(process.cwd(), options.dir ?? "decks");
	const basePath = (options.basePath ?? "").replace(/\/+$/, "");
	const showHidden = options.showHidden ?? process.env.NODE_ENV === "development";
	const markdown = { shikiTheme: options.shikiTheme };

	// Read once per server process in production; again on every request in development.
	let cached: Promise<Deck[]> | undefined;
	const decks = () => {
		if (!cached || process.env.NODE_ENV === "development")
			cached = readDecks(dir, { markdown }).then((all) =>
				all.map((d) => ({ ...d, slides: d.slides.filter((s) => showHidden || !s.data.hidden) })),
			);
		return cached;
	};
	const findDeck = async (name: string) => {
		const deck = (await decks()).find((d) => d.name === decodeURIComponent(name));
		if (!deck) {
			const { notFound } = await import("next/navigation");
			notFound();
		}
		return deck as Deck;
	};

	/** A slide's content: its HTML, or its MDX rendered with Astlide's components. */
	async function content(
		slide: Deck["slides"][number],
	): Promise<{ html?: string; node?: ReactNode }> {
		if (slide.format !== "mdx") return { html: slide.html ?? "" };
		const { default: Content } = (await evaluateSlideMdx(
			slide.body,
			runtime as never,
			markdown,
		)) as {
			default: ComponentType<{ components: typeof mdxComponents }>;
		};
		return { node: <Content components={mdxComponents} /> };
	}

	/** The theme on <html> before the first paint (the root layout owns <html>). */
	const themeScript = (theme: string, print = false) => (
		<script
			// biome-ignore lint/security/noDangerouslySetInnerHtml: a constant script with a sanitized theme name
			dangerouslySetInnerHTML={{
				__html: `document.documentElement.dataset.theme=${JSON.stringify(escapeAttr(theme))};${print ? 'document.documentElement.setAttribute("data-print","");document.documentElement.setAttribute("data-astlide-all","");' : ""}`,
			}}
		/>
	);

	// biome-ignore lint/correctness/noComponentHookFactories: server components over this folder's options (no hooks)
	async function SlidePage({ params }: { params: Promise<SlideParams> }) {
		const { deck: name, slide: n } = await params;
		const deck = await findDeck(name);
		const number = Number(n);
		const slide = deck.slides[number - 1];
		if (!slide || !Number.isInteger(number)) {
			const { notFound } = await import("next/navigation");
			return notFound();
		}
		const { html, node } = await content(slide);
		const theme = deck.config.theme ?? "default";
		return (
			<>
				{themeScript(theme)}
				<NextDeckPage
					theme={theme}
					deck={deck.name}
					slideNumber={number}
					totalSlides={deck.slides.length}
					basePath={basePath}
					trailingSlash={options.trailingSlash}
					toolbar={options.toolbar}
					outline={deck.slides.map((s, i) => ({ n: i + 1, title: s.title ?? `Slide ${i + 1}` }))}
					notesHtml={slide.notes ? await renderNotesHtml(slide.notes) : undefined}
					deckContext={{
						deck: deck.name,
						slideNumber: number,
						totalSlides: deck.slides.length,
						layout: slide.data.slideLayout ?? "default",
						transition: slide.data.transition ?? "fade",
						config: deck.config,
					}}
				>
					<Slide
						layout={slide.data.slideLayout}
						transition={slide.data.transition}
						background={slide.data.background}
						className={slide.data.class}
						slideNumber={number}
						totalSlides={deck.slides.length}
						{...(html === undefined ? {} : { html })}
					>
						{node}
					</Slide>
				</NextDeckPage>
			</>
		);
	}

	// biome-ignore lint/correctness/noComponentHookFactories: server components over this folder's options (no hooks)
	async function PrintPage({ params }: { params: Promise<DeckParams> }) {
		const deck = await findDeck((await params).deck);
		const slides = deck.slides.filter((s) => !s.data.hidden);
		const rendered = await Promise.all(slides.map(content));
		return (
			<>
				{themeScript(deck.config.theme ?? "default", true)}
				<PrintViewSetup />
				{slides.map((slide, i) => {
					const { html, node } = rendered[i] ?? {};
					return (
						<Slide
							key={slide.id}
							layout={slide.data.slideLayout}
							transition={slide.data.transition ?? "none"}
							background={slide.data.background}
							className={slide.data.class}
							slideNumber={i + 1}
							totalSlides={slides.length}
							{...(html === undefined ? {} : { html })}
							decorations={
								slide.notes ? (
									<div data-slide-notes="meta" hidden>
										{slide.notes}
									</div>
								) : undefined
							}
						>
							{node}
						</Slide>
					);
				})}
			</>
		);
	}

	// biome-ignore lint/correctness/noComponentHookFactories: server components over this folder's options (no hooks)
	async function IndexPage() {
		const all = await decks();
		return (
			<main className="astlide-deck-index">
				<h1>Decks</h1>
				<ul>
					{all.map((d) => (
						<li key={d.name}>
							<a
								href={`${basePath}/${encodeURIComponent(d.name)}/1${options.trailingSlash ? "/" : ""}`}
							>
								{d.config.title ?? d.name}
							</a>
							{d.config.author ? ` — ${d.config.author}` : ""}
						</li>
					))}
				</ul>
			</main>
		);
	}

	return {
		/** `generateStaticParams` for `[deck]/[slide]`. */
		slideParams: async (): Promise<SlideParams[]> =>
			(await decks()).flatMap((d) =>
				d.slides.map((_, i) => ({ deck: d.name, slide: String(i + 1) })),
			),
		/** `generateStaticParams` for `[deck]/all`. */
		deckParams: async (): Promise<DeckParams[]> => (await decks()).map((d) => ({ deck: d.name })),
		/** `generateMetadata` for `[deck]/[slide]`. */
		slideMetadata: async ({ params }: { params: Promise<SlideParams> }) => {
			const { deck: name, slide: n } = await params;
			const deck = (await decks()).find((d) => d.name === decodeURIComponent(name));
			const slide = deck?.slides[Number(n) - 1];
			const title = deck ? `${deck.config.title ?? deck.name} - Slide ${n}` : "Slide";
			return {
				title,
				description: slide ? (slideTitle({ data: slide.data, body: slide.body }) ?? title) : title,
				robots: { index: false, follow: false },
			};
		},
		SlidePage,
		PrintPage,
		IndexPage,
		/** The decks, read (for your own pages). */
		decks,
	};
}

export { withAstlide } from "./config";
