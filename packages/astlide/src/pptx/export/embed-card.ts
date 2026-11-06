/**
 * The stand-in for an embed with no static one (an `<iframe>` of another site).
 *
 * @module
 */

import { bitmapSize } from "@astlide/core/engine";
import type { EmbedInfo } from "./embeds";
import { placeBackground, type RemoteImages } from "./images";
import type { SlideElement } from "./ooxml/spec";

/** `text` cut to about `chars` characters, with an ellipsis (captions don't wrap). */
const fit = (text: string, chars: number) =>
	text.length <= chars ? text : `${text.slice(0, Math.max(1, Math.floor(chars) - 1)).trimEnd()}…`;

/**
 * An embed with no static stand-in (an `<iframe>` of another site): a card
 * in its place naming what it shows, linked to it — its content can only be
 * drawn by a browser.
 */
export function embedCard(
	item: { x: number; y: number; w: number; h: number; src: string; title: string },
	fontFace: string,
	k: number,
	remoteImages: RemoteImages,
	info?: EmbedInfo,
): SlideElement[] {
	let host = item.src;
	try {
		host = new URL(item.src).host;
	} catch {}
	const label = info?.title || item.title || host || "Embedded content";
	const web = (url: string | undefined) => (url && /^https?:\/\//i.test(url) ? url : undefined);
	const link = web(info?.link) ?? web(item.src);
	const size = Math.max(12, Math.min(28, item.h / 8));
	// With a thumbnail: the picture (cover), linked, with the title along the bottom.
	const thumb = info?.thumbnail ? remoteImages.get(info.thumbnail) : null;
	const bitmap = thumb ? bitmapSize(thumb) : null;
	const place =
		thumb && bitmap
			? placeBackground(item, { size: "cover", position: "center" }, bitmap.size)
			: null;
	if (thumb && bitmap && place) {
		const bar = Math.max(size * 2, item.h * 0.16);
		return [
			{
				type: "image",
				x: place.visible.x * k,
				y: place.visible.y * k,
				w: place.visible.w * k,
				h: place.visible.h * k,
				data: thumb,
				format: bitmap.format,
				crop: place.crop,
				link,
			},
			{
				type: "rect",
				x: item.x * k,
				y: (item.y + item.h - bar) * k,
				w: item.w * k,
				h: bar * k,
				fill: "000000",
				fillTransparency: 40,
			},
			{
				type: "textbox",
				runs: [
					{
						text: `▶ ${fit(label, (item.w - size * 1.2) / (size * 0.8 * 0.58))}`,
						options: {
							fontSize: size * 0.8 * k * 72,
							color: "FFFFFF",
							fontFace,
							bold: true,
						},
					},
				],
				x: (item.x + size * 0.6) * k,
				y: (item.y + item.h - bar) * k,
				w: (item.w - size * 1.2) * k,
				h: bar * k,
				valign: "middle",
				wrap: false,
				inset: 0,
			},
		];
	}
	return [
		{
			type: "rect",
			x: item.x * k,
			y: item.y * k,
			w: item.w * k,
			h: item.h * k,
			fill: "F1F5F9",
			line: { color: "CBD5E1", width: 1 },
			radius: 8 * k,
		},
		{
			type: "textbox",
			runs: [
				{
					text: `▶ ${label}`,
					options: {
						fontSize: size * k * 72,
						color: "334155",
						fontFace,
						bold: true,
						breakLine: true,
						align: "center",
					},
				},
				{
					text: link ?? "",
					options: {
						fontSize: size * 0.7 * k * 72,
						color: "2563EB",
						fontFace,
						underline: !!link,
						hyperlink: link ? { url: link } : undefined,
						align: "center",
					},
				},
			],
			x: item.x * k,
			y: item.y * k,
			w: item.w * k,
			h: item.h * k,
			align: "center",
			valign: "middle",
			wrap: true,
		},
	];
}
