/**
 * Export a deck folder to PowerPoint, PDF or PNG without Astro: the deck is
 * read with `@astlide/core/deck`, written as a print view (every slide in one
 * page, with the same markup and styles an Astlide site has), and handed to
 * the exporters `astlide export` uses — the layout engine for PPTX, Chromium
 * for PDF / PNG.
 *
 * ```ts
 * import { renderDeck } from "@astlide/core/render";
 *
 * await renderDeck({ dir: "decks/q3-review", format: "pptx", output: "q3.pptx" });
 * ```
 *
 * Markdown, HTML and PowerPoint slides only: MDX needs a build. Experimental.
 *
 * @module
 */

import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { type Deck, readDeck } from "../deck/index";
import { renderSlideHtml, type SlideTemplate } from "../runtime/slide";
import { THEMES } from "../schema";
import { storePptxAsset } from "../utils/pptx-assets";
import { slideScriptsKept, stripSlideScripts } from "../utils/slide-scripts";

export type RenderFormat = "pptx" | "pdf" | "png";

export interface RenderDeckOptions {
	/** The deck folder (`_config.json` and the slides). */
	dir: string;
	format: RenderFormat;
	/** The file to write (PPTX / PDF), or the folder for PNGs. */
	output: string;
	/**
	 * A PowerPoint template (`.pptx` / `.potx` / `.thmx`) to use as the
	 * deck's theme, in place of `_config.json`'s `theme`.
	 */
	template?: Uint8Array;
	/** The Shiki theme for code blocks. Default `github-dark`. */
	shikiTheme?: string;
	/**
	 * The web font stylesheet (default: Inter and JetBrains Mono from Google
	 * Fonts, as an Astlide site), or `null` for none.
	 */
	fontHref?: string | null;
	/**
	 * Where `mermaid` is found (for diagrams) and download caches go
	 * (`node_modules/.cache`). Default: the working directory.
	 */
	root?: string;
	/** Where the print view is written while it renders (removed after). Default: the OS's temp folder. */
	tempDir?: string;
	/** PDF / PNG size in px. Default 1920 × 1080. */
	width?: number;
	height?: number;
}

const DEFAULT_FONT =
	"https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;700&display=swap";

/** The name a template gets as a theme in the print view. */
const TEMPLATE_THEME = "template";

const styles = (name: string) => fileURLToPath(new URL(`../styles/${name}`, import.meta.url));

const escapeText = (s: string) =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (s: string) => escapeText(s).replace(/"/g, "&quot;");

/** A template's theme CSS and artwork, its pictures and fonts stored in the site. */
async function loadTemplate(
	data: Uint8Array,
	assets: string,
): Promise<{ css: string; template: SlideTemplate }> {
	const { pptxToTemplate, templateCss } = await import("../pptx/index");
	const t = pptxToTemplate(data, { media: (f) => storePptxAsset(assets, "/", f) });
	// A template can come from someone else, like a slide: no scripts in its artwork.
	const art = (html: string) => (slideScriptsKept() ? html : stripSlideScripts(html));
	return {
		css: templateCss(t, TEMPLATE_THEME),
		template: {
			layouts: Object.fromEntries(
				t.layouts.map((l) => [l.id, { art: art(l.art), slideNumber: !!l.slideNumber }]),
			),
			aliases: t.aliases,
			master: art(t.master),
		},
	};
}

export interface PrintView {
	deck: Deck;
	/** The page: `<site>/<deck>/all/index.html`. */
	html: string;
	/** The site folder it's in. */
	site: string;
	/** The theme the page uses. */
	theme: string;
}

/**
 * Write a deck's print view into `site`: the page, the styles, and the
 * pictures and fonts of PowerPoint slides and templates. The markup is an
 * Astlide site's `/<deck>/all` page: the same slide markup and styles.
 */
export async function writePrintView(
	options: Pick<RenderDeckOptions, "dir" | "template" | "shikiTheme" | "fontHref"> & {
		site: string;
	},
): Promise<PrintView> {
	const { site } = options;
	const assets = join(site, "_astlide", "pptx");
	const css = join(site, "_astlide", "css");
	await mkdir(css, { recursive: true });
	await mkdir(assets, { recursive: true });

	const deck = await readDeck(options.dir, {
		markdown: { shikiTheme: options.shikiTheme },
		pptxMedia: (f) => storePptxAsset(assets, "/", f),
	});
	const mdx = deck.slides.filter((s) => s.format === "mdx");
	if (mdx.length)
		throw new Error(
			`MDX slides need an Astro build (astlide export): ${mdx.map((s) => s.file).join(", ")}`,
		);

	// Every built-in theme, as an Astlide site has them; a template as one more.
	const sheets = ["base.css", ...THEMES.map((t) => `themes/${t}.css`), "slide.css"];
	for (const sheet of sheets)
		await copyFile(styles(sheet), join(css, sheet.replace("themes/", "theme-")));
	const links = sheets.map((s) => `/_astlide/css/${s.replace("themes/", "theme-")}`);
	let template: SlideTemplate | undefined;
	let theme = deck.config.theme ?? "default";
	if (options.template) {
		const loaded = await loadTemplate(options.template, assets);
		await writeFile(join(css, "template.css"), loaded.css);
		links.splice(links.length - 1, 0, "/_astlide/css/template.css");
		template = loaded.template;
		theme = TEMPLATE_THEME;
	} else if (!(THEMES as readonly string[]).includes(theme)) {
		throw new Error(`unknown theme "${theme}": use a built-in theme or a template`);
	}

	const slides = deck.slides.filter((s) => !s.data.hidden);
	const body = slides
		.map((slide, i) =>
			renderSlideHtml(
				{
					layout: slide.data.slideLayout,
					transition: slide.data.transition ?? "none",
					background: slide.data.background,
					className: slide.data.class,
					slideNumber: i + 1,
					totalSlides: slides.length,
					template,
				},
				slide.html ?? "",
				// Notes for the PPTX exporter (speaker notes), hidden.
				slide.notes ? `<div data-slide-notes="meta" hidden>${escapeText(slide.notes)}</div>` : "",
			),
		)
		.join("\n");
	const font = options.fontHref === undefined ? DEFAULT_FONT : options.fontHref;
	const title = deck.config.title ?? deck.name;
	// Diagrams are drawn before export (no client script), so the page is ready as written.
	const page = `<!DOCTYPE html>
<html lang="en" data-theme="${escapeAttr(theme)}" data-print data-astlide-all data-diagrams-ready>
<head>
<meta charset="UTF-8" />
<title>${escapeText(title)} — all slides</title>
${font ? `<link href="${escapeAttr(font)}" rel="stylesheet" />` : ""}
${links.map((href) => `<link rel="stylesheet" href="${href}" />`).join("\n")}
</head>
<body data-total-slides="${slides.length}">
${body}
</body>
</html>
`;
	const html = join(site, deck.name, "all", "index.html");
	await mkdir(join(site, deck.name, "all"), { recursive: true });
	await writeFile(html, page);
	return { deck, html, site, theme };
}

const TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".svg": "image/svg+xml",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".ttf": "font/ttf",
	".otf": "font/otf",
};

