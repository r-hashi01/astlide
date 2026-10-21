import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	exportBuildDir,
	exportSiteDir,
	requestedExportBuild,
} from "@astlide/core/utils/export-build";
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

describe("ASTLIDE_EXPORT_BUILD", () => {
	it("only counts when it names the project's own export folder", () => {
		const root = "/p";
		expect(requestedExportBuild(root, {})).toEqual({});
		expect(requestedExportBuild(root, { ASTLIDE_EXPORT_BUILD: exportBuildDir(root) })).toEqual({
			dir: exportBuildDir(root),
		});
		for (const value of ["/p/dist", "dist", "1", "/elsewhere/node_modules/.astro/astlide-export"])
			expect(requestedExportBuild(root, { ASTLIDE_EXPORT_BUILD: value })).toEqual({
				ignored: value,
			});
	});
});
