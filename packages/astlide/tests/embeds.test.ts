import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pageTags, resolveEmbeds } from "../src/cli/pptx/embeds";

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

	it("links only to http(s) pages, and survives broken tags", async () => {
		serve({
			"https://example.com/a": `<head><meta property="og:url" content="javascript:alert(1)"><meta property="og:image" content="http://["></head>`,
			"https://example.com/b": `<head><meta property="og:url" content="file://host/share/x"><title>B</title></head>`,
		});
		const figma = "https://www.figma.com/embed?url=%E0%A4%A";
		const info = await resolveEmbeds(
			["https://example.com/a", "https://example.com/b", figma],
			cache(),
		);
		expect(info.get("https://example.com/a")).toEqual({ link: "https://example.com/a" });
		expect(info.get("https://example.com/b")).toEqual({
			link: "https://example.com/b",
			title: "B",
		});
		expect(info.get(figma)).toEqual({ link: figma });
	});

	it("only follows an advertised oEmbed endpoint to a public address", async () => {
		const fetch = vi.fn(async (url: string) =>
			url === "https://example.com/c"
				? new Response(
						`<head><link rel="alternate" type="application/json+oembed" href="http://127.0.0.1:9/oembed"><title>C</title></head>`,
					)
				: new Response(JSON.stringify({ title: "secret" })),
		);
		vi.stubGlobal("fetch", fetch);
		const info = await resolveEmbeds(["https://example.com/c"], cache());
		expect(info.get("https://example.com/c")).toEqual({
			link: "https://example.com/c",
			title: "C",
		});
		expect(fetch.mock.calls.map(([url]) => url)).toEqual(["https://example.com/c"]);
	});

	it("reads page tags in linear time", () => {
		const started = performance.now();
		pageTags("<meta".repeat(400_000));
		pageTags(`<link type="application/json+oembed" ${"a".repeat(2_000_000)}`);
		expect(performance.now() - started).toBeLessThan(1000);
		expect(pageTags(`<title> A &amp; B </title><meta name="og:title" content="x">`)).toEqual({
			meta: new Map([["og:title", "x"]]),
			oembed: undefined,
			title: "A & B",
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
