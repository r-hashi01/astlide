/**
 * `withAstlide(nextConfig)`: what a Next.js app needs to run Astlide —
 * Astlide's packages compiled by Next (they ship TypeScript), the MDX
 * engine's native module kept out of the server bundle, and a stub for
 * `pdfjs-dist` (an optional peer of the PDF download's `@astlide/crispdf`,
 * for a feature Astlide doesn't use).
 *
 * ```js
 * // next.config.mjs
 * import { withAstlide } from "@astlide/next/config";
 * export default withAstlide({});
 * ```
 *
 * JavaScript, not TypeScript: Node loads `next.config` itself, and it won't
 * strip types from files in node_modules.
 *
 * @module
 */

import { createRequire } from "node:module";
import { relative, sep } from "node:path";

/**
 * The parts of Next's config this touches (Next's own type, without importing it).
 * @typedef {{
 *   transpilePackages?: string[];
 *   serverExternalPackages?: string[];
 *   turbopack?: { resolveAlias?: Record<string, unknown>; [key: string]: unknown };
 *   webpack?: (config: any, context: any) => any;
 *   [key: string]: unknown;
 * }} NextConfigLike
 */

const TRANSPILE = ["@astlide/core", "@astlide/react", "@astlide/next"];
/** Native or Node-only packages the server should load as they are. */
const EXTERNAL = ["satteri", "@astrojs/markdown-satteri", "shiki", "jsdom", "playwright"];

const PDFJS_STUB = createRequire(import.meta.url).resolve("@astlide/core/runtime/pdfjs-stub");
/** What `@astlide/crispdf` imports from `pdfjs-dist`. */
const PDFJS = ["pdfjs-dist", "pdfjs-dist/build/pdf.worker.min.mjs"];

/** @param {string} file */
const fromProject = (file) => `./${relative(process.cwd(), file).split(sep).join("/")}`;

/** @param {string[] | undefined} a @param {string[]} b */
const merge = (a, b) => [...new Set([...(a ?? []), ...b])];

/**
 * @template {NextConfigLike} T
 * @param {T} [config]
 * @returns {T}
 */
export function withAstlide(config = /** @type {T} */ ({})) {
	return {
		...config,
		transpilePackages: merge(config.transpilePackages, TRANSPILE),
		serverExternalPackages: merge(config.serverExternalPackages, EXTERNAL),
		turbopack: {
			...config.turbopack,
			resolveAlias: {
				// Turbopack takes a path relative to the project, not an absolute one.
				...Object.fromEntries(PDFJS.map((name) => [name, fromProject(PDFJS_STUB)])),
				...config.turbopack?.resolveAlias,
			},
		},
		webpack: (webpackConfig, context) => {
			const result = config.webpack ? config.webpack(webpackConfig, context) : webpackConfig;
			result.resolve ??= {};
			result.resolve.alias = {
				...Object.fromEntries(PDFJS.map((name) => [`${name}$`, PDFJS_STUB])),
				...result.resolve.alias,
			};
			return result;
		},
	};
}
