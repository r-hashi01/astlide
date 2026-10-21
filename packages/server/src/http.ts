/**
 * Serve a fetch handler with `node:http` (runs on Node and Bun alike).
 *
 * @module
 */

import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { Readable } from "node:stream";

export interface RunningServer {
	url: string;
	close(): Promise<void>;
}

function toRequest(req: IncomingMessage): Request {
	const url = `http://${req.headers.host ?? "localhost"}${req.url ?? "/"}`;
	const headers = new Headers();
	for (const [key, value] of Object.entries(req.headers)) {
		if (Array.isArray(value)) for (const v of value) headers.append(key, v);
		else if (value !== undefined) headers.set(key, value);
	}
	const hasBody = req.method !== "GET" && req.method !== "HEAD";
	return new Request(url, {
		method: req.method,
		headers,
		body: hasBody ? (Readable.toWeb(req) as ReadableStream<Uint8Array>) : undefined,
		// Streaming request bodies need half-duplex.
		...(hasBody ? { duplex: "half" } : {}),
	} as RequestInit);
}

export function serve(
	handler: (req: Request) => Promise<Response>,
	options: {
		port: number;
		hostname?: string;
		/** Time a client has to send its whole request — headers and body (ms). */
		requestTimeoutMs?: number;
	},
): Promise<RunningServer> {
	const server = createServer(async (req, res) => {
		try {
			const response = await handler(toRequest(req));
			const body = req.method === "HEAD" ? undefined : Buffer.from(await response.arrayBuffer());
			res.writeHead(response.status, Object.fromEntries(response.headers));
			res.end(body);
		} catch (e) {
			console.error(e);
			if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
			res.end('{"error":"internal error"}');
		}
	});
	// Only receiving the request is timed (a slow sender can't hold a body
	// buffer forever); the response — a render — can take minutes.
	server.requestTimeout = options.requestTimeoutMs ?? 60_000;
	server.headersTimeout = Math.min(server.requestTimeout, 30_000);
	return new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(options.port, options.hostname, () => {
			const { port } = server.address() as AddressInfo;
			const host =
				options.hostname && options.hostname !== "0.0.0.0" ? options.hostname : "localhost";
			resolve({
				url: `http://${host.includes(":") ? `[${host}]` : host}:${port}`,
				close: () =>
					new Promise<void>((done) => {
						server.close(() => done());
						server.closeAllConnections();
					}),
			});
		});
	});
}
