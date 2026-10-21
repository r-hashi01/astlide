/**
 * Run with Bun (CI): the connect-time address check in `publicRequest` relies
 * on `node:http` honouring the `lookup` option, which the exporter uses
 * under Bun. Names resolving to loopback must be refused without the local
 * server seeing a request. Exits non-zero otherwise.
 */

import { createServer } from "node:http";
import { publicRequest } from "../../src/utils/network";

const hits: string[] = [];
const server = createServer((req, res) => {
	hits.push(req.url ?? "");
	res.end("internal");
}).listen(0, "127.0.0.1");
await new Promise((ready) => server.once("listening", ready));
const { port } = server.address() as { port: number };

let failed = false;
for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
	const outcome = await publicRequest(`http://${host}:${port}/`).then(
		(res) => `reached (${res.status})`,
		(err: Error) => err.message,
	);
	const ok = outcome.startsWith("refused");
	failed ||= !ok;
	console.log(`${ok ? "ok  " : "FAIL"} ${host}: ${outcome}`);
}
server.close();
if (hits.length) console.log(`FAIL the local server got ${hits.length} request(s)`);
process.exit(failed || hits.length ? 1 : 0);
