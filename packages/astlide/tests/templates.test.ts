import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTemplateStore, type TemplateStore, templateNameError } from "../src/templates";

let dir: string;
let store: TemplateStore;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "astlide-templates-"));
	store = createTemplateStore(dir);
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const bytes = (s: string) => new TextEncoder().encode(s);
const text = (b: Uint8Array | undefined) => (b ? new TextDecoder().decode(b) : undefined);

describe("template names", () => {
	it("accepts slugs and refuses the rest and built-in themes", () => {
		for (const ok of ["acme", "acme-2026", "a", "x1"])
			expect(templateNameError(ok)).toBeUndefined();
		for (const bad of ["", "Acme", "-a", "a-", "a_b", "../x", "a/b", "a".repeat(65)])
			expect(templateNameError(bad)).toMatch(/lowercase/);
		expect(templateNameError("dark")).toMatch(/built-in theme/);
	});
});

describe("createTemplateStore", () => {
	it("is empty when the folder doesn't exist yet", async () => {
		expect(await createTemplateStore(join(dir, "missing")).list()).toEqual([]);
	});

	it("keeps every upload as a version and returns the latest by default", async () => {
		const first = await store.put("acme", bytes("one"), { ext: ".potx", label: "Acme" });
		expect(first).toMatchObject({ name: "acme", label: "Acme", latest: 1 });
		expect(first.versions[0]).toMatchObject({ version: 1, ext: ".potx", size: 3 });
		expect(first.versions[0]?.sha256).toMatch(/^[0-9a-f]{64}$/);
		expect(first).not.toHaveProperty("counter");

		const second = await store.put("acme", bytes("two"), {
			ext: ".pptx",
			meta: { layouts: ["title"] },
		});
		expect(second.label).toBe("Acme"); // kept when not given
		expect(second.latest).toBe(2);

		const latest = await store.get("acme");
		expect(text(latest?.data)).toBe("two");
		expect(latest?.version).toMatchObject({
			version: 2,
			ext: ".pptx",
			meta: { layouts: ["title"] },
		});
		expect(text((await store.get("acme", 1))?.data)).toBe("one");
		expect(await store.get("acme", 3)).toBeUndefined();
		expect(await store.get("nope")).toBeUndefined();
	});

	it("lists templates by name", async () => {
		await store.put("zeta", bytes("z"), { ext: ".pptx" });
		await store.put("alpha", bytes("a"), { ext: ".pptx" });
		expect((await store.list()).map((t) => t.name)).toEqual(["alpha", "zeta"]);
	});

	it("never reuses a deleted version's number", async () => {
		await store.put("acme", bytes("one"), { ext: ".pptx" });
		await store.put("acme", bytes("two"), { ext: ".pptx" });
		expect(await store.remove("acme", 2)).toBe(true);
		expect((await store.info("acme"))?.latest).toBe(1);
		const info = await store.put("acme", bytes("three"), { ext: ".pptx" });
		expect(info.versions.map((v) => v.version)).toEqual([1, 3]);
		expect(text((await store.get("acme"))?.data)).toBe("three");
	});

	it("removes a version's file, and the template with its last version", async () => {
		await store.put("acme", bytes("one"), { ext: ".pptx" });
		await store.put("acme", bytes("two"), { ext: ".potx" });
		await store.remove("acme", 1);
		expect((await readdir(join(dir, "acme"))).sort()).toEqual(["manifest.json", "v2.potx"]);
		expect(await store.remove("acme", 1)).toBe(false);
		expect(await store.remove("acme", 2)).toBe(true);
		expect(await store.info("acme")).toBeUndefined();
		expect(await readdir(dir)).toEqual([]);

		await store.put("acme", bytes("x"), { ext: ".pptx" });
		expect(await store.remove("acme")).toBe(true);
		expect(await store.remove("acme")).toBe(false);
	});

	it("numbers concurrent uploads without losing any", async () => {
		await Promise.all(
			Array.from({ length: 5 }, (_, i) => store.put("acme", bytes(String(i)), { ext: ".pptx" })),
		);
		const info = await store.info("acme");
		expect(info?.versions.map((v) => v.version)).toEqual([1, 2, 3, 4, 5]);
	});

	it("refuses bad names and extensions, and never reads outside its folder", async () => {
		await expect(store.put("../x", bytes("x"), { ext: ".pptx" })).rejects.toThrow(/lowercase/);
		await expect(store.put("dark", bytes("x"), { ext: ".pptx" })).rejects.toThrow(/built-in/);
		await expect(store.put("acme", bytes("x"), { ext: ".key" as ".pptx" })).rejects.toThrow(
			/\.pptx/,
		);
		expect(await store.get("../etc")).toBeUndefined();
		expect(await store.remove("../etc")).toBe(false);
	});
});
