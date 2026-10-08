/**
 * Node `--import` hook: resolve the bare `typescript` specifier to the
 * TypeScript 6 kept in the `tools/ts6` workspace.
 *
 * The repo uses TypeScript 7 (native `tsc`), which no longer ships the JS
 * compiler API. Tools that still `require("typescript")` for that API — the
 * Astro language server behind type checking, TypeDoc — run with this hook:
 *
 *   node --import ./scripts/use-typescript6.mjs <tool>
 *
 * Drop it once those tools support TypeScript 7 (for Astro: TS 7.1+ with
 * `@astrojs/ts-content-mapper`).
 */

import { createRequire, registerHooks } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

// Resolve TS 6 from the tools/ts6 workspace once, before the hook is active
// (resolving inside the hook would re-enter it).
const ts6Main = createRequire(new URL("../tools/ts6/package.json", import.meta.url)).resolve(
	"typescript",
);
const ts6Dir = dirname(dirname(ts6Main)); // …/typescript/lib/typescript.js → …/typescript

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === "typescript") {
			return { url: pathToFileURL(ts6Main).href, format: "commonjs", shortCircuit: true };
		}
		if (specifier.startsWith("typescript/")) {
			const file = join(ts6Dir, specifier.slice("typescript/".length));
			return { url: pathToFileURL(file).href, shortCircuit: true };
		}
		return nextResolve(specifier, context);
	},
});
