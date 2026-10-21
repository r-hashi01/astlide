/**
 * PDF / PNG renders on the render service (ASTLIDE_PUBLIC_NETWORK_ONLY=1):
 * the slides load from their own site, not from the rest of the server's
 * network (here: another loopback port standing in for an internal service).
 */

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { guardedChromiumArgs, guardNetwork } from "../packages/astlide/src/cli/render";

// "https://public.test/…" stands in for a public host: /ok answers, /to-internal
// redirects to the internal service. Everything else goes to the real check.
const redirectTarget = { url: "" };
vi.mock("@astlide/core/utils/network.ts", async (original) => {
	const real = await original<typeof import("@astlide/core/utils/network.ts")>();
	return {
		...real,
		publicRequest: async (url: string, init?: Parameters<typeof real.publicRequest>[1]) => {
			if (url === "https://public.test/ok")
				return new Response("public", { headers: { "access-control-allow-origin": "*" } });
			if (url === "https://public.test/to-internal")
				return new Response(null, { status: 302, headers: { location: redirectTarget.url } });
			return real.publicRequest(url, init);
		},
	};
});

import { useBrowser } from "./helpers/browser";

const browser = useBrowser();

function listen(handler: Parameters<typeof createServer>[1]): Promise<Server> {
	return new Promise((resolve) => {
		const server = createServer(handler);
		server.listen(0, "127.0.0.1", () => resolve(server));
	});
}
const url = (server: Server) => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

let internal: Server;
let site: Server;
const hits: string[] = [];

beforeAll(async () => {
	internal = await listen((req, res) => {
		hits.push(req.url ?? "");
		res.setHeader("access-control-allow-origin", "*");
		res.end("secret");
	});
	site = await listen((req, res) => {
		if (req.url === "/own.txt") return res.end("own");
		res.setHeader("content-type", "text/html");
		res.end(`<!doctype html><body><img src="${url(internal)}/img"><script>
			window.results = Promise.all([
				fetch("/own.txt").then((r) => r.text(), () => "blocked"),
				fetch("${url(internal)}/fetch").then((r) => r.text(), () => "blocked"),
				fetch("http://localhost:${(internal.address() as AddressInfo).port}/name").then((r) => r.text(), () => "blocked"),
				fetch("data:text/plain,inline").then((r) => r.text(), () => "blocked"),
				new Promise((done) => {
					const ws = new WebSocket("ws://127.0.0.1:${(internal.address() as AddressInfo).port}/ws");
					ws.onopen = () => done("open");
					ws.onerror = ws.onclose = () => done("blocked");
				}),
			]);
		</script>`);
	});
});

afterAll(() => {
	internal.close();
	site.close();
});

describe("guardNetwork", () => {
	it("lets the slides load their own site and data: URLs, nothing on the private network", async () => {
		const context = await browser().newContext({ serviceWorkers: "block" });
		await guardNetwork(context, url(site));
		const page = await context.newPage();
		await page.goto(`${url(site)}/deck/1`);
		const results = await page.evaluate(() => (window as unknown as { results: unknown }).results);
		expect(results).toEqual(["own", "blocked", "blocked", "inline", "blocked"]);
		expect(hits).toEqual([]);
		await context.close();
	});

	it("follows a public host's redirect only while it stays public", async () => {
		redirectTarget.url = `${url(internal)}/redirected`;
		const context = await browser().newContext({ serviceWorkers: "block" });
		await guardNetwork(context, url(site));
		const page = await context.newPage();
		await page.goto(`${url(site)}/deck/1`);
		const results = await page.evaluate(() =>
			Promise.all(
				["https://public.test/ok", "https://public.test/to-internal"].map((u) =>
					fetch(u).then(
						(r) => r.text(),
						() => "blocked",
					),
				),
			),
		);
		expect(results).toEqual(["public", "blocked"]);
		expect(hits).toEqual([]);
		await context.close();
	});

	it("leaves nothing for requests the route doesn't see (shared workers, speculation rules)", async () => {
		const target = url(internal);
		const sneaky = await listen((req, res) => {
			if (req.url === "/shared.js") {
				res.setHeader("content-type", "text/javascript");
				return res.end(
					`onconnect = (e) => fetch("${target}/shared").then((r) => r.text(), () => "blocked").then((t) => e.ports[0].postMessage(t));`,
				);
			}
			res.setHeader("content-type", "text/html");
			res.end(`<script type="speculationrules">{"prefetch":[{"source":"list","urls":["${target}/prefetch"]}],"prerender":[{"source":"list","urls":["${target}/prerender"]}]}</script>
				<script>window.shared = new Promise((done) => { const w = new SharedWorker("/shared.js"); w.port.onmessage = (e) => done(e.data); w.port.start(); setTimeout(() => done("timeout"), 5000); });</script>`);
		});
		const guarded = await chromium.launch({ args: guardedChromiumArgs(url(sneaky)) });
		try {
			const context = await guarded.newContext({ serviceWorkers: "block" });
			await guardNetwork(context, url(sneaky));
			const page = await context.newPage();
			await page.goto(url(sneaky));
			expect(await page.evaluate(() => (window as unknown as { shared: unknown }).shared)).toBe(
				"blocked",
			);
			await page.waitForTimeout(1500);
			expect(hits).toEqual([]);
		} finally {
			await guarded.close();
			sneaky.close();
		}
	});
});
