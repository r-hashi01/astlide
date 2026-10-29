/**
 * Astlide's slide components for React, with the markup of the Astro ones
 * (style them with `@astlide/core/styles/components.css`). MDX slides use
 * them by these names: see {@link mdxComponents}.
 *
 * @module
 */

import { httpUrl, imageUrl } from "@astlide/core/utils/safe-url";
import { sanitizeKaTeXOutput } from "@astlide/core/utils/sanitize";
import katex from "katex";
import type { CSSProperties, ReactNode } from "react";

/**
 * Settings for the components MDX slides use (see `createMdxComponents`).
 * Plain props, no React context: the components also work as React Server
 * Components (Next.js).
 */
export interface AstlideSettings {
	/** Turns a root-relative path ("/photo.jpg") into a URL (a site's base path). Default: as is. */
	resolveUrl?: (path: string) => string;
	/** Render `<SpeakerNotes>` (they are hidden; the presenter reads them). Default true. */
	notes?: boolean;
}

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ");
const resolve = (src: string, resolveUrl?: (path: string) => string) =>
	src.startsWith("/") && !src.startsWith("//") && resolveUrl ? resolveUrl(src) : src;

interface Children {
	children?: ReactNode;
	className?: string;
	/** MDX authors write `class`, as in the Astro components. */
	class?: string;
}
const classOf = (p: Children) => p.className ?? p.class;

/** The left column of the `two-column` layout. */
export function Left(props: Children) {
	return (
		<div className={cx("column", "column-left", classOf(props))} data-astlide-c="">
			{props.children}
		</div>
	);
}

/** The right column of the `two-column` layout. */
export function Right(props: Children) {
	return (
		<div className={cx("column", "column-right", classOf(props))} data-astlide-c="">
			{props.children}
		</div>
	);
}

export interface ColumnsProps extends Children {
	/** Number of equal columns (else one per child). */
	columns?: number;
	/** Gap between columns (CSS), default `2rem`. */
	gap?: string;
	align?: "start" | "center" | "end" | "stretch";
	/** Column widths, e.g. `1fr 2fr`. */
	widths?: string;
}

/** Side-by-side columns, anywhere in a slide. */
export function Columns({
	columns,
	gap = "2rem",
	align = "start",
	widths,
	...props
}: ColumnsProps) {
	const template = widths ?? (columns ? `repeat(${columns}, 1fr)` : undefined);
	const style: CSSProperties = {
		...(template ? { gridTemplateColumns: template } : {}),
		gap,
		alignItems: align,
	};
	return (
		<div className={cx("columns", classOf(props))} style={style} data-astlide-c="">
			{props.children}
		</div>
	);
}

export interface ImageSideProps extends Children {
	src: string;
	alt?: string;
	/** Width of the image side, default `50%`. */
	width?: string;
	/** Resolves a root-relative `src` (see {@link AstlideSettings.resolveUrl}). */
	resolveUrl?: (path: string) => string;
}

/** The picture of the `image-left` / `image-right` layouts. */
export function ImageSide({ src, alt = "", width = "50%", resolveUrl, ...props }: ImageSideProps) {
	return (
		<div
			className={cx("image-side", classOf(props))}
			data-astlide-c=""
			style={{ width, flexShrink: 0 }}
		>
			<img src={resolve(src, resolveUrl)} alt={alt} />
		</div>
	);
}

/** The text of the `image-left` / `image-right` layouts. */
export function TextPanel(props: Children) {
	return (
		<div className={cx("text-panel", classOf(props))} data-astlide-c="">
			{props.children}
		</div>
	);
}

export type FragmentEffect = "fade" | "slide-up" | "zoom" | "highlight";

export interface FragmentProps extends Children {
	/** Step number; fragments with the same index appear together. */
	index?: number;
	/** Step at which it disappears again. */
	until?: number;
	/** Visible first, gone at its step. */
	hide?: boolean;
	effect?: FragmentEffect;
}

/** Content revealed step by step (→ / space). */
export function Fragment({ index, until, hide = false, effect = "fade", ...props }: FragmentProps) {
	return (
		<span
			data-astlide-c=""
			data-fragment=""
			data-fragment-index={index ?? ""}
			data-fragment-until={until}
			data-fragment-hide={hide ? "" : undefined}
			data-fragment-visible={hide ? "true" : undefined}
			data-fragment-effect={effect}
			className={cx("fragment", classOf(props))}
		>
			{props.children}
		</span>
	);
}

