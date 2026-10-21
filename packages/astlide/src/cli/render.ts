/**
 * PDF / PNG rendering of a deck from a running site (dev, preview or the
 * temporary server `astlide export` starts).
 *
 * The render service sets: `ASTLIDE_PUBLIC_NETWORK_ONLY=1` (slides reach only
 * public hosts), `ASTLIDE_MAX_SLIDES` (most slides rendered) and, when asked,
 * `ASTLIDE_CHROMIUM_SANDBOX=1` (Chromium keeps its sandbox).
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { publicNetworkOnly, publicRequest, readBody } from "@astlide/core/utils/network.ts";
import { type BrowserContext, chromium, type Page } from "playwright";

export interface RenderOptions {
	/** Output file (PDF) or directory (PNG). */
	output?: string;
	format?: "pdf" | "png";
	/** Site URL including Astro's base, e.g. http://localhost:4321/my-repo */
	baseUrl: string;
	width: number;
	height: number;
}

async function getSlideCount(
	context: BrowserContext,
	baseUrl: string,
	deck: string,
): Promise<number> {
	const page = await context.newPage();
	await page.goto(`${baseUrl}/${deck}/1`);
	await page.waitForLoadState("networkidle");
	const count = await page.evaluate(() =>
		parseInt((document.body as HTMLElement).dataset.totalSlides || "0", 10),
	);
	await page.close();
	// The page says how many slides it has; a deck's own script could claim more.
	const max = Number(process.env.ASTLIDE_MAX_SLIDES);
	const n = Number.isFinite(count) && count > 0 ? count : 0;
	return max > 0 ? Math.min(n, max) : n;
}

const EXPORT_STYLE = `
	.slide-nav, .progress-bar, .overview, .notes-overlay { display: none !important; }
	.presentation { background: transparent !important; }
	.slide-scaler { transform: none !important; width: auto !important; height: auto !important; }
`;

async function exportToPDF(
	context: BrowserContext,
	deck: string,
	slideCount: number,
	outputPath: string,
	baseUrl: string,
	width: number,
	height: number,
): Promise<void> {
	const page = await context.newPage();
	await page.setViewportSize({ width, height });

	// Navigate to the /[deck]/all route which stacks every slide with page-break-after,
	// then let Chromium emit a multi-page PDF in one call. Removes the need for pdf-lib.
	process.stdout.write(`  Rendering ${slideCount} slide${slideCount === 1 ? "" : "s"}…\r`);
	await page.goto(`${baseUrl}/${deck}/all`);
	await page.waitForLoadState("networkidle");
	await page.waitForFunction(() => document.fonts.ready);
	await waitForDiagrams(page);

	const pdfBytes = await page.pdf({
		width: `${width}px`,
		height: `${height}px`,
		printBackground: true,
		margin: { top: 0, right: 0, bottom: 0, left: 0 },
		preferCSSPageSize: false,
	});

	console.log("");
	await page.close();

	await mkdir(dirname(outputPath), { recursive: true });
	await writeFile(outputPath, pdfBytes);
}

async function exportToPNG(
	context: BrowserContext,
	deck: string,
	slideCount: number,
	outputDir: string,
	baseUrl: string,
	width: number,
	height: number,
): Promise<void> {
	const page = await context.newPage();
	await page.setViewportSize({ width, height });

	await mkdir(outputDir, { recursive: true });

	for (let i = 1; i <= slideCount; i++) {
		process.stdout.write(`  Slide ${i}/${slideCount}\r`);

		await page.goto(`${baseUrl}/${deck}/${i}`);
		await page.waitForLoadState("networkidle");
		await page.waitForFunction(() => document.fonts.ready);
		await waitForDiagrams(page);

		await page.addStyleTag({ content: EXPORT_STYLE });

		const slideElement = await page.$(".slide");
		if (slideElement) {
			await slideElement.screenshot({
				path: join(outputDir, `slide-${String(i).padStart(3, "0")}.png`),
				type: "png",
			});
		}
	}

	console.log("");
	await page.close();
}

