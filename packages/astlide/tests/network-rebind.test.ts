/**
 * DNS rebinding: a host that resolves to a public address when checked and
 * to a private one when connecting. The check must happen at connect time.
 */

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// "rebind.test": public for a plain lookup (a separate check), loopback for the socket's own lookup.
vi.mock("node:dns/promises", async (original) => {
	const real = await original<typeof import("node:dns/promises")>();
	return {
		...real,
		lookup: (async (host: string, options: unknown) =>
			host === "rebind.test"
				? [{ address: "93.184.216.34", family: 4 }]
				: real.lookup(host, options as never)) as typeof real.lookup,
	};
});
vi.mock("node:dns", async (original) => {
	const real = await original<typeof import("node:dns")>();
	return {
		...real,
		lookup: ((host: string, options: unknown, callback: (...a: unknown[]) => void) =>
			host === "rebind.test"
				? callback(null, [{ address: "127.0.0.1", family: 4 }])
				: real.lookup(host, options as never, callback as never)) as typeof real.lookup,
	};
});

const { isPublicUrl, publicRequest, exportFetch } = await import("@astlide/core/utils/network.ts");

let server: Server;
let port = 0;
const hits: string[] = [];
beforeAll(async () => {
	server = createServer((req, res) => {
		hits.push(req.url ?? "");
		res.end("internal");
	});
	await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
	port = (server.address() as AddressInfo).port;
});
afterAll(() => server.close());

describe("public-only requests", () => {
	it("check the address they connect to, not an earlier answer", async () => {
		const url = `http://rebind.test:${port}/secret`;
		// A check made separately passes…
		expect(await isPublicUrl(url)).toBe(true);
		// …but the connection itself refuses the private answer.
		await expect(publicRequest(url)).rejects.toThrow(/not public/);
		await expect(exportFetch(url, { limit: 100, source: "remote" })).rejects.toThrow(/not public/);
		expect(hits).toEqual([]);
	});

	it("refuse literal private addresses", async () => {
		await expect(publicRequest(`http://127.0.0.1:${port}/`)).rejects.toThrow(/not public/);
		await expect(publicRequest(`http://[::1]:${port}/`)).rejects.toThrow(/not public/);
		expect(hits).toEqual([]);
	});
});
