/**
 * A minimal ZIP writer (deflate, no ZIP64), with fixed entry times for
 * reproducible files: the .pptx export's, and `@astlide/core/utils/zip` for
 * other archives (the server's PNG bundles).
 *
 * @module
 */

import { deflateRawSync } from "node:zlib";

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
	let c = n;
	for (let k = 0; k < 8; k++) {
		c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	}
	CRC_TABLE[n] = c;
}

/** @internal */
export function crc32(buf: Buffer): number {
	let crc = 0xffffffff;
	for (let i = 0; i < buf.length; i++) {
		crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

// Minimal ZIP writer (deflate, no ZIP64)

interface ZipEntry {
	path: string;
	raw: Buffer;
	compressed: Buffer;
	crc: number;
	localHeaderOffset: number;
}

/** @internal */
/**
 * General purpose flags: bit 11 = UTF-8 names. Not bit 3 ("sizes and CRC
 * follow in a data descriptor"): they're known up front and written in the
 * local headers, and PowerPoint rejects (asks to repair) entries that claim a
 * data descriptor they don't have.
 */
const ZIP_FLAGS = 0x0800;

/**
 * MS-DOS time / date for entry headers; month and day are 1-based (0 is
 * invalid). In UTC, so the same date gives the same file in every time zone.
 */
export function dosDateTime(date: Date): { time: number; date: number } {
	const year = Math.max(date.getUTCFullYear(), 1980);
	return {
		time:
			(date.getUTCHours() << 11) |
			(date.getUTCMinutes() << 5) |
			Math.floor(date.getUTCSeconds() / 2),
		date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
	};
}

/**
 * When the file is made: `SOURCE_DATE_EPOCH` (seconds) when set, as for
 * reproducible builds, else now. The same slides and date give the same file.
 */
export function buildDate(): Date {
	const epoch = Number(process.env.SOURCE_DATE_EPOCH);
	return process.env.SOURCE_DATE_EPOCH && Number.isFinite(epoch)
		? new Date(epoch * 1000)
		: new Date();
}

export class ZipWriter {
	private entries: ZipEntry[] = [];
	private offset = 0;
	private readonly stamp: { time: number; date: number };

	constructor(date: Date = buildDate()) {
		this.stamp = dosDateTime(date);
	}

	add(path: string, data: string | Buffer): void {
		const raw = typeof data === "string" ? Buffer.from(data, "utf-8") : data;
		const compressed = deflateRawSync(raw, { level: 6 });
		const crc = crc32(raw);
		this.entries.push({
			path,
			raw,
			compressed,
			crc,
			localHeaderOffset: this.offset,
		});
		this.offset += 30 + Buffer.byteLength(path, "utf-8") + compressed.length;
	}

	toBuffer(): Buffer {
		const parts: Buffer[] = [];

		// Local file headers + compressed data
		for (const e of this.entries) {
			const pathBuf = Buffer.from(e.path, "utf-8");
			const header = Buffer.alloc(30);
			header.writeUInt32LE(0x04034b50, 0);
			header.writeUInt16LE(20, 4);
			header.writeUInt16LE(ZIP_FLAGS, 6);
			header.writeUInt16LE(8, 8);
			header.writeUInt16LE(this.stamp.time, 10);
			header.writeUInt16LE(this.stamp.date, 12);
			header.writeUInt32LE(e.crc, 14);
			header.writeUInt32LE(e.compressed.length, 18);
			header.writeUInt32LE(e.raw.length, 22);
			header.writeUInt16LE(pathBuf.length, 26);
			header.writeUInt16LE(0, 28);
			parts.push(header, pathBuf, e.compressed);
		}

		// Central directory
		const cdOffset = this.offset;
		let cdSize = 0;

		for (const e of this.entries) {
			const pathBuf = Buffer.from(e.path, "utf-8");
			const cd = Buffer.alloc(46);
			cd.writeUInt32LE(0x02014b50, 0);
			cd.writeUInt16LE(20, 4);
			cd.writeUInt16LE(20, 6);
			cd.writeUInt16LE(ZIP_FLAGS, 8);
			cd.writeUInt16LE(8, 10);
			cd.writeUInt16LE(this.stamp.time, 12);
			cd.writeUInt16LE(this.stamp.date, 14);
			cd.writeUInt32LE(e.crc, 16);
			cd.writeUInt32LE(e.compressed.length, 20);
			cd.writeUInt32LE(e.raw.length, 24);
			cd.writeUInt16LE(pathBuf.length, 28);
			cd.writeUInt16LE(0, 30);
			cd.writeUInt16LE(0, 32);
			cd.writeUInt16LE(0, 34);
			cd.writeUInt16LE(0, 36);
			cd.writeUInt32LE(0, 38);
			cd.writeUInt32LE(e.localHeaderOffset, 42);
			parts.push(cd, pathBuf);
			cdSize += 46 + pathBuf.length;
		}

		// End of central directory
		const eocd = Buffer.alloc(22);
		eocd.writeUInt32LE(0x06054b50, 0);
		eocd.writeUInt16LE(0, 4);
		eocd.writeUInt16LE(0, 6);
		eocd.writeUInt16LE(this.entries.length, 8);
		eocd.writeUInt16LE(this.entries.length, 10);
		eocd.writeUInt32LE(cdSize, 12);
		eocd.writeUInt32LE(cdOffset, 16);
		eocd.writeUInt16LE(0, 20);
		parts.push(eocd);

		return Buffer.concat(parts);
	}
}