export async function exportDeck(deck: string, options: RenderOptions): Promise<void> {
	console.log(`\nExporting: ${deck}`);

	// Launch a single browser instance shared across slide-count detection and export
	// ASTLIDE_CHROMIUM_SANDBOX=1 keeps Chromium's sandbox on (Playwright turns it
	// off by default); it needs user namespaces, which containers often deny.
	const chromiumSandbox = process.env.ASTLIDE_CHROMIUM_SANDBOX === "1";
	const guarded = publicNetworkOnly();
	const browser = await chromium
		.launch({ chromiumSandbox, args: guarded ? GUARDED_ARGS : [] })
		.catch((err: Error) => {
			if (/Executable doesn't exist/.test(err.message)) {
				throw new Error(
					"PDF / PNG export needs Chromium. Install it once with: bunx playwright install chromium\n" +
						"(PPTX needs no browser: --pptx)",
				);
			}
			throw err;
		});
	try {
		const context = await browser.newContext({ serviceWorkers: "block" });
		if (guarded) await guardNetwork(context, options.baseUrl);
		const slideCount = await getSlideCount(context, options.baseUrl, deck);
		console.log(`  ${slideCount} slides found`);

		if (options.format === "png") {
			const outputDir = options.output || `./dist/${deck}-slides`;
			await exportToPNG(
				context,
				deck,
				slideCount,
				outputDir,
				options.baseUrl,
				options.width,
				options.height,
			);
			console.log(`  ✓ Saved to ${outputDir}/`);
		} else {
			const outputPath = options.output || `./dist/${deck}.pdf`;
			await exportToPDF(
				context,
				deck,
				slideCount,
				outputPath,
				options.baseUrl,
				options.width,
				options.height,
			);
			console.log(`  ✓ Saved to ${outputPath}`);
		}
	} finally {
		await browser.close();
	}
}

/**
 * Wait until client-side diagrams (```mermaid) are rendered: the page sets
 * `<html data-diagrams-ready>` once done, or right away when it has none.
 */
async function waitForDiagrams(page: Page): Promise<void> {
	await page.waitForFunction(
		() => document.documentElement.hasAttribute("data-diagrams-ready"),
		null,
		{
			timeout: 30_000,
		},
	);
}

/**
 * Chromium flags for a guarded render: anything that isn't routed (see
 * {@link guardNetwork}) goes to a proxy that isn't there — Chromium always
 * bypasses proxies for loopback, where the rendered site is — and WebRTC
 * sends no UDP of its own.
 */
const GUARDED_ARGS = [
	"--proxy-server=http://127.0.0.1:9",
	"--force-webrtc-ip-handling-policy",
	"--webrtc-ip-handling-policy=disable_non_proxied_udp",
];

/** Largest response a guarded page may load from another host, in bytes. */
const GUARDED_RESPONSE_LIMIT = 50 * 1024 * 1024;

/** Redirect statuses, followed by {@link guardNetwork} itself. */
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

/** Request headers not passed on when Astlide makes a request for the page. */
const HOP_HEADERS = new Set([
	"host",
	"connection",
	"content-length",
	"accept-encoding",
	"keep-alive",
]);

/**
 * With `ASTLIDE_PUBLIC_NETWORK_ONLY=1` (the render service): the slides may
 * load from the site being rendered, `data:` / `blob:` URLs and public
 * http(s) hosts — nothing on the server's own network (loopback, private
 * ranges, cloud metadata), no other schemes, no WebSockets or service
 * workers. Chromium doesn't connect to other hosts itself: Astlide makes
 * those requests ({@link publicRequest}: checked as it connects) and hands
 * Chromium the response. Redirects are followed here, each hop checked —
 * Chromium would follow a redirect it is handed without routing it again.
 */
export async function guardNetwork(context: BrowserContext, baseUrl: string): Promise<void> {
	const site = new URL(baseUrl).origin;
	await context.route("**/*", async (route) => {
		const request = route.request();
		const url = request.url();
		if (url.startsWith("data:") || url.startsWith("blob:")) return route.continue();
		if (URL.canParse(url) && new URL(url).origin === site) return route.continue();
		try {
			const headers: Record<string, string> = {};
			for (const [name, value] of Object.entries(await request.allHeaders()))
				if (!name.startsWith(":") && !HOP_HEADERS.has(name)) headers[name] = value;
			const signal = AbortSignal.timeout(30_000);
			let method = request.method();
			let body: Buffer | undefined = request.postDataBuffer() ?? undefined;
			let target = url;
			let res = await publicRequest(target, { method, headers, body, signal });
			for (let hop = 0; REDIRECTS.has(res.status) && res.headers.get("location"); hop++) {
				if (hop === 5) throw new Error("too many redirects");
				await res.body?.cancel();
				target = new URL(res.headers.get("location") as string, target).href;
				// 307 / 308 repeat the request; the others become a GET.
				if (res.status !== 307 && res.status !== 308) {
					method = "GET";
					body = undefined;
				}
				res = await publicRequest(target, { method, headers, body, signal });
			}
			const content = await readBody(res, GUARDED_RESPONSE_LIMIT);
			await route.fulfill({
				status: res.status,
				headers: Object.fromEntries(res.headers),
				body: content,
			});
		} catch (err) {
			const refused = err instanceof Error && err.message.startsWith("refused");
			await route.abort(refused ? "blockedbyclient" : "failed");
		}
	});
	await context.routeWebSocket(/.*/, (ws) => ws.close());
}
