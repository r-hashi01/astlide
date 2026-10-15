/**
 * Spike oracle: lay out the print view in Chromium and record, per slide,
 * every element's box and every text line fragment — the reference the
 * browser-free engine is compared against.
 *
 *   bun spike/oracle.ts <siteUrl> <deck> <fontDir> <out.json> [slideCount]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const [siteUrl, deck, fontDir, out, count = "3"] = process.argv.slice(2);
const face = (family: string, file: string, w: number) => {
	const b64 = readFileSync(join(fontDir as string, file)).toString("base64");
	return `@font-face{font-family:"${family}";font-weight:${w};src:url(data:font/ttf;base64,${b64}) format("truetype")}`;
};
const faces = [
	...[400, 600, 700].map((w) => face("Inter", `inter-${w}.ttf`, w)),
	...[400, 700].map((w) => face("JetBrains Mono", `jbmono-${w}.ttf`, w)),
].join("\n");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`${siteUrl}/${deck}/all/`);
await page.addStyleTag({ content: faces });
await page.evaluate(async () => {
	for (const w of [400, 600, 700]) await document.fonts.load(`${w} 16px Inter`);
	for (const w of [400, 700]) await document.fonts.load(`${w} 16px "JetBrains Mono"`);
	await new Promise((r) =>
		document.documentElement.hasAttribute("data-diagrams-ready") ? r(null) : setTimeout(r, 3000),
	);
	await document.fonts.ready;
});

const result = await page.evaluate((n: number) => {
	const slides = Array.from(document.querySelectorAll<HTMLElement>("body > .slide")).slice(0, n);
	return slides.map((slide) => {
		const box = slide.getBoundingClientRect();
		const rel = (r: DOMRect) => ({
			x: r.left - box.left,
			y: r.top - box.top,
			w: r.width,
			h: r.height,
		});
		const elements = Array.from(slide.querySelectorAll("*")).map((el, eid) => ({
			eid,
			tag: el.tagName.toLowerCase(),
			...rel(el.getBoundingClientRect()),
		}));
		// Text line fragments: per text node, consecutive characters on one line.
		const lines: { text: string; x: number; y: number; w: number; h: number }[] = [];
		const walker = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT);
		const range = document.createRange();
		for (
			let node = walker.nextNode() as Text | null;
			node;
			node = walker.nextNode() as Text | null
		) {
			let cur: { text: string; top: number; l: number; r: number; t: number; b: number } | null =
				null;
			const flush = () => {
				if (cur && cur.text.trim()) {
					lines.push({
						text: cur.text.trim(),
						x: cur.l - box.left,
						y: cur.t - box.top,
						w: cur.r - cur.l,
						h: cur.b - cur.t,
					});
				}
				cur = null;
			};
			for (let i = 0; i < node.data.length; i++) {
				range.setStart(node, i);
				range.setEnd(node, i + 1);
				const r = range.getBoundingClientRect();
				if (r.width === 0 && r.height === 0) continue;
				const ch = node.data[i] as string;
				const c = cur as typeof cur;
				if (c && Math.abs(r.top - c.top) < 1) {
					c.text += ch;
					if (ch.trim()) c.r = r.right;
					c.b = Math.max(c.b, r.bottom);
				} else {
					flush();
					if (!ch.trim()) continue;
					cur = { text: ch, top: r.top, l: r.left, r: r.right, t: r.top, b: r.bottom };
				}
			}
			flush();
		}
		return { width: box.width, height: box.height, elements, lines };
	});
}, Number(count));

writeFileSync(out as string, JSON.stringify(result, null, 1));
console.log(
	`oracle: ${result.length} slides, ${result.map((s) => s.lines.length).join("/")} lines → ${out}`,
);
await browser.close();
