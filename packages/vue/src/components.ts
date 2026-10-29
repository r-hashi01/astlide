/**
 * Astlide's slide components for Vue, with the markup of the Astro ones
 * (style them with `@astlide/core/styles/components.css`). Functional
 * components written with `h()`: no SFC compiler needed. MDX slides use them
 * by these names: see `createMdxComponents`.
 *
 * @module
 */

import { httpUrl, imageUrl } from "@astlide/core/utils/safe-url";
import { sanitizeKaTeXOutput } from "@astlide/core/utils/sanitize";
import katex from "katex";
import { defineComponent, type FunctionalComponent, h, ref, type SetupContext, useId } from "vue";

/** Settings for the components MDX slides use (see `createMdxComponents`). */
export interface AstlideSettings {
	/** Turns a root-relative path ("/photo.jpg") into a URL (a site's base path). Default: as is. */
	resolveUrl?: (path: string) => string;
	/** Render `<SpeakerNotes>` (hidden; the presenter reads them). Default true. */
	notes?: boolean;
}

type WithClass = { class?: string; className?: string };
const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ");
const classOf = (p: WithClass) => p.className ?? p.class;
const slot = (ctx: Pick<SetupContext, "slots">) => ctx.slots.default?.();

/** The left column of the `two-column` layout. */
export const Left: FunctionalComponent<WithClass> = (props, ctx) =>
	h("div", { class: cx("column", "column-left", classOf(props)), "data-astlide-c": "" }, slot(ctx));
Left.props = ["class", "className"];

/** The right column of the `two-column` layout. */
export const Right: FunctionalComponent<WithClass> = (props, ctx) =>
	h(
		"div",
		{ class: cx("column", "column-right", classOf(props)), "data-astlide-c": "" },
		slot(ctx),
	);
Right.props = ["class", "className"];

export interface ColumnsProps extends WithClass {
	columns?: number;
	gap?: string;
	align?: "start" | "center" | "end" | "stretch";
	widths?: string;
}

/** Side-by-side columns, anywhere in a slide. */
export const Columns: FunctionalComponent<ColumnsProps> = (props, ctx) => {
	const template = props.widths ?? (props.columns ? `repeat(${props.columns}, 1fr)` : undefined);
	const style = [
		template ? `grid-template-columns: ${template}` : "",
		`gap: ${props.gap ?? "2rem"}`,
		`align-items: ${props.align ?? "start"}`,
	]
		.filter(Boolean)
		.join("; ");
	return h("div", { class: cx("columns", classOf(props)), style, "data-astlide-c": "" }, slot(ctx));
};
Columns.props = ["columns", "gap", "align", "widths", "class", "className"];

export interface ImageSideProps extends WithClass {
	src: string;
	alt?: string;
	width?: string;
	resolveUrl?: (path: string) => string;
}

/** The picture of the `image-left` / `image-right` layouts. */
export const ImageSide: FunctionalComponent<ImageSideProps> = (props) => {
	const src =
		props.src.startsWith("/") && !props.src.startsWith("//") && props.resolveUrl
			? props.resolveUrl(props.src)
			: props.src;
	return h(
		"div",
		{
			class: cx("image-side", classOf(props)),
			"data-astlide-c": "",
			style: `width: ${props.width ?? "50%"}; flex-shrink: 0;`,
		},
		[h("img", { src, alt: props.alt ?? "" })],
	);
};
ImageSide.props = ["src", "alt", "width", "resolveUrl", "class", "className"];

/** The text of the `image-left` / `image-right` layouts. */
export const TextPanel: FunctionalComponent<WithClass> = (props, ctx) =>
	h("div", { class: cx("text-panel", classOf(props)), "data-astlide-c": "" }, slot(ctx));
TextPanel.props = ["class", "className"];

export type FragmentEffect = "fade" | "slide-up" | "zoom" | "highlight";

export interface FragmentProps extends WithClass {
	index?: number;
	until?: number;
	hide?: boolean;
	effect?: FragmentEffect;
}

/** Content revealed step by step (→ / space). */
export const Fragment: FunctionalComponent<FragmentProps> = (props, ctx) =>
	h(
		"span",
		{
			"data-astlide-c": "",
			"data-fragment": "",
			"data-fragment-index": props.index ?? "",
			"data-fragment-until": props.until,
			"data-fragment-hide": props.hide ? "" : undefined,
			"data-fragment-visible": props.hide ? "true" : undefined,
			"data-fragment-effect": props.effect ?? "fade",
			class: cx("fragment", classOf(props)),
		},
		slot(ctx),
	);
Fragment.props = ["index", "until", "hide", "effect", "class", "className"];

/** Each item of a list (or each child) revealed one step at a time. */
export const Fragments: FunctionalComponent<WithClass & { effect?: FragmentEffect }> = (
	props,
	ctx,
) =>
	h(
		"div",
		{ "data-fragment-group": props.effect ?? "fade", class: cx("fragments", classOf(props)) },
		slot(ctx),
	);
Fragments.props = ["effect", "class", "className"];

/** Speaker notes: hidden on the slide, shown in the presenter window and the notes overlay. */
export const SpeakerNotes: FunctionalComponent = (_, ctx) =>
	h(
		"div",
		{ class: "slide-notes", "data-slide-notes": "", "aria-hidden": "true", "data-astlide-c": "" },
		slot(ctx),
	);

/** Alias of {@link SpeakerNotes}. */
export const Notes = SpeakerNotes;

