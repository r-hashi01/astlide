/**
 * Read the files of a ZIP archive (an OOXML package) — stored and deflated
 * entries, via Node's zlib. No dependency.
 *
 * @module
 */

import { inflateRawSync } from "node:zlib";

/** Every file in the archive by path (directories left out). */
export function readZip(data: Uint8Array): Map<string, Buffer> {
	const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
	// End of central directory: the last record with its signature (a comment may follow it).
	let eocd = -1;
	for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
		if (buf.readUInt32LE(i) === 0x06054b50) {
			eocd = i;
			break;
		}
	}
	if (eocd < 0) throw new Error("not a ZIP file (no end of central directory)");
	const count = buf.readUInt16LE(eocd + 10);
	let at = buf.readUInt32LE(eocd + 16);
	const files = new Map<string, Buffer>();
	for (let n = 0; n < count; n++) {
		if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error("corrupt ZIP central directory");
		const method = buf.readUInt16LE(at + 10);
		const size = buf.readUInt32LE(at + 20);
		const nameLength = buf.readUInt16LE(at + 28);
		const extraLength = buf.readUInt16LE(at + 30);
		const commentLength = buf.readUInt16LE(at + 32);
		const local = buf.readUInt32LE(at + 42);
		const name = buf.toString("utf-8", at + 46, at + 46 + nameLength);
		at += 46 + nameLength + extraLength + commentLength;
		if (name.endsWith("/")) continue;
		// The local header repeats name / extra with its own lengths.
		const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
		const raw = buf.subarray(start, start + size);
		if (method === 0) files.set(name, Buffer.from(raw));
		else if (method === 8) files.set(name, inflateRawSync(raw));
		else throw new Error(`unsupported ZIP compression ${method} (${name})`);
	}
	return files;
}
