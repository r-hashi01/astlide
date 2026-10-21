/**
 * PDF / PNG renders on the render service (ASTLIDE_PUBLIC_NETWORK_ONLY=1):
 * the slides load from their own site, not from the rest of the server's
 * network (here: another loopback port standing in for an internal service).
 */

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { guardNetwork } from "../packages/astlide/src/cli/render";
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
});
