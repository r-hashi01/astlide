#!/usr/bin/env node
/**
 * Render the docs' share image (`docs/public/og.png`, 1200×630).
 *
 * The logo comes from `docs/src/assets/logo-dark.svg`; the fanned slides on the
 * right repeat the mark at size. Fonts load from Google Fonts, so this needs a
 * network connection.
 *
 * Usage:
 *   node scripts/og-image.mjs [--out docs/public/og.png]
 */

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { chromium } from "playwright";

const { values } = parseArgs({
	options: { out: { type: "string", default: "docs/public/og.png" } },
});

const ink = "#1C1917";
const paper = "#FAF7F2";
const primary = "#C8322A";
const primaryOnDark = "#FF6B5E";
const accent = "#F2B705";

const logo = `data:image/svg+xml;base64,${readFileSync("docs/src/assets/logo-dark.svg").toString("base64")}`;

// Slides fan out around their bottom center, like the mark.
const card = (angle, style, content = "") =>
	`<div class="card" style="transform: rotate(${angle}deg); ${style}">${content}</div>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Noto+Sans+JP:wght@500&family=Inter:wght@400&display=swap">
<style>
	body { margin: 0; }
	.og { width: 1200px; height: 630px; box-sizing: border-box; padding: 0 80px; background: ${ink};
		display: flex; align-items: center; position: relative; overflow: hidden; font-family: Inter, sans-serif; }
	.text { display: flex; flex-direction: column; gap: 28px; width: 560px; }
	.brand { display: flex; align-items: center; gap: 20px; }
	.brand span { font-family: "Space Grotesk", sans-serif; font-weight: 700; font-size: 84px; letter-spacing: -0.03em; color: ${paper}; }
	h1 { margin: 0; font-family: "Space Grotesk", sans-serif; font-weight: 700; font-size: 40px; line-height: 1.25; color: ${paper}; }
	.ja { margin: 0; font-family: "Noto Sans JP", sans-serif; font-weight: 500; font-size: 22px; line-height: 1.6; color: #D6D3D1; }
	.site { margin: 8px 0 0; font-size: 20px; color: #A8A29E; }
	.fan { position: absolute; left: 700px; top: 150px; width: 400px; height: 260px; }
	.card { position: absolute; inset: 0; border-radius: 18px; transform-origin: 50% 100%; box-sizing: border-box; }
	.front { padding: 30px 28px; display: flex; flex-direction: column; gap: 14px; overflow: hidden; }
	.front::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 10px; background: ${primary}; }
	.title { font-family: "Space Grotesk", sans-serif; font-weight: 700; font-size: 28px; color: ${ink}; margin-bottom: 6px; }
	.line { height: 10px; border-radius: 5px; background: #F3E2DA; }
	.dot { position: absolute; right: 24px; bottom: 22px; width: 16px; height: 16px; border-radius: 50%; background: ${accent}; }
</style>
</head>
<body>
<div class="og">
	<div class="text">
		<div class="brand"><img src="${logo}" width="92" height="92" alt=""><span>astlide</span></div>
		<h1>Slides that live in<br>your Astro site</h1>
		<p class="ja">Markdown で書いて、会社のテンプレートの<br>PowerPoint で渡せる</p>
		<p class="site">astlide.dev</p>
	</div>
	<div class="fan">
		${card(-18, `background: ${accent};`)}
		${card(-6, `background: ${primaryOnDark}; opacity: 0.75;`)}
		${card(
			7,
			`background: ${paper};`,
			`<div class="title">Quarterly review</div><div class="line" style="width: 78%"></div><div class="line" style="width: 62%"></div><div class="line" style="width: 70%"></div><div class="dot"></div>`,
		).replace('class="card"', 'class="card front"')}
	</div>
</div>
</body>
</html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.locator(".og").screenshot({ path: values.out });
await browser.close();
console.log(`Wrote ${values.out}`);
