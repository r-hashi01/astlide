/**
 * A throwaway Astro project per render: the deck's files, a minimal
 * `astro.config.mjs` / `src/content.config.ts`, and a `node_modules` whose
 * entries link to the server's own install (nothing is installed per request).
 *
 * @module
 */

import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises";
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

const CONTENT_CONFIG = `import { defineCollection } from "astro:content";
import { astlideDeckLoader, slideSchema } from "@astlide/core";

export const collections = {
	decks: defineCollection({ loader: astlideDeckLoader(), schema: slideSchema }),
};
`;

function astroConfig(templateFile?: string): string {
	const options = templateFile
		? `{ templates: { ${JSON.stringify(TEMPLATE_THEME)}: ${JSON.stringify(`./${templateFile}`)} } }`
		: "";
	return `import astlide from "@astlide/core";
import { defineConfig } from "astro/config";

export default defineConfig({ integrations: [astlide(${options})] });
`;
}

/**
 * `node_modules` for a project: a real directory (so per-project caches Astro
 * and Astlide write there stay in the project) with a link to each package of
 * the server's install. Downloaded web fonts share one cache across renders.
 */
async function linkNodeModules(root: string, nodeModules: string, workDir: string): Promise<void> {
	const dir = join(root, "node_modules");
	await mkdir(join(dir, ".cache"), { recursive: true });
	const type = process.platform === "win32" ? "junction" : "dir";
	const entries = await readdir(nodeModules);
	await Promise.all(
		entries
			.filter((name) => !name.startsWith("."))
			.map((name) => symlink(join(nodeModules, name), join(dir, name), type)),
	);
	const fonts = join(workDir, ".font-cache");
	await mkdir(fonts, { recursive: true });
	await symlink(fonts, join(dir, ".cache", "astlide-fonts"), type);
}

/** Create a project in `workDir`; returns its root. */
export async function createProject(
	spec: ProjectSpec,
	options: { workDir: string; nodeModules: string },
): Promise<string> {
	const root = await mkdtemp(join(options.workDir, "render-"));
	try {
		const deckDir = join(root, "src", "content", "decks", DECK);
		await mkdir(deckDir, { recursive: true });
		let templateFile: string | undefined;
		if (spec.template) {
			templateFile = `template${spec.template.ext}`;
			await writeFile(join(root, templateFile), spec.template.data);
		}
		await Promise.all([
			linkNodeModules(root, options.nodeModules, options.workDir),
			writeFile(
				join(root, "package.json"),
				`${JSON.stringify({ name: "astlide-render", private: true, type: "module" })}\n`,
			),
			writeFile(join(root, "astro.config.mjs"), astroConfig(templateFile)),
			writeFile(join(root, "src", "content.config.ts"), CONTENT_CONFIG),
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
}

/** Delete projects left behind by a previous run (e.g. after a crash). */
export async function removeStaleProjects(workDir: string): Promise<void> {
	const entries = await readdir(workDir).catch(() => [] as string[]);
	await Promise.all(
		entries.filter((n) => n.startsWith("render-")).map((n) => removeProject(join(workDir, n))),
	);
}
