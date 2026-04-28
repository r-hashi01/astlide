/**
 * API stability snapshots.
 *
 * Locks in the public surface so that accidental breaking changes (removed
 * fields, renamed exports, default-value drift, frontmatter shape changes)
 * fail CI and prompt an explicit decision: bump the major or restore.
 *
 * On intentional change, regenerate with `bun run test -u`.
 */

import { describe, expect, it } from "vitest";
import * as core from "../src/index";
import * as plugin from "../src/plugin";
import { deckConfigSchema, slideSchema } from "../src/schema";

describe("@astlide/core export surface", () => {
	it("named exports are stable", () => {
		expect(Object.keys(core).sort()).toMatchInlineSnapshot(`
			[
			  "THEMES",
			  "deckConfigSchema",
			  "default",
			  "defineAstlidePlugin",
			  "slideSchema",
			]
		`);
	});

	it("default export (the integration factory) is callable", () => {
		expect(typeof core.default).toBe("function");
		// astlide() should produce an Astro integration object.
		const integration = core.default();
		expect(integration.name).toBe("astlide");
		expect(typeof integration.hooks).toBe("object");
	});
});

describe("@astlide/core/plugin export surface", () => {
	it("named exports are stable", () => {
		expect(Object.keys(plugin).sort()).toMatchInlineSnapshot(`
			[
			  "BUILT_IN_LAYOUTS",
			  "BUILT_IN_PLUGIN",
			  "BUILT_IN_THEMES",
			  "BUILT_IN_TRANSITIONS",
			  "defineAstlidePlugin",
			  "resolvePlugins",
			]
		`);
	});
});

describe("Canonical frontmatter shape", () => {
	it("v0.1 minimal frontmatter still parses", () => {
		const minimal = {};
		expect(slideSchema.parse(minimal)).toMatchInlineSnapshot(`
			{
			  "hidden": false,
			  "slideLayout": "default",
			  "transition": "fade",
			}
		`);
	});

	it("v0.1 maximal frontmatter still parses", () => {
		const maximal = {
			slideLayout: "two-column",
			transition: "slide-left",
			title: "My Slide",
			background: "#1e293b",
			class: "custom-class",
			notes: "Speaker notes here",
			hidden: false,
		};
		expect(slideSchema.parse(maximal)).toMatchInlineSnapshot(`
			{
			  "background": "#1e293b",
			  "class": "custom-class",
			  "hidden": false,
			  "notes": "Speaker notes here",
			  "slideLayout": "two-column",
			  "title": "My Slide",
			  "transition": "slide-left",
			}
		`);
	});

	it("v0.1 deckConfig minimal still parses", () => {
		expect(deckConfigSchema.parse({})).toMatchInlineSnapshot(`
			{
			  "theme": "default",
			}
		`);
	});

	it("v0.1 deckConfig maximal still parses", () => {
		const full = {
			title: "My Talk",
			author: "Alice",
			date: "2025-06-01",
			theme: "dark",
		};
		expect(deckConfigSchema.parse(full)).toMatchInlineSnapshot(`
			{
			  "author": "Alice",
			  "date": "2025-06-01",
			  "theme": "dark",
			  "title": "My Talk",
			}
		`);
	});
});

describe("Plugin contribution shapes", () => {
	it("AstlidePlugin minimum shape", () => {
		const p = plugin.defineAstlidePlugin({ name: "test" });
		// Optional fields default to undefined, not [].
		expect(p).toMatchInlineSnapshot(`
			{
			  "name": "test",
			}
		`);
	});

	it("Built-in theme list is stable", () => {
		expect(plugin.BUILT_IN_THEMES.map((t) => t.name)).toMatchInlineSnapshot(`
			[
			  "default",
			  "dark",
			  "minimal",
			  "corporate",
			  "gradient",
			  "rose",
			  "forest",
			]
		`);
	});

	it("Built-in layout list is stable", () => {
		expect(plugin.BUILT_IN_LAYOUTS.map((l) => l.name)).toMatchInlineSnapshot(`
			[
			  "default",
			  "cover",
			  "section",
			  "two-column",
			  "image-full",
			  "image-left",
			  "image-right",
			  "code",
			  "quote",
			  "statement",
			]
		`);
	});

	it("Built-in transition list is stable", () => {
		expect(plugin.BUILT_IN_TRANSITIONS.map((t) => t.name)).toMatchInlineSnapshot(`
			[
			  "none",
			  "fade",
			  "slide-left",
			  "slide-right",
			  "slide-up",
			  "zoom",
			]
		`);
	});
});
