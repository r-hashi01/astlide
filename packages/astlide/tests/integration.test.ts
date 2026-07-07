import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import astlide from "../src/index";

// ── Helpers ──

type HookFn = (args: Record<string, unknown>) => void;

function createMockHookArgs(
	overrides: { srcDir?: string; integrations?: Array<{ name: string }> } = {},
) {
	const injectRoute = vi.fn();
	const updateConfig = vi.fn();
	const logger = {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
		label: "astlide",
	};

	const config = {
		integrations: overrides.integrations ?? [],
		srcDir: overrides.srcDir ? { pathname: overrides.srcDir } : undefined,
	};

	return { config, injectRoute, updateConfig, logger };
}

/** Extract the config:setup hook and call it with mock args. */
function runSetup(
	options?: Parameters<typeof astlide>[0],
	hookOverrides?: Parameters<typeof createMockHookArgs>[0],
) {
	const integration = astlide(options);
	const args = createMockHookArgs(hookOverrides);
	const hook = integration.hooks["astro:config:setup"] as HookFn;
	hook(args);
	return { integration, args };
}

describe("astlide integration", () => {
	// ── Basics ──

	it("returns an integration with name 'astlide'", () => {
		const integration = astlide();
		expect(integration.name).toBe("astlide");
	});

	it("has an astro:config:setup hook", () => {
		const integration = astlide();
		expect(typeof integration.hooks["astro:config:setup"]).toBe("function");
	});

	// ── Route injection ──

	describe("route injection", () => {
		it("injects all-slides print route, slide route, and index route", () => {
			const { args } = runSetup();

			expect(args.injectRoute).toHaveBeenCalledTimes(3);

			// Print route (must be injected before the generic slide pattern so it wins).
			expect(args.injectRoute).toHaveBeenNthCalledWith(1, {
				pattern: "/[deck]/all",
				entrypoint: "@astlide/core/internal/pages/all.astro",
			});

			// Slide route
			expect(args.injectRoute).toHaveBeenNthCalledWith(2, {
				pattern: "/[deck]/[...slide]",
				entrypoint: "@astlide/core/internal/pages/slide.astro",
			});

			// Index route
			expect(args.injectRoute).toHaveBeenNthCalledWith(3, {
				pattern: "/",
				entrypoint: "@astlide/core/internal/pages/index.astro",
			});
		});

		const injectedPatterns = (args: ReturnType<typeof runSetup>["args"]): string[] =>
			(args.injectRoute as ReturnType<typeof vi.fn>).mock.calls.map(
				(call) => (call[0] as { pattern: string }).pattern,
			);

		it("skips the index route when injectIndexRoute is false", () => {
			const { args } = runSetup({ injectIndexRoute: false });
			const patterns = injectedPatterns(args);
			expect(patterns).not.toContain("/");
			// Deck routes are unaffected.
			expect(patterns).toContain("/[deck]/[...slide]");
			expect(patterns).toContain("/[deck]/all");
		});

		it("auto-skips the index route when the user has their own src/pages/index", () => {
			const dir = mkdtempSync(join(tmpdir(), "astlide-idx-"));
			mkdirSync(join(dir, "pages"), { recursive: true });
			writeFileSync(join(dir, "pages", "index.astro"), "<h1>home</h1>");
			try {
				const { args } = runSetup(undefined, { srcDir: dir });
				expect(injectedPatterns(args)).not.toContain("/");
			} finally {
				rmSync(dir, { recursive: true, force: true });
			}
		});

		it("still injects the index route when injectIndexRoute is true despite a user index", () => {
			const dir = mkdtempSync(join(tmpdir(), "astlide-idx-"));
			mkdirSync(join(dir, "pages"), { recursive: true });
			writeFileSync(join(dir, "pages", "index.mdx"), "# home");
			try {
				const { args } = runSetup({ injectIndexRoute: true }, { srcDir: dir });
				expect(injectedPatterns(args)).toContain("/");
			} finally {
				rmSync(dir, { recursive: true, force: true });
			}
		});
	});

	// ── MDX auto-add ──

	describe("MDX integration", () => {
		it("adds MDX when not already present", () => {
			const { args } = runSetup(undefined, { integrations: [] });

			expect(args.updateConfig).toHaveBeenCalledTimes(1);
			const configCall = args.updateConfig.mock.calls[0][0];
			expect(configCall.integrations).toBeDefined();
			expect(configCall.integrations.length).toBe(1);
		});

		it("skips MDX when already present", () => {
			const { args } = runSetup(undefined, {
				integrations: [{ name: "@astrojs/mdx" }],
			});

			expect(args.updateConfig).toHaveBeenCalledTimes(1);
			const configCall = args.updateConfig.mock.calls[0][0];
			// Should NOT have integrations key when MDX already exists
			expect(configCall.integrations).toBeUndefined();
		});
	});

	// ── Shiki theme ──

	describe("Shiki theme configuration", () => {
		it("uses default theme 'github-dark'", () => {
			const { args } = runSetup();

			const configCall = args.updateConfig.mock.calls[0][0];
			expect(configCall.markdown.shikiConfig.theme).toBe("github-dark");
			expect(configCall.markdown.shikiConfig.wrap).toBe(true);
		});

		it("respects custom shikiTheme option", () => {
			const { args } = runSetup({ shikiTheme: "one-dark-pro" });

			const configCall = args.updateConfig.mock.calls[0][0];
			expect(configCall.markdown.shikiConfig.theme).toBe("one-dark-pro");
		});
	});

	// ── Content collection warnings ──

	describe("content collection config check", () => {
		let tmpDir: string;

		beforeEach(() => {
			tmpDir = mkdtempSync(join(tmpdir(), "astlide-test-"));
		});

		afterEach(() => {
			rmSync(tmpDir, { recursive: true, force: true });
		});

		it("warns when content config is missing", () => {
			const srcDir = join(tmpDir, "src");
			mkdirSync(srcDir, { recursive: true });

			const { args } = runSetup(undefined, { srcDir });

			expect(args.logger.warn).toHaveBeenCalledWith(
				expect.stringContaining("No content collection config found"),
			);
		});

		it("does not warn when content.config.ts exists", () => {
			const srcDir = join(tmpDir, "src");
			mkdirSync(srcDir, { recursive: true });
			writeFileSync(join(srcDir, "content.config.ts"), "// config");

			const { args } = runSetup(undefined, { srcDir });

			// Should not warn about config (may still warn about decks dir)
			const configWarnings = args.logger.warn.mock.calls.filter((call: string[]) =>
				call[0].includes("content collection config"),
			);
			expect(configWarnings).toHaveLength(0);
		});

		it("does not warn when content.config.mts exists", () => {
			const srcDir = join(tmpDir, "src");
			mkdirSync(srcDir, { recursive: true });
			writeFileSync(join(srcDir, "content.config.mts"), "// config");

			const { args } = runSetup(undefined, { srcDir });

			const configWarnings = args.logger.warn.mock.calls.filter((call: string[]) =>
				call[0].includes("content collection config"),
			);
			expect(configWarnings).toHaveLength(0);
		});

		it("warns when decks directory is missing", () => {
			const srcDir = join(tmpDir, "src");
			mkdirSync(srcDir, { recursive: true });
			writeFileSync(join(srcDir, "content.config.ts"), "// config");

			const { args } = runSetup(undefined, { srcDir });

			expect(args.logger.warn).toHaveBeenCalledWith(
				expect.stringContaining("No decks directory found"),
			);
		});

		it("does not warn when decks directory exists", () => {
			const srcDir = join(tmpDir, "src");
			mkdirSync(join(srcDir, "content", "decks"), { recursive: true });
			writeFileSync(join(srcDir, "content.config.ts"), "// config");

			const { args } = runSetup(undefined, { srcDir });

			// No warnings at all
			expect(args.logger.warn).not.toHaveBeenCalled();
		});
	});

	// ── CSP option ──

	describe("CSP option", () => {
		it("injects __ASTLIDE_CSP__ = true by default", () => {
			const { args } = runSetup();
			const configCall = args.updateConfig.mock.calls[0][0];
			expect(configCall.vite.define.__ASTLIDE_CSP__).toBe("true");
		});

		it("injects __ASTLIDE_CSP__ = false when csp: false", () => {
			const { args } = runSetup({ csp: false });
			const configCall = args.updateConfig.mock.calls[0][0];
			expect(configCall.vite.define.__ASTLIDE_CSP__).toBe("false");
		});

		it("injects custom CSP string when csp is a string", () => {
			const custom = "default-src 'self'; script-src 'nonce-abc'";
			const { args } = runSetup({ csp: custom });
			const configCall = args.updateConfig.mock.calls[0][0];
			expect(configCall.vite.define.__ASTLIDE_CSP__).toBe(JSON.stringify(custom));
		});
	});

	// ── Options default ──

	it("works with no options", () => {
		expect(() => runSetup()).not.toThrow();
	});

	// ── Single updateConfig call ──

	it("calls updateConfig exactly once", () => {
		const { args } = runSetup();

		expect(args.updateConfig).toHaveBeenCalledTimes(1);
	});
});
