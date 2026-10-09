import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isSameOrigin, resolveSlideSource } from "../src/internal/editor-server";

const root = resolve("/project");

describe("resolveSlideSource", () => {
	it("accepts slide sources under src/", () => {
		expect(resolveSlideSource(root, "src/content/decks/talk/01-cover.mdx")).toBe(
			join(root, "src/content/decks/talk/01-cover.mdx"),
		);
		expect(resolveSlideSource(root, "src/content/decks/talk/02.md")).not.toBeNull();
		expect(resolveSlideSource(root, "src/content/decks/talk/03.html")).not.toBeNull();
	});

	it("rejects other extensions", () => {
		expect(resolveSlideSource(root, "src/content.config.ts")).toBeNull();
		expect(resolveSlideSource(root, "src/content/decks/talk/_config.json")).toBeNull();
	});

	it("rejects paths outside src/", () => {
		expect(resolveSlideSource(root, "README.md")).toBeNull();
		expect(resolveSlideSource(root, "src/../README.md")).toBeNull();
		expect(resolveSlideSource(root, "src/content/../../docs/x.md")).toBeNull();
		expect(resolveSlideSource(root, "/etc/passwd.md")).toBeNull();
	});

	it("rejects non-strings and NUL bytes", () => {
		expect(resolveSlideSource(root, undefined)).toBeNull();
		expect(resolveSlideSource(root, 42)).toBeNull();
		expect(resolveSlideSource(root, "src/a\0.md")).toBeNull();
	});
});

describe("isSameOrigin", () => {
	it("allows the dev server's own origin", () => {
		expect(
			isSameOrigin({ headers: { origin: "http://localhost:4321", host: "localhost:4321" } }),
		).toBe(true);
	});

	it("refuses other origins or a missing Origin header", () => {
		expect(
			isSameOrigin({ headers: { origin: "https://evil.example", host: "localhost:4321" } }),
		).toBe(false);
		expect(isSameOrigin({ headers: { host: "localhost:4321" } })).toBe(false);
		expect(isSameOrigin({ headers: { origin: "not a url", host: "localhost:4321" } })).toBe(false);
	});
});
