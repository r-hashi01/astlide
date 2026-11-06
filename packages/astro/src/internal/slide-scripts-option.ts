/**
 * The integration's `slideScripts` option, for the deck loader: the
 * integration defines it in its Vite config, and the loader reads it from its
 * context's Astro config. Per config, so several Astro configs in one process
 * (tests, tooling) each keep their own.
 *
 * @module
 */

/** The Vite `define` key the integration sets. */
export const SLIDE_SCRIPTS_DEFINE = "__ASTLIDE_SLIDE_SCRIPTS__";

/** Whether the Astlide integration of `config` keeps slide scripts (`slideScripts: true`). */
export function slideScriptsKept(config: { vite?: { define?: Record<string, unknown> } }): boolean {
	return config.vite?.define?.[SLIDE_SCRIPTS_DEFINE] === "true";
}