/** Each item of a list (or each child) revealed one step at a time. */
export function Fragments({ effect = "fade", ...props }: Children & { effect?: FragmentEffect }) {
	return (
		<div data-fragment-group={effect} className={cx("fragments", classOf(props))}>
			{props.children}
		</div>
	);
}

/** Speaker notes: hidden on the slide, shown in the presenter window and the notes overlay. */
export function SpeakerNotes({ children }: { children?: ReactNode }) {
	return (
		<div className="slide-notes" data-slide-notes="" aria-hidden="true" data-astlide-c="">
			{children}
		</div>
	);
}

/** Alias of {@link SpeakerNotes}. */
export const Notes = SpeakerNotes;

export interface MathProps {
	formula: string;
	/** A block of its own (else inline). */
	display?: boolean;
	className?: string;
	class?: string;
}

/** A KaTeX formula, rendered when the page is rendered. */
export function Math({ formula, display = false, ...props }: MathProps) {
	const html = sanitizeKaTeXOutput(
		katex.renderToString(formula, {
			displayMode: display,
			throwOnError: false,
			output: "html",
			strict: false,
		}),
	);
	return (
		<span
			className={cx("math", display && "math-display", props.className ?? props.class)}
			data-astlide-c=""
			// biome-ignore lint/security/noDangerouslySetInnerHtml: KaTeX output, sanitized above
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	);
}

const VIDEO_URL = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

export interface YouTubeProps {
	/** Video id or URL. */
	id: string;
	title?: string;
	/** Start at this second. */
	start?: number;
	className?: string;
	class?: string;
}

/** A YouTube video (privacy-enhanced mode), with a thumbnail for print and export. */
export function YouTube({ id, title = "YouTube video", start, ...props }: YouTubeProps) {
	const candidate = id.match(VIDEO_URL)?.[1] ?? id.trim();
	if (!/^[\w-]{11}$/.test(candidate)) return null;
	const query = start !== undefined ? `?${new URLSearchParams({ start: String(start) })}` : "";
	return (
		<div className={cx("youtube-embed", props.className ?? props.class)} data-astlide-c="">
			<iframe
				src={`https://www.youtube-nocookie.com/embed/${candidate}${query}`}
				title={title}
				allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
				allowFullScreen
				loading="lazy"
			/>
			<a
				className="youtube-static"
				href={`https://www.youtube.com/watch?v=${candidate}${start !== undefined ? `&t=${start}s` : ""}`}
				data-astlide-static=""
				aria-hidden="true"
				tabIndex={-1}
			>
				<img src={`https://i.ytimg.com/vi/${candidate}/hqdefault.jpg`} alt="" />
				<svg className="youtube-play" viewBox="0 0 68 48" width="68" height="48" aria-hidden="true">
					<rect width="68" height="48" rx="12" fill="#ff0033" />
					<polygon points="27,14 27,34 45,24" fill="#ffffff" />
				</svg>
			</a>
		</div>
	);
}

export interface TweetProps {
	url: string;
	text: string;
	author: string;
	handle: string;
	date?: string;
	avatar?: string;
	className?: string;
	class?: string;
}

/** A post on X as a static card (no third-party script). */
export function Tweet({ url, text, author, handle, date, avatar, ...props }: TweetProps) {
	const href = httpUrl(url);
	const picture = imageUrl(avatar);
	return (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			className={cx("tweet-card", props.className ?? props.class)}
			data-astlide-c=""
			aria-label={`Tweet by ${author}: ${text}`}
		>
			<div className="tweet-header">
				{picture ? (
					<img src={picture} alt={author} className="tweet-avatar" width="40" height="40" />
				) : (
					<div className="tweet-avatar-placeholder" aria-hidden="true" />
				)}
				<div className="tweet-author">
					<span className="tweet-name">{author}</span>
					<span className="tweet-handle">{handle.startsWith("@") ? handle : `@${handle}`}</span>
				</div>
				<svg
					className="tweet-logo"
					viewBox="0 0 24 24"
					aria-hidden="true"
					fill="#1d9bf0"
					width="20"
					height="20"
				>
					<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.259 5.63 5.905-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
				</svg>
			</div>
			<p className="tweet-text">{text}</p>
			{date && <time className="tweet-date">{date}</time>}
		</a>
	);
}
