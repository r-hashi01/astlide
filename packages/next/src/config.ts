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
 * @module
 */

/** The parts of Next's config this touches (Next's own type, without importing it). */
interface NextConfigLike {
	transpilePackages?: string[];
	serverExternalPackages?: string[];
	[key: string]: unknown;
}

const TRANSPILE = ["@astlide/core", "@astlide/react", "@astlide/next"];
/** Native or Node-only packages the server should load as they are. */
const EXTERNAL = ["satteri", "@astrojs/markdown-satteri", "shiki", "jsdom", "playwright"];

const merge = (a: string[] | undefined, b: string[]) => [...new Set([...(a ?? []), ...b])];

export function withAstlide<T extends NextConfigLike>(config: T = {} as T): T {
	return {
		...config,
		transpilePackages: merge(config.transpilePackages, TRANSPILE),
		serverExternalPackages: merge(config.serverExternalPackages, EXTERNAL),
	};
}
