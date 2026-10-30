/**
 * `withAstlide(nextConfig)`: what a Next.js app needs to run Astlide —
 * Astlide's packages compiled by Next (they ship TypeScript), and the MDX
 * engine's native module kept out of the server bundle.
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

/**
 * The parts of Next's config this touches (Next's own type, without importing it).
 * @typedef {{ transpilePackages?: string[]; serverExternalPackages?: string[]; [key: string]: unknown }} NextConfigLike
 */

const TRANSPILE = ["@astlide/core", "@astlide/react", "@astlide/next"];
/** Native or Node-only packages the server should load as they are. */
const EXTERNAL = ["satteri", "@astrojs/markdown-satteri", "shiki", "jsdom", "playwright"];

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
	};
}
