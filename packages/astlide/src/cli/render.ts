/**
 * PDF / PNG rendering of a deck from a running site (dev, preview or the
 * temporary server `astlide export` starts).
 *
 * Chromium runs with its sandbox on; `ASTLIDE_CHROMIUM_SANDBOX=0` turns it off
 * (only for environments that can't provide it, see {@link launchChromium}).
 *
 * The render service also sets: `ASTLIDE_PUBLIC_NETWORK_ONLY=1` (slides reach
 * only public hosts) and `ASTLIDE_MAX_SLIDES` (most slides rendered).
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { publicNetworkOnly, publicRequest, readBody } from "@astlide/core/utils/network";
import { type BrowserContext, chromium, type Page } from "playwright";

export interface RenderOptions {
	/** Output file (PDF) or directory (PNG). */
	output?: string;
	format?: "pdf" | "png";
	/** Site URL including Astro's base, e.g. http://localhost:4321/my-repo */
	baseUrl: string;
	width: number;
	height: number;
	/**
	 * Render from the print view (`/<deck>/all`) only — for a site written
	 * without Astro, which has no page per slide: the slides are counted
	 * there, and PNGs are its slides one by one.
	 */
	printViewOnly?: boolean;
}

/** The slides in the print view (a deck's own script can't raise it past ASTLIDE_MAX_SLIDES). */
async function printViewSlideCount(page: Page): Promise<number> {
	const count = await page.evaluate(() => document.querySelectorAll("section.slide").length);
	const max = Number(process.env.ASTLIDE_MAX_SLIDES);
	return max > 0 ? Math.min(count, max) : count;
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
	process.stdout.write(
		slideCount
			? `  Rendering ${slideCount} slide${slideCount === 1 ? "" : "s"}…\r`
			: "  Rendering…\r",
	);
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

/** PNGs of the print view's slides (see {@link RenderOptions.printViewOnly}). */
async function exportPrintViewToPNG(
	context: BrowserContext,
	deck: string,
	outputDir: string,
	baseUrl: string,
	width: number,
	height: number,
): Promise<number> {
	const page = await context.newPage();
	await page.setViewportSize({ width, height });
	await mkdir(outputDir, { recursive: true });
	await page.goto(`${baseUrl}/${deck}/all`);
	await page.waitForLoadState("networkidle");
	await page.waitForFunction(() => document.fonts.ready);
	await waitForDiagrams(page);
	const count = await printViewSlideCount(page);
	const slides = await page.$$("section.slide");
	for (let i = 0; i < count; i++) {
		process.stdout.write(`  Slide ${i + 1}/${count}\r`);
		await slides[i]?.screenshot({
			path: join(outputDir, `slide-${String(i + 1).padStart(3, "0")}.png`),
			type: "png",
		});
	}
	console.log("");
	await page.close();
	return count;
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
	const guarded = publicNetworkOnly();
	const browser = await launchChromium(guarded ? guardedChromiumArgs(options.baseUrl) : []);
	try {
		const context = await browser.newContext({ serviceWorkers: "block" });
		if (guarded) await guardNetwork(context, options.baseUrl);
		if (options.printViewOnly && options.format === "png") {
			const outputDir = options.output || `./dist/${deck}-slides`;
			const n = await exportPrintViewToPNG(
				context,
				deck,
				outputDir,
				options.baseUrl,
				options.width,
				options.height,
			);
			console.log(`  ✓ ${n} slides saved to ${outputDir}/`);
			return;
		}
		const slideCount = options.printViewOnly
			? 0
			: await getSlideCount(context, options.baseUrl, deck);
		if (!options.printViewOnly) console.log(`  ${slideCount} slides found`);

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
 * Chromium flags for a guarded render of the site at `baseUrl`. Everything
 * goes to a proxy that isn't there, loopback included (`<-loopback>`), except
 * the rendered site itself: requests that the route in {@link guardNetwork}
 * doesn't see — shared workers, speculative prefetch / prerender — go
 * nowhere. WebRTC sends no UDP of its own.
 */
export function guardedChromiumArgs(baseUrl: string): string[] {
	const site = new URL(baseUrl);
	const port = site.port || (site.protocol === "https:" ? "443" : "80");
	return [
		"--proxy-server=http://127.0.0.1:9",
		`--proxy-bypass-list=<-loopback>;${site.hostname}:${port}`,
		"--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
		"--webrtc-ip-handling-policy=disable_non_proxied_udp",
		"--dns-prefetch-disable",
		// Memory: a few renderer processes, each with a bounded JavaScript heap.
		"--renderer-process-limit=4",
		"--js-flags=--max-old-space-size=512",
	];
}

/** Bounds on what a guarded page may load from other hosts. */
const GUARDED_LIMITS = {
	/** One response, in bytes. */
	response: 20 * 1024 * 1024,
	/** All responses of one render together, in bytes. */
	total: 200 * 1024 * 1024,
	/** Requests in flight at once (more wait). */
	parallel: 6,
};

/** Request headers not passed on when Astlide makes a request for the page. */
const HOP_HEADERS = new Set([
	"host",
	"connection",
	"content-length",
	"accept-encoding",
	"keep-alive",
	"transfer-encoding",
	"upgrade",
]);

/** Response headers not handed to Chromium: transport details, and anything that would make it navigate itself. */
const DROPPED_RESPONSE_HEADERS = new Set([
	"location",
	"refresh",
	"content-encoding",
	"content-length",
	"transfer-encoding",
	"connection",
	"keep-alive",
	"alt-svc",
]);

/**
 * With `ASTLIDE_PUBLIC_NETWORK_ONLY=1` (the render service): the slides may
 * load from the site being rendered, `data:` / `blob:` URLs and public
 * http(s) hosts — nothing on the server's own network (loopback, private
 * ranges, cloud metadata), no other schemes, no WebSockets or service
 * workers. Chromium doesn't connect to other hosts itself: Astlide makes
 * those requests ({@link publicRequest}: checked as it connects) and hands
 * Chromium the response. Redirects are followed here, each hop checked —
 * Chromium would follow a redirect it is handed without routing it again —
 * and a page can't load more than {@link GUARDED_LIMITS} allow. Pair it with
 * {@link guardedChromiumArgs} for what the route doesn't see.
 */
export async function guardNetwork(context: BrowserContext, baseUrl: string): Promise<void> {
	const site = new URL(baseUrl).origin;
	let loaded = 0;
	let reserved = 0;
	let running = 0;
	const waiting: (() => void)[] = [];
	const slot = async () => {
		if (running >= GUARDED_LIMITS.parallel) await new Promise<void>((go) => waiting.push(go));
		running++;
	};
	const release = () => {
		running--;
		waiting.shift()?.();
	};
	await context.route("**/*", async (route) => {
		const request = route.request();
		const url = request.url();
		const sameSite = URL.canParse(url) && new URL(url).origin === site;
		// The page itself stays on the site: no redirect, refresh or link replaces what is
		// rendered (a 204 leaves the current document in place; an abort would show an error page).
		if (!sameSite && request.isNavigationRequest() && isMainFrame(request))
			return route.fulfill({ status: 204 });
		if (url.startsWith("data:") || url.startsWith("blob:")) return route.continue();
		if (sameSite) return route.continue();
		await slot();
		try {
			const headers: Record<string, string> = {};
			for (const [name, value] of Object.entries(await request.allHeaders()))
				if (!name.startsWith(":") && !HOP_HEADERS.has(name)) headers[name] = value;
			const signal = AbortSignal.timeout(30_000);
			let method = request.method();
			let body: Buffer | undefined = request.postDataBuffer() ?? undefined;
			let target = url;
			let res = await publicRequest(target, { method, headers, body, signal });
			for (
				let hop = 0;
				res.status >= 300 && res.status < 400 && res.headers.get("location");
				hop++
			) {
				if (hop === 5) throw new Error("too many redirects");
				await res.body?.cancel();
				const next = new URL(res.headers.get("location") as string, target);
				// Credentials stay with the host they were meant for.
				if (next.origin !== new URL(target).origin) {
					delete headers.authorization;
					delete headers.cookie;
				}
				// 307 / 308 repeat the request; the others become a GET without a body.
				if (res.status !== 307 && res.status !== 308) {
					method = "GET";
					body = undefined;
					delete headers["content-type"];
				}
				target = next.href;
				res = await publicRequest(target, { method, headers, body, signal });
			}
			const encoding = res.headers.get("content-encoding");
			if (encoding && encoding !== "identity") throw new Error(`compressed response (${encoding})`);
			// Reserved before reading, so responses read at once can't overshoot the total.
			const limit = Math.min(GUARDED_LIMITS.response, GUARDED_LIMITS.total - loaded - reserved);
			if (limit <= 0) throw new Error("over the render's download budget");
			reserved += limit;
			let content: Buffer;
			try {
				content = await readBody(res, limit);
			} finally {
				reserved -= limit;
			}
			loaded += content.length;
			const passed: Record<string, string> = {};
			for (const [name, value] of res.headers)
				if (!DROPPED_RESPONSE_HEADERS.has(name)) passed[name] = value;
			await route.fulfill({ status: res.status, headers: passed, body: content });
		} catch (err) {
			const refused = err instanceof Error && err.message.startsWith("refused");
			await route.abort(refused ? "blockedbyclient" : "failed");
		} finally {
			release();
		}
	});
	await context.routeWebSocket(/.*/, (ws) => ws.close());
}

/** Whether `request` loads a page's top-level document (not a frame's, nor a worker's). */
function isMainFrame(request: import("playwright").Request): boolean {
	try {
		return request.frame().parentFrame() === null;
	} catch {
		// Requests of service workers have no frame.
		return false;
	}
}

/** Whether Chromium keeps its sandbox: on unless `ASTLIDE_CHROMIUM_SANDBOX=0`. */
export function chromiumSandbox(env: Record<string, string | undefined> = process.env): boolean {
	return env.ASTLIDE_CHROMIUM_SANDBOX !== "0";
}

/**
 * Chromium for PDF / PNG, with its sandbox on (Playwright turns it off by
 * default): the slides are web pages, and a renderer bug should stay inside
 * the sandbox. On Linux the sandbox needs user namespaces; when the system
 * refuses them this fails with how to allow them — it never quietly runs
 * without the sandbox. `ASTLIDE_CHROMIUM_SANDBOX=0` opts out.
 */
export async function launchChromium(args: string[] = []) {
	const sandbox = chromiumSandbox();
	return chromium.launch({ chromiumSandbox: sandbox, args }).catch((err: Error) => {
		if (/Executable doesn't exist/.test(err.message)) {
			throw new Error(
				"PDF / PNG export needs Chromium. Install it once with: bunx playwright install chromium\n" +
					"(PPTX needs no browser: --pptx)",
			);
		}
		if (sandbox && /sandbox|namespace|zygote/i.test(err.message)) {
			throw new Error(
				"Chromium couldn't start its sandbox (it needs unprivileged user namespaces).\n" +
					"  · Linux (e.g. Ubuntu 24.04): allow them for Playwright's Chromium only, with an AppArmor profile:\n" +
					"    https://astlide.dev/guides/export/#chromium-sandbox-on-linux\n" +
					"  · Docker: run with --security-opt seccomp=<the Chromium profile> (see the render service guide)\n" +
					"  · Or, only where the slides are your own: ASTLIDE_CHROMIUM_SANDBOX=0\n" +
					`(${err.message.split("\n")[0]})`,
			);
		}
		throw err;
	});
}
