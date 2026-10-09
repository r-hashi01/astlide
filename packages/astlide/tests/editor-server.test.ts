import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	DECK_CHANGED_EVENT,
	interceptReloads,
	isSameOrigin,
	resolveSlideSource,
	SOURCE_SAVED_EVENT,
} from "../src/internal/editor-server";

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

describe("interceptReloads", () => {
	function channel() {
		const sent: unknown[] = [];
		return { sent, send: (payload: unknown) => sent.push(payload) };
	}

	it("turns each reload after an editor write into a source-saved event", () => {
		const ch = channel();
		const write = { event: SOURCE_SAVED_EVENT, path: "src/content/decks/t/01.mdx" };
		interceptReloads(ch, () => write);
		ch.send({ type: "full-reload", path: "*" });
		ch.send({ type: "full-reload" });
		const event = {
			type: "custom",
			event: SOURCE_SAVED_EVENT,
			data: { path: "src/content/decks/t/01.mdx" },
		};
		expect(ch.sent).toEqual([{ ...event, data: { ...event.data, committed: true } }, event]);
	});

	it("turns the reload after a slide file is removed into a deck-changed event", () => {
		const ch = channel();
		interceptReloads(ch, () => ({
			event: DECK_CHANGED_EVENT,
			path: "src/content/decks/t/02.mdx",
			removed: true,
		}));
		ch.send({ type: "full-reload" });
		ch.send({ type: "full-reload", path: "*" });
		const data = { path: "src/content/decks/t/02.mdx", removed: true };
		expect(ch.sent).toEqual([
			{ type: "custom", event: DECK_CHANGED_EVENT, data },
			// The content store's reload: the change is committed.
			{ type: "custom", event: DECK_CHANGED_EVENT, data: { ...data, committed: true } },
		]);
	});

	it("passes reloads through when no editor write is pending", () => {
		const ch = channel();
		interceptReloads(ch, () => null);
		ch.send({ type: "full-reload" });
		ch.send({ type: "update", updates: [] });
		expect(ch.sent).toEqual([{ type: "full-reload" }, { type: "update", updates: [] }]);
	});

	it("never swallows non-reload messages", () => {
		const ch = channel();
		interceptReloads(ch, () => ({ event: SOURCE_SAVED_EVENT, path: "x.mdx" }));
		ch.send({ type: "update", updates: [] });
		expect(ch.sent).toEqual([{ type: "update", updates: [] }]);
	});
});
