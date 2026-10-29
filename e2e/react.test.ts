/**
 * @astlide/react in a browser: the playground's tour deck as a React app
 * (MDX slides compiled with compileSlideMdx, <DeckPage> + <Slide>), driven by
 * the same deck runtime as the Astro pages.
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import type { Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { useBrowser } from "./helpers/browser";
import { buildReactHarness } from "./helpers/react-harness";

const browser = useBrowser();
let out: string;
let server: Server;
let base: string;

const TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".css": "text/css",
	".js": "text/javascript",
	".svg": "image/svg+xml",
	".png": "image/png",
	".woff2": "font/woff2",
	".woff": "font/woff",
	".ttf": "font/ttf",
};

beforeAll(async () => {
	out = mkdtempSync(join(tmpdir(), "astlide-react-e2e-"));
	await buildReactHarness(["tour"], out);
	// The app's pages, and the playground's public files (pictures) after them.
	const roots = [out, resolve("playground", "dist")];
	server = createServer((req, res) => {
		const path = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
		for (const root of roots) {
			const file = normalize(join(root, path.endsWith("/") ? `${path}index.html` : path));
			if (!file.startsWith(root)) continue;
			try {
				res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
				res.end(readFileSync(file));
				return;
			} catch {
				// next root
			}
		}
		res.writeHead(404).end();
	});
	await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
	base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}, 300_000);

afterAll(() => {
	server?.close();
	rmSync(out, { recursive: true, force: true });
});

async function open(path: string): Promise<Page> {
	const page = await browser().newPage({ viewport: { width: 1920, height: 1080 } });
	await page.goto(`${base}${path}`);
	await page.waitForSelector(".slide");
	return page;
}

const slideOf = (page: Page) => Number(new URL(page.url()).pathname.match(/\/(\d+)\/?$/)?.[1]);

describe("@astlide/react deck page", () => {
	it("moves between slides with the keyboard and shows the counter", async () => {
		const page = await open("/tour/1/");
		expect(await page.locator(".nav-indicator").textContent()).toBe("1 / 29");
		await page.keyboard.press("ArrowRight");
		await expect.poll(() => slideOf(page)).toBe(2);
		await page.waitForSelector(".slide");
		expect(await page.locator(".nav-indicator").textContent()).toBe("2 / 29");
		await page.keyboard.press("ArrowLeft");
		await expect.poll(() => slideOf(page)).toBe(1);
		await page.close();
	});

	it("steps through fragments before leaving the slide", async () => {
		const page = await open("/tour/16/");
		const visible = () =>
			page
				.locator('[data-fragment][data-fragment-visible="true"]:not([data-fragment-hide])')
				.count();
		expect(await visible()).toBe(0);
		await page.keyboard.press("ArrowRight");
		await expect.poll(visible).toBe(1);
		expect(slideOf(page)).toBe(16);
		await page.close();
	});

	it("renders the presenter window: the slide in the panel, the next slide, the notes", async () => {
		const page = await open("/tour/16/?presenter");
		expect(await page.locator(".presenter-current #slide-scaler").count()).toBe(1);
		expect(await page.locator(".presentation #slide-scaler").count()).toBe(0);
		await expect
			.poll(() =>
				page.evaluate(() => {
					const frame = document.querySelector<HTMLIFrameElement>(".presenter-next-frame iframe");
					return frame ? new URL(frame.src).pathname : null;
				}),
			)
			.toBe("/tour/17/");
		expect(await page.locator(".presenter-notes").textContent()).toContain(
			"Press → to step through.",
		);
		await page.close();
	});

	it("opens the notes overlay and the overview", async () => {
		const page = await open("/tour/16/");
		await page.keyboard.press("n");
		await expect
			.poll(() => page.locator("#notes-overlay").getAttribute("aria-hidden"))
			.toBe("false");
		await page.keyboard.press("n");
		await page.keyboard.press("o");
		await expect.poll(() => page.locator("#overview-grid .overview-item").count()).toBe(29);
		await page.close();
	});
});
