import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createTemplateStore, type TemplateStore } from "@astlide/core/templates";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { templateFixture } from "../../astlide/tests/fixtures/pptx-template";
import astlide from "../src/index";

type Plugin = { name: string; load?: (id: string) => unknown };

let root: string;
beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "astlide-store-project-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

/** Run `astro:config:setup` in a project at `root`; returns the Vite plugins it added. */
async function setup(options: Parameters<typeof astlide>[0], command = "build") {
	const updateConfig = vi.fn();
	const hook = astlide(options).hooks["astro:config:setup"] as (
		args: Record<string, unknown>,
	) => Promise<void>;
	await hook({
		command,
		config: {
			root: pathToFileURL(`${root}/`),
			publicDir: pathToFileURL(`${root}/public/`),
			integrations: [],
			trailingSlash: "ignore",
			build: { format: "directory" },
			base: "/",
		},
		injectRoute: vi.fn(),
		injectScript: vi.fn(),
		updateConfig,
		logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
	});
	return updateConfig.mock.calls[0]?.[0]?.vite.plugins as Plugin[];
}

const load = (plugins: Plugin[], name: string, id: string) =>
	String(plugins.find((p) => p.name === name)?.load?.(`\0${id}`));

describe("templates from a template store", () => {
	it("makes every stored template a theme, from a folder location", async () => {
		const store = createTemplateStore(join(root, "templates"));
		await store.put("acme", await templateFixture(), { ext: ".potx" });
		await store.put("brand", await templateFixture(), { ext: ".pptx" });

		const plugins = await setup({ templates: "./templates" });
		const themes = load(plugins, "astlide:virtual", "virtual:astlide/themes");
		expect(themes).toContain("acme.css");
		expect(themes).toContain("brand.css");
		const templates = load(plugins, "astlide:templates", "virtual:astlide/templates");
		expect(Object.keys(JSON.parse(templates.match(/templates = (\{.*\});/)?.[1] ?? "{}"))).toEqual([
			"acme",
			"brand",
		]);
	});

	it("uses each template's latest version", async () => {
		const store = createTemplateStore(join(root, "templates"));
		await store.put("acme", await templateFixture(), { ext: ".potx" });
		await store.put("acme", await templateFixture(), { ext: ".pptx" });
		await setup({ templates: store });
		const { readdirSync } = await import("node:fs");
		expect(readdirSync(join(root, "node_modules/.astro/astlide-templates/store"))).toEqual([
			"acme.pptx",
		]);
	});

	it("takes the store itself, and says which store failed", async () => {
		const broken: TemplateStore = {
			list: async () => {
				throw new Error("AccessDenied");
			},
			info: async () => undefined,
			get: async () => undefined,
			put: async () => {
				throw new Error("read-only");
			},
			remove: async () => false,
		};
		await expect(setup({ templates: broken })).rejects.toThrow(
			"[astlide] template store: AccessDenied",
		);
		await expect(setup({ templates: "ftp://x" })).rejects.toThrow(/unknown template store/);
	});

	it("is an empty set of themes when the folder doesn't exist yet", async () => {
		const plugins = await setup({ templates: "./templates" });
		expect(load(plugins, "astlide:templates", "virtual:astlide/templates")).toContain(
			"templates = {}",
		);
	});
});
