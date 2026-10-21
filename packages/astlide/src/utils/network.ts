/**
 * Outbound requests made while exporting (remote images, embedded pages,
 * and — in PDF / PNG — everything the slides load in Chromium).
 *
 * With `ASTLIDE_PUBLIC_NETWORK_ONLY=1` (set by the HTTP render service for
 * every render) they may only reach public addresses: no loopback, private,
 * link-local / cloud-metadata, or other reserved ranges, checked for every
 * address a host name resolves to and on every redirect. The check happens
 * when connecting ({@link publicRequest}): the connection goes to the address
 * that was checked, so a host can't pass with one DNS answer and connect
 * with another. Without it, exports may use internal hosts (an intranet
 * image in your own deck). Response sizes are always bounded.
 *
 * @module
 */

import { lookup as lookupCallback } from "node:dns";
import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { Readable } from "node:stream";

/** Whether exports may only reach public addresses (`ASTLIDE_PUBLIC_NETWORK_ONLY=1`). */
export function publicNetworkOnly(env: Record<string, string | undefined> = process.env): boolean {
	return env.ASTLIDE_PUBLIC_NETWORK_ONLY === "1";
}

const V4_BLOCKED: [number, number][] = [
	["0.0.0.0", 8],
	["10.0.0.0", 8],
	["100.64.0.0", 10],
	["127.0.0.0", 8],
	["169.254.0.0", 16],
	["172.16.0.0", 12],
	["192.0.0.0", 24],
	["192.0.2.0", 24],
	["192.88.99.0", 24],
	["192.168.0.0", 16],
	["198.18.0.0", 15],
	["198.51.100.0", 24],
	["203.0.113.0", 24],
	["224.0.0.0", 4],
	["240.0.0.0", 4],
].map(([base, bits]) => [v4(base as string), bits as number]);

function v4(ip: string): number {
	return ip.split(".").reduce((n, part) => n * 256 + Number(part), 0);
}

function v4Public(ip: string): boolean {
	const n = v4(ip);
	return !V4_BLOCKED.some(([base, bits]) => {
		const size = 2 ** (32 - bits);
		return n >= base && n < base + size;
	});
}

/** The 8 groups of an IPv6 address (with an embedded IPv4 tail expanded). */
function v6Groups(ip: string): number[] | null {
	let s = ip.toLowerCase().split("%")[0] ?? "";
	const tail = s.match(/(\d+\.\d+\.\d+\.\d+)$/)?.[1];
	if (tail) {
		const n = v4(tail);
		s = `${s.slice(0, -tail.length)}${((n >>> 16) & 0xffff).toString(16)}:${(n & 0xffff).toString(16)}`;
	}
	const [head = "", rest] = s.split("::");
	const a = head ? head.split(":") : [];
	const b = rest !== undefined && rest !== "" ? rest.split(":") : [];
	const fill = rest === undefined ? 0 : 8 - a.length - b.length;
	const groups = [...a, ...Array(Math.max(0, fill)).fill("0"), ...b].map((g) =>
		Number.parseInt(g, 16),
	);
	return groups.length === 8 && groups.every((g) => g >= 0 && g <= 0xffff) ? groups : null;
}