export interface MathProps extends WithClass {
	formula: string;
	display?: boolean;
}

/** A KaTeX formula, rendered when the page is rendered. */
export const Math: FunctionalComponent<MathProps> = (props) =>
	h("span", {
		class: cx("math", props.display && "math-display", classOf(props)),
		"data-astlide-c": "",
		innerHTML: sanitizeKaTeXOutput(
			katex.renderToString(props.formula, {
				displayMode: !!props.display,
				throwOnError: false,
				output: "html",
				strict: false,
			}),
		),
	});
Math.props = ["formula", "display", "class", "className"];

const VIDEO_URL = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

export interface YouTubeProps extends WithClass {
	id: string;
	title?: string;
	start?: number;
}

/** A YouTube video (privacy-enhanced mode), with a thumbnail for print and export. */
export const YouTube: FunctionalComponent<YouTubeProps> = (props) => {
	const id = props.id.match(VIDEO_URL)?.[1] ?? props.id.trim();
	if (!/^[\w-]{11}$/.test(id)) return null;
	const start = props.start;
	const query = start !== undefined ? `?${new URLSearchParams({ start: String(start) })}` : "";
	return h("div", { class: cx("youtube-embed", classOf(props)), "data-astlide-c": "" }, [
		h("iframe", {
			src: `https://www.youtube-nocookie.com/embed/${id}${query}`,
			title: props.title ?? "YouTube video",
			allow:
				"accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
			allowfullscreen: "",
			loading: "lazy",
		}),
		h(
			"a",
			{
				class: "youtube-static",
				href: `https://www.youtube.com/watch?v=${id}${start !== undefined ? `&t=${start}s` : ""}`,
				"data-astlide-static": "",
				"aria-hidden": "true",
				tabindex: "-1",
			},
			[
				h("img", { src: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, alt: "" }),
				h(
					"svg",
					{
						class: "youtube-play",
						viewBox: "0 0 68 48",
						width: "68",
						height: "48",
						"aria-hidden": "true",
					},
					[
						h("rect", { width: "68", height: "48", rx: "12", fill: "#ff0033" }),
						h("polygon", { points: "27,14 27,34 45,24", fill: "#ffffff" }),
					],
				),
			],
		),
	]);
};
YouTube.props = ["id", "title", "start", "class", "className"];

export interface TweetProps extends WithClass {
	url: string;
	text: string;
	author: string;
	handle: string;
	date?: string;
	avatar?: string;
}

/** A post on X as a static card (no third-party script). */
export const Tweet: FunctionalComponent<TweetProps> = (props) => {
	const avatar = imageUrl(props.avatar);
	return h(
		"a",
		{
			href: httpUrl(props.url),
			target: "_blank",
			rel: "noopener noreferrer",
			class: cx("tweet-card", classOf(props)),
			"data-astlide-c": "",
			"aria-label": `Tweet by ${props.author}: ${props.text}`,
		},
		[
			h("div", { class: "tweet-header" }, [
				avatar
					? h("img", {
							src: avatar,
							alt: props.author,
							class: "tweet-avatar",
							width: "40",
							height: "40",
						})
					: h("div", { class: "tweet-avatar-placeholder", "aria-hidden": "true" }),
				h("div", { class: "tweet-author" }, [
					h("span", { class: "tweet-name" }, props.author),
					h(
						"span",
						{ class: "tweet-handle" },
						props.handle.startsWith("@") ? props.handle : `@${props.handle}`,
					),
				]),
				h(
					"svg",
					{
						class: "tweet-logo",
						viewBox: "0 0 24 24",
						"aria-hidden": "true",
						fill: "#1d9bf0",
						width: "20",
						height: "20",
					},
					[
						h("path", {
							d: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.259 5.63 5.905-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z",
						}),
					],
				),
			]),
			h("p", { class: "tweet-text" }, props.text),
			props.date ? h("time", { class: "tweet-date" }, props.date) : null,
		],
	);
};
Tweet.props = ["url", "text", "author", "handle", "date", "avatar", "class", "className"];

/** A code block with a title and a copy button (the copy runs in the browser). */
export const CodeBlock = defineComponent({
	name: "CodeBlock",
	props: { title: String, class: String, className: String },
	setup(props, ctx) {
		const label = ref<"Copy" | "✓ Copied!" | "Failed">("Copy");
		// Stable between the server render and hydration.
		const id = `cb-${useId().replace(/[^\w-]/g, "")}`;
		const copy = async () => {
			const pre = document.getElementById(id)?.querySelector("pre");
			if (!pre) return;
			try {
				await navigator.clipboard.writeText(pre.textContent ?? "");
				label.value = "✓ Copied!";
			} catch {
				label.value = "Failed";
			}
			setTimeout(() => {
				label.value = "Copy";
			}, 2000);
		};
		return () =>
			h(
				"div",
				{ class: cx("code-block", props.className ?? props.class), id, "data-astlide-c": "" },
				[
					h("div", { class: "code-block-header" }, [
						props.title ? h("span", { class: "code-block-title" }, props.title) : null,
						h(
							"button",
							{
								class: "code-block-copy",
								"data-cb": id,
								"data-copied": label.value === "✓ Copied!" ? "" : undefined,
								type: "button",
								"aria-label": "Copy code to clipboard",
								onClick: copy,
							},
							label.value,
						),
					]),
					h("div", { class: "code-block-content" }, ctx.slots.default?.()),
				],
			);
	},
});
