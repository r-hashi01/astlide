/**
 * Favicon resolution for deck pages and the deck index.
 *
 * @module
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

/** Files looked up in `public/`, in order, when no `favicon` option is given. */
export const FAVICON_CANDIDATES = ["favicon.svg", "favicon.ico", "favicon.png"] as const;

/**
 * Resolve the `favicon` option at config time.
 *
 * @param option - The integration's `favicon` option.
 * @param publicDir - Absolute path of the project's `public/` directory.
 * @returns A root-relative path or URL to link; `null` for an empty icon
 *   (`data:,`), so browsers don't request `/favicon.ico` at the domain root;
 *   or `false` for no icon link at all.
 *
 * @example
 * resolveFavicon(undefined, "/site/public"); // → "/favicon.svg" if that file exists, else null
 * resolveFavicon("/logo.png", "/site/public"); // → "/logo.png"
 */
export function resolveFavicon(
	option: string | false | undefined,
	publicDir: string,
): string | false | null {
	if (option === false) return false;
	if (typeof option === "string" && option !== "") return option;
	const found = FAVICON_CANDIDATES.find((name) => existsSync(join(publicDir, name)));
	return found ? `/${found}` : null;
}
