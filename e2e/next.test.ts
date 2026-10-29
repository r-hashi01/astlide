/**
 * @astlide/next: the playground's decks as a Next.js app (playground-next,
 * `next build` + `next start`): pages, client-side navigation with Next's
 * router, the presenter window, the print view, diagrams, and `astlide export`
 * against the Next site.
 */

import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { useBrowser } from "./helpers/browser";

const browser = useBrowser();
const app = resolve("playground-next");
let server: ChildProcess | undefined;
let base: string;

const freePort = () =>
	new Promise<number>((done) => {
		const s = createServer().listen(0, "127.0.0.1", () => {
			const { port } = s.address() as { port: number };
			s.close(() => done(port));
		});
	});

beforeAll(async () => {
	execFileSync("bunx", ["next", "build"], { cwd: app, stdio: "pipe" });
	const port = await freePort();
	base = `http://127.0.0.1:${port}`;
	// Its own process group, stopped as a whole (bunx → next → next-server).
	server = spawn("bunx", ["next", "start", "-p", String(port), "-H", "127.0.0.1"], {
		cwd: app,
		stdio: "ignore",
		detached: true,
	});
	for (let i = 0; i < 120; i++) {
		if (
			await fetch(`${base}/tour/1/`).then(
				(r) => r.ok,
				() => false,
			)
		)
			return;
		await new Promise((r) => setTimeout(r, 250));
	}
	throw new Error("next start didn't come up");
}, 300_000);

afterAll(() => {
	if (server?.pid)
		try {
			process.kill(-server.pid, "SIGTERM");
		} catch {
			// already gone
		}
});

async function open(path: string): Promise<Page> {
	const page = await browser().newPage({ viewport: { width: 1920, height: 1080 } });
	await page.goto(`${base}${path}`);
	await page.waitForSelector(".slide");
	return page;
}

const slideOf = (page: Page) => Number(new URL(page.url()).pathname.match(/\/(\d+)\/?$/)?.[1]);

describe("@astlide/next", () => {
	it("moves between slides with Next's router, without reloading the page", async () => {
		const page = await open("/tour/1/");
		await page.evaluate(() => {
			(window as unknown as { __marker: number }).__marker = 1;
		});
		await page.keyboard.press("ArrowRight");
		await expect.poll(() => slideOf(page)).toBe(2);
		await expect.poll(() => page.locator(".nav-indicator").textContent()).toBe("2 / 29");
		// Still the same document: a client-side navigation.
		expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(
			1,
		);
		await page.keyboard.press("ArrowRight");
		await expect.poll(() => slideOf(page)).toBe(3);
		await page.keyboard.press("ArrowLeft");
		await expect.poll(() => slideOf(page)).toBe(2);
		expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("default");
		await page.close();
	});

	it("renders MDX slides on the server, components included", async () => {
		const html = await (await fetch(`${base}/tour/7/`)).text();
		expect(html).toContain('class="column column-left"');
		expect(html).toContain("data-astlide-c");
	});

	it("renders the presenter window with the slide in its panel", async () => {
		const page = await open("/tour/16/?presenter");
		await expect.poll(() => page.locator(".presenter-current #slide-scaler").count()).toBe(1);
		await expect
			.poll(() =>
				page.evaluate(() => {
					const frame = document.querySelector<HTMLIFrameElement>(".presenter-next-frame iframe");
					return frame ? new URL(frame.src).pathname : null;
				}),
			)
			.toBe("/tour/17/");
		await page.close();
	});

	it("draws Mermaid diagrams", async () => {
		const page = await open("/tour/19/");
		await expect.poll(() => page.locator("pre.astlide-mermaid svg").count()).toBeGreaterThan(0);
		await page.close();
	});

	it("serves the print view the exporters use", async () => {
		const page = await open("/tour/all/");
		await expect
			.poll(() => page.evaluate(() => document.documentElement.hasAttribute("data-diagrams-ready")))
			.toBe(true);
		expect(
			await page.evaluate(() => document.documentElement.hasAttribute("data-astlide-all")),
		).toBe(true);
		expect(await page.locator("section.slide").count()).toBe(29);
		await page.close();
	});

	it("exports PNGs from the Next site with astlide export", () => {
		const out = mkdtempSync(join(tmpdir(), "astlide-next-export-"));
		try {
			execFileSync(
				"bun",
				[
					"packages/astlide/src/cli/astlide.ts",
					"export",
					"example-deck",
					"--png",
					"--cwd",
					"playground",
					"--base-url",
					base,
					"--out-dir",
					out,
				],
				{ stdio: "pipe" },
			);
			const pngs = readdirSync(join(out, "example-deck-slides")).filter((n) => n.endsWith(".png"));
			expect(pngs).toHaveLength(11);
			expect(
				readFileSync(join(out, "example-deck-slides", pngs[0] as string))
					.subarray(1, 4)
					.toString(),
			).toBe("PNG");
		} finally {
			rmSync(out, { recursive: true, force: true });
		}
	}, 180_000);
});
