/**
 * TrueType / OpenType → Embedded OpenType (EOT), the container PowerPoint
 * stores embedded fonts in (`ppt/fonts/*.fntdata`). Version 0x00020001,
 * uncompressed and unobfuscated: a header copied from the font's OS/2, head
 * and name tables, followed by the font file unchanged.
 *
 * @module
 */

interface Tables {
	[tag: string]: { offset: number; length: number } | undefined;
}

function tables(font: Buffer): Tables {
	const out: Tables = {};
	const count = font.readUInt16BE(4);
	for (let i = 0; i < count; i++) {
		const rec = 12 + i * 16;
		out[font.toString("latin1", rec, rec + 4)] = {
			offset: font.readUInt32BE(rec + 8),
			length: font.readUInt32BE(rec + 12),
		};
	}
	return out;
}

/** A Windows (platform 3, Unicode BMP) name record, as UTF-16LE bytes. */
function nameUtf16le(font: Buffer, name: { offset: number }, id: number): Buffer {
	const base = name.offset;
	const count = font.readUInt16BE(base + 2);
	const strings = base + font.readUInt16BE(base + 4);
	let fallback: Buffer | null = null;
	for (let i = 0; i < count; i++) {
		const rec = base + 6 + i * 12;
		if (font.readUInt16BE(rec) !== 3 || font.readUInt16BE(rec + 2) !== 1) continue;
		if (font.readUInt16BE(rec + 6) !== id) continue;
		const start = strings + font.readUInt16BE(rec + 10);
		const bytes = Buffer.from(font.subarray(start, start + font.readUInt16BE(rec + 8)));
		bytes.swap16(); // UTF-16BE → LE
		if (font.readUInt16BE(rec + 4) === 0x409) return bytes;
		fallback ??= bytes;
	}
	return fallback ?? Buffer.alloc(0);
}

/** The font's `fsType` embedding permissions (OS/2). */
export function embeddingPermissions(font: Buffer): number {
	const os2 = tables(font)["OS/2"];
	return os2 ? font.readUInt16BE(os2.offset + 8) : 0;
}

/** Wrap a TrueType / OpenType font file as EOT. */
export function toEot(font: Buffer): Buffer {
	const t = tables(font);
	const os2 = t["OS/2"];
	const head = t.head;
	const name = t.name;
	if (!os2 || !head || !name)
		throw new Error("not a TrueType / OpenType font (OS/2, head or name missing)");
	const o = os2.offset;
	const version = font.readUInt16BE(o);

	const fixed = Buffer.alloc(82);
	let p = 16; // EOTSize, FontDataSize, Version, Flags are filled in below
	font.copy(fixed, p, o + 32, o + 42); // FontPANOSE
	p += 10;
	fixed.writeUInt8(1, p++); // Charset: DEFAULT_CHARSET
	fixed.writeUInt8(font.readUInt16BE(o + 62) & 1, p++); // Italic (fsSelection bit 0)
	fixed.writeUInt32LE(font.readUInt16BE(o + 4), p); // Weight
	p += 4;
	fixed.writeUInt16LE(font.readUInt16BE(o + 8), p); // fsType
	p += 2;
	fixed.writeUInt16LE(0x504c, p); // MagicNumber
	p += 2;
	for (let i = 0; i < 4; i++, p += 4) fixed.writeUInt32LE(font.readUInt32BE(o + 42 + i * 4), p);
	for (let i = 0; i < 2; i++, p += 4)
		fixed.writeUInt32LE(version >= 1 ? font.readUInt32BE(o + 78 + i * 4) : 0, p);
	fixed.writeUInt32LE(font.readUInt32BE(head.offset + 8), p); // CheckSumAdjustment
	// Reserved1–4 and Padding1 stay zero.

	const field = (bytes: Buffer) => {
		const size = Buffer.alloc(2);
		size.writeUInt16LE(bytes.length);
		return [size, bytes];
	};
	const pad = Buffer.alloc(2);
	const names = Buffer.concat([
		...field(nameUtf16le(font, name, 1)), // FamilyName
		pad,
		...field(nameUtf16le(font, name, 2)), // StyleName
		pad,
		...field(nameUtf16le(font, name, 5)), // VersionName
		pad,
		...field(nameUtf16le(font, name, 4)), // FullName
		pad,
		...field(Buffer.alloc(0)), // RootString: usable from any document
	]);

	const total = fixed.length + names.length + font.length;
	fixed.writeUInt32LE(total, 0); // EOTSize
	fixed.writeUInt32LE(font.length, 4); // FontDataSize
	fixed.writeUInt32LE(0x00020001, 8); // Version
	fixed.writeUInt32LE(0, 12); // Flags: no compression, no XOR
	return Buffer.concat([fixed, names, font]);
}

/** Name IDs of the typographic family / subfamily (and WWS variants). */
const TYPOGRAPHIC_NAMES = new Set([16, 17, 21, 22]);

/**
 * Drop the typographic family names (IDs 16/17, 21/22) so the font's family
 * is its legacy name (ID 1) everywhere. A static weight such as Inter
 * SemiBold is family "Inter SemiBold" (ID 1) but typographic family "Inter"
 * (ID 16): renderers that go by ID 16 would not find the typeface the runs
 * name, and fall back to another face.
 */
export function withLegacyFamilyOnly(font: Buffer): Buffer {
	const name = tables(font).name;
	if (!name) return font;
	const base = name.offset;
	const count = font.readUInt16BE(base + 2);
	const storage = font.readUInt16BE(base + 4);
	const keep: Buffer[] = [];
	for (let i = 0; i < count; i++) {
		const rec = base + 6 + i * 12;
		if (!TYPOGRAPHIC_NAMES.has(font.readUInt16BE(rec + 6))) keep.push(font.subarray(rec, rec + 12));
	}
	if (keep.length === count) return font;
	// Same string storage, fewer records: the new table is shorter and fits in place.
	const header = Buffer.alloc(6);
	header.writeUInt16BE(0, 0);
	header.writeUInt16BE(keep.length, 2);
	header.writeUInt16BE(6 + keep.length * 12, 4);
	const table = Buffer.concat([header, ...keep, font.subarray(base + storage, base + name.length)]);
	const out = Buffer.from(font);
	out.fill(0, base, base + name.length);
	table.copy(out, base);
	// Table directory: new length and checksum.
	const tableCount = out.readUInt16BE(4);
	for (let i = 0; i < tableCount; i++) {
		const rec = 12 + i * 16;
		if (out.toString("latin1", rec, rec + 4) !== "name") continue;
		out.writeUInt32BE(tableChecksum(out, base, table.length), rec + 4);
		out.writeUInt32BE(table.length, rec + 12);
	}
	return out;
}

function tableChecksum(font: Buffer, offset: number, length: number): number {
	let sum = 0;
	for (let i = 0; i < length; i += 4) {
		const word =
			((font[offset + i] ?? 0) << 24) |
			((font[offset + i + 1] ?? 0) << 16) |
			((font[offset + i + 2] ?? 0) << 8) |
			(font[offset + i + 3] ?? 0);
		sum = (sum + (word >>> 0)) >>> 0;
	}
	return sum;
}
