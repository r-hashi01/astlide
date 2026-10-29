import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runTemplateCommand, TemplateUsageError } from "../src/cli/template";
import { templateFixture } from "./fixtures/pptx-template";

let dir: string;
let lines: string[];
const run = (...argv: string[]) =>
	runTemplateCommand(argv, {
		log: (l) => lines.push(l),
		env: { ASTLIDE_TEMPLATE_STORE: "store" },
		cwd: dir,
	});

beforeEach(async () => {
	dir = mkdtempSync(join(tmpdir(), "astlide-cli-template-"));
	lines = [];
	writeFileSync(join(dir, "Acme 2026.potx"), await templateFixture());
	writeFileSync(join(dir, "notes.pptx"), "not a zip");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("astlide template", () => {
	it("adds, lists, shows, downloads and removes templates", async () => {
		await run("add", "Acme 2026.potx", "--label", "Acme");
		await run("add", "Acme 2026.potx", "--name", "acme-2026");
		expect(lines).toEqual(["✓ Stored acme-2026 v1", "✓ Stored acme-2026 v2"]);

		lines = [];
		await run("list");
		expect(lines[0]).toMatch(/^acme-2026 \(Acme\) — latest v2; versions: v1, v2;/);

		lines = [];
		await run("show", "acme-2026", "--version", "1");
		expect(lines.join("\n")).toContain("Layouts in v1 (use as slideLayout):");
		expect(lines.join("\n")).toMatch(/title-slide — Title Slide \(for cover/);

		lines = [];
		await run("show", "acme-2026", "--json");
		expect(JSON.parse(lines.join("\n"))).toMatchObject({ name: "acme-2026", version: 2 });

		await run("download", "acme-2026", "--version", "1", "-o", "out.potx");
		expect(readFileSync(join(dir, "out.potx"))).toEqual(readFileSync(join(dir, "Acme 2026.potx")));

		await run("remove", "acme-2026", "--version", "1");
		await run("remove", "acme-2026");
		lines = [];
		await run("list");
		expect(lines).toEqual(["No templates."]);
	});

	it("takes --store over ASTLIDE_TEMPLATE_STORE", async () => {
		await run("add", "Acme 2026.potx", "--store", "other");
		lines = [];
		await run("list", "--store", "other");
		expect(lines[0]).toMatch(/^acme-2026/);
	});

	it("refuses files that aren't templates, and usage mistakes", async () => {
		await expect(run("add", "notes.pptx")).rejects.toThrow(/not a readable PowerPoint template/);
		await expect(run("add", "Acme 2026.potx", "--name", "Bad Name")).rejects.toThrow(/lowercase/);
		await expect(run("add", "readme.md")).rejects.toThrow(TemplateUsageError);
		await expect(run("show", "nope")).rejects.toThrow('no template "nope"');
		await expect(run("remove", "nope")).rejects.toThrow('no template "nope"');
		await expect(run("frobnicate")).rejects.toThrow(/unknown subcommand/);
		await expect(run("show", "x", "--version", "0")).rejects.toThrow(/version number/);
		await expect(
			runTemplateCommand(["list"], { log: () => {}, env: {}, cwd: dir }),
		).rejects.toThrow(/ASTLIDE_TEMPLATE_STORE/);
	});
});
