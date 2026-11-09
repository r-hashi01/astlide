/**
 * Plugin entrypoints given as project-relative paths, made absolute.
 *
 * @module
 */

import { fileURLToPath } from "node:url";
import type { ResolvedPlugins } from "@astlide/core/plugin";

/**
 * Theme, layout and decorator entrypoints may be given as project-relative
 * paths (e.g. "./src/components/Footer.astro"). Virtual modules can't
 * resolve those, so rewrite them to absolute paths against the project
 * root. Package specifiers and "/" paths (Vite resolves those from the
 * root, or as absolute files) pass through.
 */
export function resolveEntrypoints(resolved: ResolvedPlugins, root: URL): void {
	const resolveEntry = (spec: string) =>
		spec.startsWith("./") || spec.startsWith("../") ? fileURLToPath(new URL(spec, root)) : spec;
	for (const t of resolved.themes) {
		t.cssEntrypoint = resolveEntry(t.cssEntrypoint);
	}
	for (const d of resolved.decorators) {
		d.componentEntrypoint = resolveEntry(d.componentEntrypoint);
	}
	for (const l of resolved.layouts) {
		if (l.componentEntrypoint) l.componentEntrypoint = resolveEntry(l.componentEntrypoint);
	}
}
