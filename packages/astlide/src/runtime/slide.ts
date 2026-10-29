/**
 * A slide's own markup — the `<section class="slide …">` around its content,
 * with the layout's classes, the background, a PowerPoint template's artwork
 * and slide number — for any host. `Slide.astro` renders the same; style it
 * with `@astlide/core/styles/slide.css`.
 *
 * Experimental, like the runtime.
 *
 * @module
 */

import { sanitizeBackground } from "../utils/sanitize";

/** A PowerPoint template theme's artwork (see `astlide({ templates })`). */
export interface SlideTemplate {
	layouts: Record<string, { art: string; slideNumber: boolean }>;
	aliases: Record<string, string>;
	master: string;
}

export interface SlideShellProps {
	/** `slideLayout` (default `default`). */
	layout?: string;
	/** `transition` (default `fade`). */
	transition?: string;
	/** `background`: a color, gradient or image. */
	background?: string;
	/** Frontmatter `class`. */
	className?: string;
	slideNumber?: number;
	totalSlides?: number;
	/** The deck theme's PowerPoint template, when the theme is one. */
	template?: SlideTemplate;
	/** Turns a root-relative background image path into a URL (a site's base path). Default: as is. */
	resolveUrl?: (path: string) => string;
}

/** What the slide's `<section>` and its extra parts are made of. */
export interface SlideShell {
	classes: string[];
	transition: string;
	style: string;
	ariaLabel?: string;
	/** Template artwork HTML (drawn behind the content), if any. */
	templateArt?: string;
	/** Show the template's slide number. */
	templateNumber: boolean;
}

/** The background as CSS declarations (empty when none, or when unsafe). */
export function backgroundStyle(
	background: string | undefined,
	resolveUrl: (path: string) => string = (p) => p,
): string {
	const safe = background ? sanitizeBackground(background) : undefined;
	if (!safe) return "";
	if (safe.startsWith("linear-gradient") || safe.startsWith("radial-gradient"))
		return `background: ${safe};`;
	if (safe.startsWith("url(") || /\.(png|jpe?g|gif|webp|svg)(\?|$)/.test(safe)) {
		const raw = safe.startsWith("url(") ? safe.slice(4, -1).trim() : safe;
		// Keep any quotes, but resolve a root-relative path.
		const quote = /^["']/.test(raw) ? raw[0] : "";
		const path = quote ? raw.slice(1, -1) : raw;
		const url = path.startsWith("/") && !path.startsWith("//") ? resolveUrl(path) : path;
		return `background-image: url(${quote}${url}${quote}); background-size: cover; background-position: center;`;
	}
	return `background-color: ${safe};`;
}

/** The parts of a slide's markup for these props. */
export function slideShell(props: SlideShellProps): SlideShell {
	const layout = props.layout ?? "default";
	const style = backgroundStyle(props.background, props.resolveUrl);
	const template = props.template;
	// The template layout standing for this built-in layout, or the one of this
	// name, else just the master's artwork. A slide with its own background
	// shows that instead.
	const templateLayout = template
		? (template.aliases[layout] ?? (template.layouts[layout] ? layout : undefined))
		: undefined;
	const templateArt =
		template && !style
			? ((templateLayout ? template.layouts[templateLayout]?.art : undefined) ?? template.master)
			: undefined;
	return {
		classes: [
			"slide",
			`slide-${layout}`,
			...(template ? ["astlide-tpl"] : []),
			...(templateLayout ? [`astlide-tpl-${templateLayout}`] : []),
			...(props.className ? [props.className] : []),
		],
		transition: props.transition ?? "fade",
		style,
		...(props.slideNumber && props.totalSlides
			? { ariaLabel: `Slide ${props.slideNumber} of ${props.totalSlides}` }
			: {}),
		...(templateArt ? { templateArt } : {}),
		templateNumber: !!(templateLayout && template?.layouts[templateLayout]?.slideNumber),
	};
}

const escapeAttr = (s: string) =>
	s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * A slide as HTML: `contentHtml` inside the slide's markup. `decorations` go
 * after the content, inside the slide (logos, footers …).
 */
export function renderSlideHtml(
	props: SlideShellProps,
	contentHtml: string,
	decorations = "",
): string {
	const shell = slideShell(props);
	const aria = shell.ariaLabel ? ` aria-label="${escapeAttr(shell.ariaLabel)}"` : "";
	const style = shell.style ? ` style="${escapeAttr(shell.style)}"` : "";
	return (
		`<section class="${escapeAttr(shell.classes.join(" "))}" data-transition="${escapeAttr(shell.transition)}"${style} role="region" aria-roledescription="slide"${aria}>` +
		(shell.templateArt ? `<div class="astlide-tpl-art">${shell.templateArt}</div>` : "") +
		`<div class="slide-content">${contentHtml}</div>` +
		(shell.templateNumber
			? `<div class="astlide-tpl-number">${props.slideNumber ?? ""}</div>`
			: "") +
		decorations +
		"</section>"
	);
}
