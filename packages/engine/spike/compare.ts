/**
 * Spike: run the engine on a built print view and compare with the oracle.
 *   bun spike/compare.ts <distDir> <deck> <fontDir> <oracle.json> [slideCount]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FontRegistry, layoutPage } from "../src/index";

const [dist, deck, fontDir, oraclePath, count = "3"] = process.argv.slice(2) as string[];
const fonts = new FontRegistry();
for (const w of [400, 600, 700]) fonts.add("Inter", w, false, join(fontDir, `inter-${w}.ttf`));
for (const w of [400, 700]) fonts.add("JetBrains Mono", w, false, join(fontDir, `jbmono-${w}.ttf`));
fonts.addFallback("/System/Library/Fonts/Apple Color Emoji.ttc");
const vp = { width: 1920, height: 1080, media: "screen" as const };
const t0 = performance.now();
const slides = layoutPage(join(dist, deck, "all", "index.html"), dist, fonts, vp).slice(
	0,
	Number(count),
);
const ms = performance.now() - t0;
const oracle = JSON.parse(readFileSync(oraclePath, "utf-8")) as {
	elements: { eid: number; tag: string; x: number; y: number; w: number; h: number }[];
	lines: { text: string; x: number; y: number; w: number; h: number }[];
}[];

const f = (n: number) => (Math.round(n * 10) / 10).toFixed(1).padStart(7);
let worst = 0;
let lineTotal = 0;
let lineMatched = 0;
slides.forEach((s, i) => {
	const o = oracle[i];
	if (!o) return;
	console.log(`\n── slide ${i + 1}: lines engine ${s.lines.length} / chrome ${o.lines.length}`);
	const n = Math.max(s.lines.length, o.lines.length);
	for (let k = 0; k < n; k++) {
		const e = s.lines[k];
		const c = o.lines[k];
		lineTotal++;
		if (!e || !c) {
			console.log(
				`  ${k}: missing ${e ? "in chrome" : "in engine"}: ${JSON.stringify((e ?? c)?.text)}`,
			);
			continue;
		}
		const same = e.text === c.text;
		const d = Math.max(
			Math.abs(e.x - c.x),
			Math.abs(e.y - c.y),
			Math.abs(e.w - c.w),
			Math.abs(e.h - c.h),
		);
		if (same) {
			lineMatched++;
			worst = Math.max(worst, d);
		}
		console.log(
			`  ${same ? (d <= 1 ? "✓" : "~") : "✗"} dx${f(e.x - c.x)} dy${f(e.y - c.y)} dw${f(e.w - c.w)} dh${f(e.h - c.h)}  ${JSON.stringify(c.text.slice(0, 40))}${same ? "" : ` ≠ ${JSON.stringify(e.text.slice(0, 40))}`}`,
		);
	}
	// Block boxes
	const bad = s.boxes
		.map((b) => ({ b, c: o.elements[b.eid] }))
		.filter(
			({ b, c }) =>
				c &&
				c.tag === b.tag &&
				Math.max(
					Math.abs(b.x - c.x),
					Math.abs(b.y - c.y),
					Math.abs(b.w - c.w),
					Math.abs(b.h - c.h),
				) > 1,
		);
	console.log(`  boxes: ${s.boxes.length} compared, ${bad.length} off by > 1px`);
	for (const { b, c } of bad.slice(0, 6)) {
		console.log(
			`    <${b.tag}> eid ${b.eid}: engine ${f(b.x)}${f(b.y)}${f(b.w)}${f(b.h)}  chrome ${f(c!.x)}${f(c!.y)}${f(c!.w)}${f(c!.h)}`,
		);
	}
});
console.log(
	`\nlines with matching text: ${lineMatched}/${lineTotal}; worst delta among them: ${worst.toFixed(2)}px; layout time ${ms.toFixed(0)}ms`,
);
