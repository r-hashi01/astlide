import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { svgToPng } from "@astlide/engine";
import { describe, expect, it } from "vitest";

/** 1×1 red PNG. */
const RED = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
	"base64",
);

/** Red channel of the PNG's first pixel (filter byte, then RGBA). */
async function firstRed(png: Buffer): Promise<number> {
	const { inflateSync } = await import("node:zlib");
	const chunks: Buffer[] = [];
	for (let at = 8; at < png.length; ) {
		const len = png.readUInt32BE(at);
		if (png.toString("latin1", at + 4, at + 8) === "IDAT")
			chunks.push(png.subarray(at + 8, at + 8 + len));
		at += 12 + len;
	}
	return inflateSync(Buffer.concat(chunks))[1] ?? 0;
}

/** A 10×10 SVG drawing one `<image>` with the given link attribute. */
const image = (link: string) =>
	`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="10" height="10"><image ${link} width="10" height="10"/></svg>`;

describe("svgToPng", () => {
	const dir = mkdtempSync(join(tmpdir(), "astlide-svg-"));
	const file = join(dir, "local'red.png");
	writeFileSync(file, RED);

	it("doesn't load images from the file system", async () => {
		const links = [
			`href="${file}"`,
			`href='${file.replaceAll("'", "&apos;")}'`,
			`xlink:href="${file}"`,
			// …nor through an SVG inlined as a data: URL.
			`href="data:image/svg+xml;base64,${Buffer.from(image(`href="${file}"`)).toString("base64")}"`,
		];
		for (const link of links) expect(await firstRed(svgToPng(image(link), 10, []))).toBe(0);
	});

	it("draws inline raster images", async () => {
		expect(
			await firstRed(
				svgToPng(image(`href="data:image/png;base64,${RED.toString("base64")}"`), 10, []),
			),
		).toBe(255);
	});
});
