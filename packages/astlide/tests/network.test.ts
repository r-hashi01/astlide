import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { exportFetch, isPublicAddress, isPublicUrl } from "@astlide/core/utils/network.ts";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

describe("isPublicAddress", () => {
	it.each([
		"0.0.0.0",
		"10.1.2.3",
		"100.64.0.1",
		"127.0.0.1",
		"169.254.169.254",
		"172.16.0.1",
		"172.31.255.255",
		"192.168.1.1",
		"198.18.0.1",
		"224.0.0.1",
		"255.255.255.255",
		"::",
		"::1",
		"fc00::1",
		"fd12:3456::1",
		"fe80::1",
		"ff02::1",
		"::ffff:127.0.0.1",
		"::ffff:a9fe:a9fe",
		"64:ff9b::a9fe:a9fe",
		"2001:db8::1",
		"not an ip",
	])("refuses %s", (ip) => expect(isPublicAddress(ip)).toBe(false));

	it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])(
		"allows %s",
		(ip) => expect(isPublicAddress(ip)).toBe(true),
	);
});

describe("isPublicUrl", () => {
	it("checks literal hosts and the addresses a name resolves to", async () => {
		expect(await isPublicUrl("http://8.8.8.8/x")).toBe(true);
		expect(await isPublicUrl("http://[::1]:8080/")).toBe(false);
		expect(await isPublicUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
		expect(await isPublicUrl("http://localhost:4321/")).toBe(false);
		expect(await isPublicUrl("file:///etc/passwd")).toBe(false);
		expect(await isPublicUrl("not a url")).toBe(false);
	});
});

describe("exportFetch", () => {
	let server: Server;
	let base: string;
	beforeAll(async () => {
		server = createServer((req, res) => {
			if (req.url === "/big") return res.end(Buffer.alloc(4096));
			if (req.url === "/hop") {
				res.writeHead(302, { location: "/ok" });
				return res.end();
			}
			if (req.url === "/loop") {
				res.writeHead(302, { location: "/loop" });
				return res.end();
			}
			res.end("ok");
		});
		await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
		base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});
	afterAll(() => server.close());
	afterEach(() => vi.unstubAllEnvs());

	it("follows redirects and caps the body", async () => {
		const res = await exportFetch(`${base}/hop`, { limit: 100 });
		expect(res.body.toString()).toBe("ok");
		expect(res.url).toBe(`${base}/ok`);
		await expect(exportFetch(`${base}/big`, { limit: 100 })).rejects.toThrow(/too large/);
		await expect(exportFetch(`${base}/loop`, { limit: 100 })).rejects.toThrow(/redirects/);
		await expect(exportFetch("file:///etc/passwd", { limit: 100 })).rejects.toThrow(/refused/);
	});

	it("refuses the private network with ASTLIDE_PUBLIC_NETWORK_ONLY=1", async () => {
		vi.stubEnv("ASTLIDE_PUBLIC_NETWORK_ONLY", "1");
		await expect(exportFetch(`${base}/ok`, { limit: 100 })).rejects.toThrow(/not public/);
	});
});
