/**
 * Outbound requests made while exporting (remote images, embedded pages,
 * and — in PDF / PNG — everything the slides load in Chromium).
 *
 * With `ASTLIDE_PUBLIC_NETWORK_ONLY=1` (set by the HTTP render service for
 * every render) they may only reach public addresses: no loopback, private,
 * link-local / cloud-metadata, or other reserved ranges, checked for every
 * address a host name resolves to and on every redirect. Without it, exports
 * may use internal hosts (an intranet image in your own deck). Response
 * sizes are always bounded.
 *
 * @module
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

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
	const [g0 = 0, g1 = 0, , , , g5 = 0, g6 = 0, g7 = 0] = g;
	const embedded = `${g6 >> 8}.${g6 & 0xff}.${g7 >> 8}.${g7 & 0xff}`;
	if (g.slice(0, 7).every((x) => x === 0)) return false; // :: and ::1
	if (g.slice(0, 5).every((x) => x === 0) && g5 === 0xffff) return v4Public(embedded); // ::ffff:a.b.c.d
	if (g0 === 0x64 && g1 === 0xff9b) return v4Public(embedded); // NAT64
	if ((g0 & 0xfe00) === 0xfc00) return false; // unique local fc00::/7
	if ((g0 & 0xffc0) === 0xfe80) return false; // link-local fe80::/10
	if ((g0 & 0xff00) === 0xff00) return false; // multicast
	if (g0 === 0x2001 && g1 === 0x0db8) return false; // documentation
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
		if (mustBePublic && !(await isPublicUrl(current)))
			throw new Error(`refused: ${current} is not public`);
		const res = await fetch(current, { redirect: "manual", signal, headers: options.headers });
		const location = res.headers.get("location");
		if (res.status >= 300 && res.status < 400 && location) {
			await res.body?.cancel();
			// A public server chooses where its redirect goes: keep it off the private network.
			if (!mustBePublic && (await isPublicUrl(current))) mustBePublic = true;
			current = new URL(location, current).href;
			continue;
		}
		const declared = Number(res.headers.get("content-length") ?? 0);
		if (declared > options.limit) {
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
			if (size > options.limit) {
				await reader.cancel();
				throw new Error(`response too large (over ${options.limit} bytes)`);
			}
			chunks.push(value);
		}
		return {
			ok: res.ok,
			status: res.status,
			url: current,
			headers: res.headers,
			body: Buffer.concat(chunks),
		};
	}
	throw new Error("too many redirects");
}
