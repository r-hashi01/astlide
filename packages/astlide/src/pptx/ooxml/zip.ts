/**
 * Read the files of a ZIP archive (an OOXML package) — stored and deflated
 * entries, via Node's zlib. No dependency.
 *
 * Archives come from other people (a .pptx someone sent), so reading is
 * bounded: entries are inflated only when asked for, each to at most the
 * size the archive declares for it (and {@link ZIP_LIMITS}), with a budget
 * for the whole archive — a small crafted file can't make it allocate
 * gigabytes.
 *
 * @module
 */

import { inflateRawSync } from "node:zlib";

/** Bounds on what reading an archive may cost. */
export const ZIP_LIMITS = {
	/** Entries in the central directory. */
	entries: 20_000,
	/** Uncompressed size of one entry, in bytes. */
	entryBytes: 256 * 1024 * 1024,
	/** Uncompressed bytes inflated from one archive, all entries together. */
	totalBytes: 1024 * 1024 * 1024,
};

interface Entry {
	method: number;
	start: number;
	compressed: number;
	size: number;
}

/** The files of an archive by path; read with `get` (inflated on first use, then kept). */
export class ZipFiles {
	private readonly cache = new Map<string, Buffer>();
	private inflated = 0;

	constructor(
		private readonly buf: Buffer,
		private readonly entries: Map<string, Entry>,
	) {}

	has(name: string): boolean {
		return this.entries.has(name);
	}

	keys(): IterableIterator<string> {
		return this.entries.keys();
	}

	get size(): number {
		return this.entries.size;
	}

	/** An entry's bytes, or undefined when there is none. Throws when it breaks the limits. */
	get(name: string): Buffer | undefined {
		const hit = this.cache.get(name);
		if (hit) return hit;
		const e = this.entries.get(name);
		if (!e) return undefined;
		if (e.size > ZIP_LIMITS.entryBytes)
			throw new Error(`ZIP entry ${name} is too large (${e.size} bytes)`);
		if (this.inflated + e.size > ZIP_LIMITS.totalBytes)
			throw new Error("ZIP archive expands beyond the size limit");
		const raw = this.buf.subarray(e.start, e.start + e.compressed);
		let data: Buffer;
		if (e.method === 0) data = Buffer.from(raw);
		else if (e.method === 8)
			// One byte more than declared: a stream that doesn't stop there is caught below.
			data = inflateRawSync(raw, { maxOutputLength: e.size + 1 });
		else throw new Error(`unsupported ZIP compression ${e.method} (${name})`);
		if (data.length !== e.size) throw new Error(`corrupt ZIP entry ${name} (size mismatch)`);
		this.inflated += data.length;
		this.cache.set(name, data);
		return data;
	}
}

/** Every file in the archive by path (directories left out), read lazily. */
export function readZip(data: Uint8Array): ZipFiles {
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
	if (count > ZIP_LIMITS.entries) throw new Error(`ZIP archive has too many entries (${count})`);
	let at = buf.readUInt32LE(eocd + 16);
	const entries = new Map<string, Entry>();
	const offsets = new Set<number>();
	for (let n = 0; n < count; n++) {
		if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error("corrupt ZIP central directory");
		const method = buf.readUInt16LE(at + 10);
		const compressed = buf.readUInt32LE(at + 20);
		const size = buf.readUInt32LE(at + 24);
		const nameLength = buf.readUInt16LE(at + 28);
		const extraLength = buf.readUInt16LE(at + 30);
		const commentLength = buf.readUInt16LE(at + 32);
		const local = buf.readUInt32LE(at + 42);
		const name = buf.toString("utf-8", at + 46, at + 46 + nameLength);
		at += 46 + nameLength + extraLength + commentLength;
		if (name.endsWith("/")) continue;
		// Entries sharing data are how small archives claim huge contents.
		if (offsets.has(local)) throw new Error("corrupt ZIP archive (entries share data)");
		offsets.add(local);
		if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50)
			throw new Error(`corrupt ZIP entry ${name}`);
		// The local header repeats name / extra with its own lengths.
		const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
		if (start + compressed > buf.length) throw new Error(`corrupt ZIP entry ${name}`);
		entries.set(name, { method, start, compressed, size });
	}
	return new ZipFiles(buf, entries);
}
