import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { deckConfigs, deckFolders } from "../src/internal/deck-configs";

// The pages resolve slide paths against the project root (here the working directory).
const root = process.cwd();
const dir = mkdtempSync(join(tmpdir(), "astlide-deck-configs-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const rel = (...parts: string[]) => relative(root, join(dir, ...parts));

describe("deck configs", () => {
	it("finds each deck's folder from its slides, wherever the loader's base is", () => {
		const folders = deckFolders([
			{ id: "tour/01-intro", filePath: rel("app", "content", "decks", "tour", "01-intro.mdx") },
			{ id: "tour/sub/02", filePath: rel("app", "content", "decks", "tour", "sub", "02.md") },
			{ id: "talk/03--007", filePath: rel("slides", "talk", "03.pptx") },
			{ id: "nofile/01" },
		]);
		expect(folders.get("tour")).toBe(join(dir, "app", "content", "decks", "tour"));
		expect(folders.get("talk")).toBe(join(dir, "slides", "talk"));
		expect(folders.has("nofile")).toBe(false);
	});

	it("reads each deck's _config.json from there, with defaults and issues", async () => {
		mkdirSync(join(dir, "decks", "a"), { recursive: true });
		mkdirSync(join(dir, "decks", "b"), { recursive: true });
		writeFileSync(
			join(dir, "decks", "a", "_config.json"),
			JSON.stringify({ title: "A", date: "2026-11-09" }),
		);
		writeFileSync(join(dir, "decks", "b", "_config.json"), "{ nope");
		const configs = await deckConfigs([
			{ id: "a/01", filePath: rel("decks", "a", "01.md") },
			{ id: "b/01", filePath: rel("decks", "b", "01.md") },
		]);
		expect(configs.get("a")?.config).toMatchObject({
			title: "A",
			date: "2026-11-09",
			theme: "default",
		});
		expect(configs.get("b")?.config.theme).toBe("default");
		expect(configs.get("b")?.configIssue).toMatch(/^Malformed _config.json/);
	});
});
