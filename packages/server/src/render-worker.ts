/**
 * Child process for `POST /render`: exports one deck folder with
 * `renderDeck` from `@astlide/core/render` — no Astro build. Runs in its own
 * process (and process group) so the server can stop it on timeout and keep
 * its own memory and environment out of reach (see `render.ts`).
 *
 * Usage: `bun render-worker.ts <project> <pptx|pdf|png>`, where the project
 * holds `deck/` (the slides and `_config.json`), optionally `template.<ext>`,
 * and receives `out/deck.<pptx|pdf>` or `out/deck-slides/*.png`.
 *
 * @module
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { renderDeck } from "@astlide/core/render";

const [root, format] = process.argv.slice(2) as [string, "pptx" | "pdf" | "png"];
const template = (await readdir(root)).find((n) => /^template\.(pptx|potx|thmx)$/.test(n));
await renderDeck({
	dir: join(root, "deck"),
	format,
	output: join(root, "out", format === "png" ? "deck-slides" : `deck.${format}`),
	...(template ? { template: await readFile(join(root, template)) } : {}),
	// Download caches (fonts) live under the project's node_modules/.cache (shared, see project.ts).
	root,
	// The print view goes in the project too, so a stopped render leaves nothing behind it.
	tempDir: root,
});
