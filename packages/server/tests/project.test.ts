import { existsSync, mkdirSync, mkdtempSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { removeStaleProjects } from "../src/project";

describe("removeStaleProjects", () => {
	it("removes only old projects: newer ones may belong to another server", async () => {
		const work = mkdtempSync(join(tmpdir(), "astlide-work-"));
		const old = join(work, "render-old");
		const fresh = join(work, "render-fresh");
		const other = join(work, ".font-cache");
		for (const dir of [old, fresh, other]) mkdirSync(dir);
		const hourAgo = new Date(Date.now() - 3600_000);
		utimesSync(old, hourAgo, hourAgo);
		utimesSync(other, hourAgo, hourAgo);
		await removeStaleProjects(work, 600_000);
		expect([existsSync(old), existsSync(fresh), existsSync(other)]).toEqual([false, true, true]);
	});
});