/** Serve `dir` on a free loopback port (files only, never outside it). */
async function serveFolder(dir: string): Promise<{ url: string; server: Server }> {
	const root = resolve(dir);
	const server = createServer(async (req, res) => {
		let path: string;
		try {
			path = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
		} catch {
			res.writeHead(400).end();
			return;
		}
		const file = resolve(root, `.${path.endsWith("/") ? `${path}index.html` : path}`);
		if (!file.startsWith(root + sep)) {
			res.writeHead(404).end();
			return;
		}
		for (const candidate of [file, join(file, "index.html")]) {
			try {
				const data = await readFile(candidate);
				res
					.writeHead(200, {
						"content-type": TYPES[extname(candidate).toLowerCase()] ?? "application/octet-stream",
					})
					.end(data);
				return;
			} catch {
				// try the next candidate
			}
		}
		res.writeHead(404).end();
	});
	await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
	const { port } = server.address() as { port: number };
	return { url: `http://127.0.0.1:${port}`, server };
}

/** Draw ```mermaid diagrams into the page (as the PPTX export does), for the browser exports. */
async function drawDiagrams(view: PrintView, root: string): Promise<void> {
	const source = await readFile(view.html, "utf-8");
	if (!source.includes('class="astlide-mermaid"')) return;
	const { diagramsInPrintView } = await import("../cli/pptx/export");
	await writeFile(view.html, await diagramsInPrintView(view.html, view.site, root));
}

/** Export a deck folder; see the module notes. Returns the print view's deck. */
export async function renderDeck(options: RenderDeckOptions): Promise<Deck> {
	const root = resolve(options.root ?? process.cwd());
	const site = await mkdtemp(join(options.tempDir ?? tmpdir(), "astlide-render-"));
	try {
		const view = await writePrintView({ ...options, site });
		const config = { ...view.deck.config, theme: view.theme };
		if (options.format === "pptx") {
			const { pptxFromPrintView } = await import("../cli/pptx/export");
			await pptxFromPrintView({
				html: view.html,
				site,
				root,
				deck: view.deck.name,
				config,
				output: options.output,
			});
			return view.deck;
		}
		await drawDiagrams(view, root);
		const { exportDeck } = await import("../cli/render");
		const { url, server } = await serveFolder(site);
		try {
			await exportDeck(view.deck.name, {
				format: options.format,
				baseUrl: url,
				output: options.output,
				width: options.width ?? 1920,
				height: options.height ?? 1080,
				printViewOnly: true,
			});
		} finally {
			server.close();
		}
		return view.deck;
	} finally {
		await rm(site, { recursive: true, force: true });
	}
}
