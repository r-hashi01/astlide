/**
 * The PowerPoint exporter's output, part by part, against files checked in
 * under `golden/pptx/`: a print view written for the test (its only font is
 * a local one, so nothing is downloaded) laid out and written to a `.pptx`.
 * Any change to what the exporter writes shows up here as a diff.
 *
 * After an intended change: `UPDATE_GOLDEN=1 bun run test pptx-golden`, and
 * review the diff of `golden/pptx/`.
 */

import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { deflateSync } from "node:zlib";
import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pptxFromPrintView } from "../src/pptx/export/export";
import { silentReporter } from "../src/utils/reporter";

const GOLDEN = join(import.meta.dirname, "golden", "pptx");
const UPDATE = process.env.UPDATE_GOLDEN === "1";

/** A 4×2 PNG: red on top, blue below. */
function png(): Buffer {
	const chunk = (type: string, data: Buffer) => {
		const body = Buffer.concat([Buffer.from(type), data]);
		const length = Buffer.alloc(4);
		length.writeUInt32BE(data.length);
		const crc = Buffer.alloc(4);
		crc.writeUInt32BE(crc32(body));
		return Buffer.concat([length, body, crc]);
	};
	const header = Buffer.alloc(13);
	header.writeUInt32BE(4, 0);
	header.writeUInt32BE(2, 4);
	header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
	const row = (r: number, g: number, b: number) =>
		Buffer.from([0, ...Array.from({ length: 4 }, () => [r, g, b]).flat()]);
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", header),
		chunk("IDAT", deflateSync(Buffer.concat([row(220, 38, 38), row(37, 99, 235)]))),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

function crc32(data: Buffer): number {
	let crc = ~0;
	for (const byte of data) {
		crc ^= byte;
		for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
	}
	return ~crc >>> 0;
}

const CSS = `
@font-face { font-family: "Golden"; src: url(/fonts/golden.ttf) format("truetype"); }
:root {
	--color-background: #ffffff; --color-foreground: #1f2937; --color-primary: #7c3aed;
	--color-secondary: #475569; --color-accent: #ea580c; --color-muted: #f1f5f9;
}
html, body { margin: 0; }
body { font-family: "Golden"; color: var(--color-foreground); }
.slide { position: relative; width: 1920px; height: 1080px; overflow: hidden; box-sizing: border-box; padding: 96px 128px; background: var(--color-background); }
h1 { font-size: 96px; margin: 0 0 48px; color: var(--color-primary); }
p { font-size: 40px; line-height: 1.4; margin: 0 0 24px; }
a { color: var(--color-accent); }
.card { width: 640px; padding: 32px; border: 4px solid var(--color-secondary); border-radius: 24px; background: var(--color-muted); }
ul { font-size: 36px; margin: 0; padding-left: 48px; }
img { position: absolute; right: 128px; top: 96px; width: 400px; height: 200px; }
table { border-collapse: collapse; font-size: 32px; }
td, th { border: 2px solid var(--color-secondary); padding: 12px 24px; }
pre { font-size: 28px; background: #0f172a; color: #e2e8f0; padding: 24px; margin: 32px 0 0; }
`;

const HTML = `<!doctype html>
<html lang="en" data-print data-astlide-all>
<head><meta charset="utf-8"><title>Golden</title><link rel="stylesheet" href="/style.css"></head>
<body>
<section class="slide" style="background: #fef3c7">
<h1>A golden deck</h1>
<p>Plain, <strong>bold</strong>, <em>italic</em> and <span style="color: #059669">green</span> text, with <a href="https://astlide.dev/">a link</a>.</p>
<p style="text-align: center">Centred, and long enough to wrap onto a second line inside the slide's width at this size.</p>
<div data-slide-notes="meta" hidden>Say the first thing.
Then the second.</div>
</section>
<section class="slide">
<div class="card"><ul><li>One</li><li>Two, <strong>bold</strong></li><li>Three</li></ul></div>
<img src="/picture.png" alt="Two bands">
</section>
<section class="slide">
<table><tr><th>Name</th><th>Value</th></tr><tr><td>Alpha</td><td>1</td></tr><tr><td>Beta</td><td>22</td></tr></table>
<pre><code>const answer = 42;
console.log(answer);</code></pre>
</section>
</body>
</html>
`;

let base: string;

/** Export the fixture; the `.pptx`'s bytes. */
async function exportFixture(name: string): Promise<Buffer> {
	const site = join(base, "site");
	const output = join(base, `${name}.pptx`);
	await pptxFromPrintView({
		html: join(site, "golden", "all", "index.html"),
		site,
		root: base,
		deck: "golden",
		config: { title: "Golden", author: "Astlide" },
		output,
		reporter: silentReporter,
	});
	return readFileSync(output);
}

beforeAll(() => {
	base = mkdtempSync(join(tmpdir(), "astlide-pptx-golden-"));
	const site = join(base, "site");
	mkdirSync(join(site, "golden", "all"), { recursive: true });
	mkdirSync(join(site, "fonts"));
	const katex = dirname(createRequire(import.meta.url).resolve("katex/package.json"));
	copyFileSync(
		join(katex, "dist", "fonts", "KaTeX_Main-Regular.ttf"),
		join(site, "fonts", "golden.ttf"),
	);
	writeFileSync(join(site, "style.css"), CSS);
	writeFileSync(join(site, "picture.png"), png());
	writeFileSync(join(site, "golden", "all", "index.html"), HTML);
	process.env.SOURCE_DATE_EPOCH = String(Date.UTC(2026, 0, 2, 3, 4, 6) / 1000);
});
afterAll(() => {
	delete process.env.SOURCE_DATE_EPOCH;
	rmSync(base, { recursive: true, force: true });
});

const sha256 = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

describe("PowerPoint export (golden)", () => {
	it("writes the same file every time for the same slides and SOURCE_DATE_EPOCH", async () => {
		const first = await exportFixture("first");
		const second = await exportFixture("second");
		expect(sha256(second)).toBe(sha256(first));
	});

	it("writes the parts checked in under golden/pptx", async () => {
		const zip = await JSZip.loadAsync(await exportFixture("golden"));
		const names = Object.keys(zip.files)
			.filter((n) => !zip.files[n]?.dir)
			.sort();
		// Text parts as they are; binary parts (pictures, fonts) by hash.
		const binaries: Record<string, string> = {};
		const texts = new Map<string, string>();
		for (const name of names) {
			const file = zip.file(name);
			if (!file) continue;
			if (/\.(xml|rels)$/.test(name)) texts.set(name, await file.async("string"));
			else binaries[name] = sha256(await file.async("uint8array"));
		}
		const manifest = `${JSON.stringify({ parts: names, binaries }, null, "\t")}\n`;
		if (UPDATE) {
			rmSync(GOLDEN, { recursive: true, force: true });
			for (const [name, text] of texts) {
				mkdirSync(dirname(join(GOLDEN, name)), { recursive: true });
				writeFileSync(join(GOLDEN, name), text);
			}
			writeFileSync(join(GOLDEN, "manifest.json"), manifest);
			return;
		}
		expect(manifest).toBe(readFileSync(join(GOLDEN, "manifest.json"), "utf-8"));
		for (const [name, text] of texts)
			expect(text, name).toBe(readFileSync(join(GOLDEN, name), "utf-8"));
	});
});
