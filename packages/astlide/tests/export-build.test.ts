import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportBuildDir, exportSiteDir } from "@astlide/core/utils/export-build";
import { describe, expect, it } from "vitest";

describe("export build folder", () => {
	it("is under node_modules, never dist/", () => {
		expect(exportBuildDir("/p")).toBe(join("/p", "node_modules", ".astro", "astlide-export"));
	});

	it("reads the export's own build when there is one, else dist/", () => {
		const root = mkdtempSync(join(tmpdir(), "astlide-export-"));
		expect(exportSiteDir(root)).toEqual({ dir: join(root, "dist"), own: false });
		mkdirSync(exportBuildDir(root), { recursive: true });
		expect(exportSiteDir(root)).toEqual({ dir: exportBuildDir(root), own: true });
	});
});
