/**
 * A slide: the `<section class="slide …">` of an Astlide site around its
 * content — layout classes, background, a PowerPoint template's artwork and
 * slide number (style with `@astlide/core/styles/slide.css`).
 *
 * @module
 */

import {
	backgroundDeclarations,
	type SlideShellProps,
	slideShell,
} from "@astlide/core/runtime/slide";
import type { CSSProperties, ReactNode } from "react";

export interface SlideProps extends SlideShellProps {
	children?: ReactNode;
	/**
	 * The content as HTML instead of children: a Markdown, HTML or
	 * PowerPoint slide read with `readDeck` (already sanitized there).
	 */
	html?: string;
	/** Rendered after the content, inside the slide (logos, footers …). */
	decorations?: ReactNode;
}

const camel = (property: string) =>
	property.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

export function Slide({ children, html, decorations, ...props }: SlideProps) {
	const { resolveUrl } = props;
	const shell = slideShell(props);
	const style = Object.fromEntries(
		backgroundDeclarations(props.background, resolveUrl).map(([p, v]) => [camel(p), v]),
	) as CSSProperties;
	return (
		<section
			className={shell.classes.join(" ")}
			data-transition={shell.transition}
			style={shell.style ? style : undefined}
			role="region"
			aria-roledescription="slide"
			aria-label={shell.ariaLabel}
		>
			{shell.templateArt && (
				<div
					className="astlide-tpl-art"
					// biome-ignore lint/security/noDangerouslySetInnerHtml: the template's artwork, scripts removed when it was read
					dangerouslySetInnerHTML={{ __html: shell.templateArt }}
				/>
			)}
			{html === undefined ? (
				<div className="slide-content">{children}</div>
			) : (
				// biome-ignore lint/security/noDangerouslySetInnerHtml: slide HTML from readDeck (scripts removed unless slideScripts)
				<div className="slide-content" dangerouslySetInnerHTML={{ __html: html }} />
			)}
			{shell.templateNumber && <div className="astlide-tpl-number">{props.slideNumber}</div>}
			{decorations}
		</section>
	);
}
