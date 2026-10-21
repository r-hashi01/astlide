import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assetExtension, referencedAssets, storePptxAsset } from "@astlide/core/utils/pptx-assets";
import { describe, expect, it } from "vitest";

const bytes = (...parts: (string | number[])[]) =>
	Buffer.concat(
		parts.map((p) => (typeof p === "string" ? Buffer.from(p, "latin1") : Buffer.from(p))),
	);
const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "rest");
const TTF = bytes([0, 1, 0, 0, 0, 12, 0, 0, 0, 0, 0, 0]);
const OTF = bytes("OTTO", [0, 9, 0, 0, 0, 0, 0, 0]);

describe("assetExtension", () => {
	it("goes by the bytes", () => {
		expect(assetExtension(PNG)).toBe(".png");
		expect(assetExtension(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe(".jpg");
		expect(assetExtension(bytes("GIF89a", [1, 0, 1, 0]))).toBe(".gif");
		expect(assetExtension(bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 "))).toBe(".webp");
		expect(assetExtension(TTF)).toBe(".ttf");
		expect(assetExtension(OTF)).toBe(".otf");
		expect(assetExtension(bytes("true", [0, 9, 0, 0, 0, 0, 0, 0]))).toBe(".ttf");
	});

	it("refuses anything else, and fonts whose start could be a script", () => {
		expect(assetExtension(bytes("alert(document.domain)//"))).toBeUndefined();
		expect(assetExtension(bytes("true;alert(1)//xxxxx"))).toBeUndefined();
		expect(assetExtension(bytes("OTTO=alert(1)//xxxx"))).toBeUndefined();
		expect(assetExtension(bytes("<svg onload=alert(1)>"))).toBeUndefined();
		expect(assetExtension(bytes([]))).toBeUndefined();
	});
});

describe("storePptxAsset", () => {
	it("stores under the extension the bytes have, whatever the name says", () => {
		const dir = mkdtempSync(join(tmpdir(), "astlide-assets-"));
		const url = storePptxAsset(dir, "/", { name: "font.ttf", data: PNG });
		expect(url).toMatch(/^\/_astlide\/pptx\/[0-9a-f]{24}\.png$/);
	});

	it("stores nothing for bytes that aren't a picture or font", () => {
		const dir = mkdtempSync(join(tmpdir(), "astlide-assets-"));
		expect(
			storePptxAsset(dir, "/", { name: "x.ttf", data: bytes("true;alert(1)//xxxx") }),
		).toBeNull();
		expect(existsSync(dir) ? readdirSync(dir) : []).toEqual([]);
	});
});

describe("referencedAssets", () => {
	it("finds asset URLs in HTML and CSS", () => {
		const html = `<img src="/base/_astlide/pptx/0123456789abcdef01234567.png"><style>@font-face{src:url('/_astlide/pptx/fedcba9876543210fedcba98.ttf')}</style>`;
		expect(referencedAssets(html)).toEqual([
			"0123456789abcdef01234567.png",
			"fedcba9876543210fedcba98.ttf",
		]);
	});
});