/** Whether an IP address is on the public internet (not loopback, private, link-local, reserved …). */
export function isPublicAddress(ip: string): boolean {
	const family = isIP(ip);
	if (family === 4) return v4Public(ip);
	if (family !== 6) return false;
	const g = v6Groups(ip);
	if (!g) return false;
	const [g0 = 0, g1 = 0, g2 = 0, , g4 = 0, g5 = 0, g6 = 0, g7 = 0] = g;
	const quad = (hi: number, lo: number) => `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
	const embedded = quad(g6, g7);
	if (g.slice(0, 7).every((x) => x === 0)) return false; // :: and ::1
	if (g.slice(0, 5).every((x) => x === 0) && g5 === 0xffff) return v4Public(embedded); // ::ffff:a.b.c.d
	if (g.slice(0, 6).every((x) => x === 0)) return v4Public(embedded); // ::a.b.c.d (IPv4-compatible)
	if (g.slice(0, 4).every((x) => x === 0) && g4 === 0xffff && g5 === 0) return v4Public(embedded); // ::ffff:0:a.b.c.d
	// NAT64: the well-known 64:ff9b::/96 carries an IPv4 address; the rest of 64:ff9b::/32 (local-use) is refused.
	if (g0 === 0x64 && g1 === 0xff9b)
		return g.slice(2, 6).every((x) => x === 0) && v4Public(embedded);
	if (g0 === 0x2002) return v4Public(quad(g1, g2)); // 6to4 carries an IPv4 address
	if (g0 === 0x2001 && g1 === 0) return false; // Teredo
	if (g0 === 0x0100 && g.slice(1, 4).every((x) => x === 0)) return false; // discard-only 100::/64
	if ((g0 & 0xfe00) === 0xfc00) return false; // unique local fc00::/7
	if ((g0 & 0xffc0) === 0xfe80) return false; // link-local fe80::/10
	if ((g0 & 0xffc0) === 0xfec0) return false; // site-local fec0::/10 (deprecated)
	if ((g0 & 0xff00) === 0xff00) return false; // multicast
	if (g0 === 0x2001 && g1 === 0x0db8) return false; // documentation
	if ((g0 & 0xfff0) === 0x3ff0) return false; // documentation 3fff::/20
	return true;
}

/** Whether a URL is http(s) to a host whose every address is public. */
export async function isPublicUrl(url: string): Promise<boolean> {
	let u: URL;
	try {
		u = new URL(url);
	} catch {
		return false;
	}
	if (u.protocol !== "http:" && u.protocol !== "https:") return false;
	const host = u.hostname.replace(/^\[|\]$/g, "");
	if (isIP(host)) return isPublicAddress(host);
	try {
		const addresses = await lookup(host, { all: true, verbatim: true });
		return addresses.length > 0 && addresses.every((a) => isPublicAddress(a.address));
	} catch {
		return false;
	}
}

/** A DNS lookup for sockets that only hands out public addresses: every address the name has must be public. */
const publicLookup: LookupFunction = (hostname, options, callback) => {
	lookupCallback(hostname, { all: true, verbatim: true }, (err, addresses) => {
		if (err) return callback(err, "", 0);
		if (!addresses.length || !addresses.every((a) => isPublicAddress(a.address)))
			return callback(
				Object.assign(new Error(`refused: ${hostname} is not public`), { code: "EREFUSED" }),
				"",
				0,
			);
		if (options.all) return (callback as (e: null, a: typeof addresses) => void)(null, addresses);
		const first =
			addresses.find((a) => !options.family || a.family === options.family) ?? addresses[0];
		callback(null, first?.address ?? "", first?.family ?? 4);
	});
};

/** Statuses whose responses have no body. */
const NO_BODY = new Set([101, 103, 204, 205, 304]);

/**
 * One HTTP(S) request (no redirects followed) that may only reach public
 * addresses — checked as the socket connects, so the connection goes to the
 * address that was checked (no window for a host to change its DNS answer
 * in between). Asks for an uncompressed body.
 */
export async function publicRequest(
	url: string,
	init: {
		method?: string;
		headers?: Record<string, string>;
		body?: Buffer;
		signal?: AbortSignal;
	} = {},
): Promise<Response> {
	const u = new URL(url);
	if (u.protocol !== "http:" && u.protocol !== "https:")
		throw new Error(`refused: ${u.protocol} URL`);
	const host = u.hostname.replace(/^\[|\]$/g, "");
	// Literal addresses aren't looked up: check them here.
	if (isIP(host) && !isPublicAddress(host)) throw new Error(`refused: ${host} is not public`);
	const send = u.protocol === "https:" ? httpsRequest : httpRequest;
	const res = await new Promise<IncomingMessage>((resolve, reject) => {
		const req = send(
			u,
			{
				method: init.method ?? "GET",
				headers: { ...init.headers, "accept-encoding": "identity" },
				lookup: publicLookup,
				signal: init.signal,
			},
			resolve,
		);
		req.on("error", reject);
		req.end(init.body);
	});
	const headers = new Headers();
	for (const [name, value] of Object.entries(res.headers)) {
		if (value === undefined) continue;
		for (const v of Array.isArray(value) ? value : [value]) headers.append(name, v);
	}
	const status = res.statusCode ?? 502;
	if (NO_BODY.has(status)) {
		res.resume();
		return new Response(null, { status, headers });
	}
	return new Response(Readable.toWeb(res) as ReadableStream, { status, headers });
}

/** A response's body, refused past `limit` bytes (declared or actual). */
export async function readBody(res: Response, limit: number): Promise<Buffer> {
	const declared = Number(res.headers.get("content-length") ?? 0);
	if (declared > limit) {
		await res.body?.cancel();
		throw new Error(`response too large (${declared} bytes)`);
	}
	const chunks: Uint8Array[] = [];
	let size = 0;
	const reader = res.body?.getReader();
	while (reader) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > limit) {
			await reader.cancel();
			throw new Error(`response too large (over ${limit} bytes)`);
		}
		chunks.push(value);
	}
	return Buffer.concat(chunks);
}

export interface FetchedBody {
	ok: boolean;
	status: number;
	/** The final URL, after redirects. */
	url: string;
	headers: Headers;
	body: Buffer;
}

export interface ExportFetchOptions {
	/** Largest body read, in bytes. */
	limit: number;
	/** For the whole request, body included (default 10 s). */
	timeoutMs?: number;
	headers?: Record<string, string>;
	/**
	 * Who chose the URL: the deck's author (`"deck"`, the default) or a remote
	 * response (`"remote"`: an oEmbed endpoint a page advertises, a thumbnail
	 * or `og:image` URL). Remote-chosen URLs must always be public.
	 */
	source?: "deck" | "remote";
}

/**
 * GET a URL for an export: at most `limit` bytes of body, redirects followed
 * by hand (at most 5) so each hop is checked. Every hop must go to a public
 * address when public-network-only is on or the URL came from a remote
 * response (`source: "remote"`); otherwise a deck's own URL may be internal
 * (an intranet image), but once a hop is public, the server it redirects to
 * must be public as well. Throws on a refused or oversized response.
 */
export async function exportFetch(url: string, options: ExportFetchOptions): Promise<FetchedBody> {
	let mustBePublic = publicNetworkOnly() || options.source === "remote";
	const signal = AbortSignal.timeout(options.timeoutMs ?? 10_000);
	let current = url;
	for (let hop = 0; hop <= 5; hop++) {
		const scheme = new URL(current).protocol;
		if (scheme !== "http:" && scheme !== "https:") throw new Error(`refused: ${scheme} URL`);
		const res = mustBePublic
			? await publicRequest(current, { signal, headers: options.headers })
			: await fetch(current, { redirect: "manual", signal, headers: options.headers });
		const location = res.headers.get("location");
		if (res.status >= 300 && res.status < 400 && location) {
			await res.body?.cancel();
			// A public server chooses where its redirect goes: keep it off the private network.
			if (!mustBePublic && (await isPublicUrl(current))) mustBePublic = true;
			current = new URL(location, current).href;
			continue;
		}
		return {
			ok: res.ok,
			status: res.status,
			url: current,
			headers: res.headers,
			body: await readBody(res, options.limit),
		};
	}
	throw new Error("too many redirects");
}
