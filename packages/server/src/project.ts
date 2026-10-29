/**
 * A throwaway folder per render: the deck's files in `deck/`, an uploaded
 * template, and `node_modules/.cache/astlide-fonts` linked to a font cache
 * shared by every render. `render-worker.ts` exports it; nothing is built.
 *
 * @module
 */

import { mkdir, mkdtemp, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** The deck's folder name inside the project. */
export const DECK = "deck";

/** The theme name an uploaded template gets. */
export const TEMPLATE_THEME = "template";

export interface ProjectSpec {
	/** Deck files by name (`01-slide.md`, `_config.json`, …). */
	files: Record<string, string>;
	/** An uploaded PowerPoint template, used as the theme {@link TEMPLATE_THEME}. */
	template?: { ext: string; data: Uint8Array };
}

/** Create a project in `workDir`; returns its root. */
export async function createProject(
	spec: ProjectSpec,
	options: { workDir: string },
): Promise<string> {
	const root = await mkdtemp(join(options.workDir, "render-"));
	live.add(root);
	try {
		const deckDir = join(root, DECK);
		await mkdir(deckDir, { recursive: true });
		// Downloaded web fonts: one cache for every render.
		const fonts = join(options.workDir, ".font-cache");
		await mkdir(fonts, { recursive: true });
		await mkdir(join(root, "node_modules", ".cache"), { recursive: true });
		await symlink(
			fonts,
			join(root, "node_modules", ".cache", "astlide-fonts"),
			process.platform === "win32" ? "junction" : "dir",
		);
		await Promise.all([
			spec.template
				? writeFile(join(root, `template${spec.template.ext}`), spec.template.data)
				: undefined,
			...Object.entries(spec.files).map(([name, content]) =>
				writeFile(join(deckDir, name), content),
			),
		]);
		return root;
	} catch (e) {
		await removeProject(root);
		throw e;
	}
}

/** Delete a project (links only — the linked packages are untouched). */
export async function removeProject(root: string): Promise<void> {
	await rm(root, { recursive: true, force: true });
	live.delete(root);
}

/** Projects this process created and hasn't deleted yet. */
const live = new Set<string>();

/** Delete this process's projects (on shutdown, with renders still running). */
export async function removeLiveProjects(): Promise<void> {
	await Promise.all([...live].map(removeProject));
}

/**
 * Delete projects left behind by an earlier run (e.g. after a crash): those
 * not touched for `olderThanMs` — another server sharing the work directory
 * may be using the newer ones.
 */
export async function removeStaleProjects(workDir: string, olderThanMs: number): Promise<void> {
	const entries = await readdir(workDir).catch(() => [] as string[]);
	const cutoff = Date.now() - olderThanMs;
	await Promise.all(
		entries
			.filter((n) => n.startsWith("render-"))
			.map(async (n) => {
				const dir = join(workDir, n);
				const modified = await stat(dir).then(
					(s) => s.mtimeMs,
					() => Number.POSITIVE_INFINITY,
				);
				if (modified < cutoff) await removeProject(dir);
			}),
	);
}
