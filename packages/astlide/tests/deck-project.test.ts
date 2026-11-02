import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { decksDir, listDecks, readDeckConfigFile } from "../src/deck/project";

const root = mkdtempSync(join(tmpdir(), "astlide-project-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
mkdirSync(join(decksDir(root), "talk"), { recursive: true });
mkdirSync(join(decksDir(root), "empty"), { recursive: true });
writeFileSync(join(decksDir(root), "talk", "_config.json"), '{"title":"Talk","theme":"dark"}');
writeFileSync(join(decksDir(root), "notes.txt"), "not a deck");
mkdirSync(join(decksDir(root), "broken"), { recursive: true });
writeFileSync(join(decksDir(root), "broken", "_config.json"), "{ not json");

describe("project decks", () => {
	it("lists the deck folders", async () => {
		expect((await listDecks(root)).sort()).toEqual(["broken", "empty", "talk"]);
	});

	it("reads a deck's _config.json, or {} when missing or invalid", async () => {
		expect(await readDeckConfigFile(root, "talk")).toEqual({ title: "Talk", theme: "dark" });
		expect(await readDeckConfigFile(root, "empty")).toEqual({});
		expect(await readDeckConfigFile(root, "broken")).toEqual({});
	});
});
