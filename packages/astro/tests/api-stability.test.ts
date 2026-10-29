/**
 * API stability snapshot of `@astlide/astro`: the integration and what
 * Astro projects import next to it (on intentional change: `bun run test -u`).
 */

import { describe, expect, it } from "vitest";
import * as astro from "../src/index";

describe("@astlide/astro export surface", () => {
	it("named exports are stable", () => {
		expect(Object.keys(astro).sort()).toMatchInlineSnapshot(`
			[
			  "THEMES",
			  "astlideDeckLoader",
			  "deckConfigSchema",
			  "default",
			  "defineAstlidePlugin",
			  "getClientDeckContext",
			  "getDeckContext",
			  "slideSchema",
			]
		`);
	});

	it("default export (the integration factory) is callable", () => {
		expect(typeof astro.default).toBe("function");
		const integration = astro.default();
		expect(integration.name).toBe("astlide");
		expect(typeof integration.hooks).toBe("object");
	});
});
