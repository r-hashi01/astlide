import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveEmbeds } from "../src/cli/pptx/embeds";

const cache = () => mkdtempSync(join(tmpdir(), "astlide-embeds-"));

function serve(pages: Record<string, string>) {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string) => {
			const body = pages[url];
			return body === undefined ? new Response("", { status: 404 }) : new Response(body);
		}),
	);
}

afterEach(() => vi.unstubAllGlobals());

describe("resolveEmbeds", () => {
	it("maps a known player to its page and oEmbed data", async () => {
		const page = "https://vimeo.com/1084537";
		serve({
			[`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(page)}`]: JSON.stringify({
				title: "Big Buck Bunny",
				thumbnail_url: "https://i.vimeocdn.com/x.jpg",
			}),
		});
		const info = await resolveEmbeds(["https://player.vimeo.com/video/1084537"], cache());
		expect(info.get("https://player.vimeo.com/video/1084537")).toEqual({
			link: page,
			title: "Big Buck Bunny",
			thumbnail: "https://i.vimeocdn.com/x.jpg",
		});
	});

	it("reads Open Graph tags of any page (relative image resolved)", async () => {
		serve({
			"https://example.com/demo": `<html><head><meta property="og:title" content="A &amp; B"><meta content="/card.png" property="og:image"></head></html>`,
		});
		const info = await resolveEmbeds(["https://example.com/demo"], cache());
		expect(info.get("https://example.com/demo")).toEqual({
			link: "https://example.com/demo",
			title: "A & B",
			thumbnail: "https://example.com/card.png",
		});
	});

	it("knows only the link when offline", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Promise.reject(new Error("offline"))),
		);
		const info = await resolveEmbeds(["https://example.com/x"], cache());
		expect(info.get("https://example.com/x")).toEqual({ link: "https://example.com/x" });
	});
});
