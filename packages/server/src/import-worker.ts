/**
 * Child process for `POST /import` and `POST /templates/layouts`: reads a
 * PowerPoint file on stdin, writes the JSON answer on stdout. Parsing an
 * uploaded file runs here rather than in the server process, so a file that
 * takes long or much memory only costs this process (see `parsePptx`).
 *
 * Usage: `bun import-worker.ts deck|layouts`. Exit code 2 with
 * `{ "error": … }` for a file that isn't readable (HTTP 400).
 *
 * @module
 */

import { BadRequest } from "./deck";
import { importDeck, templateLayouts } from "./importer";

const mode = process.argv[2];
const chunks: Buffer[] = [];
for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
const data = new Uint8Array(Buffer.concat(chunks));
try {
	const result = mode === "layouts" ? templateLayouts(data) : importDeck(data);
	process.stdout.write(JSON.stringify(result));
} catch (e) {
	process.stdout.write(JSON.stringify({ error: (e as Error).message }));
	process.exitCode = e instanceof BadRequest ? 2 : 1;
}
