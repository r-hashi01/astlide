import { describe, expect, it } from "vitest";
import { embeddingPermissions, toEot, withLegacyFamilyOnly } from "../src/cli/pptx/eot";

/** A minimal sfnt with OS/2, head and name tables (enough for the EOT header). */
function fakeFont(names: Record<number, string>, fsType = 0): Buffer {
	const os2 = Buffer.alloc(86);
	os2.writeUInt16BE(4, 0); // version
	os2.writeUInt16BE(600, 4); // usWeightClass
	os2.writeUInt16BE(fsType, 8);
	os2.fill(7, 32, 42); // panose
	os2.writeUInt32BE(0x11223344, 42); // ulUnicodeRange1
	os2.writeUInt16BE(0x0001, 62); // fsSelection: italic
	os2.writeUInt32BE(0x55667788, 78); // ulCodePageRange1
	const head = Buffer.alloc(54);
	head.writeUInt32BE(0xdeadbeef, 8); // checkSumAdjustment
	const ids = Object.keys(names).map(Number);
	const strings = ids.map((id) => Buffer.from(names[id] ?? "", "utf16le").swap16());
	const name = Buffer.alloc(6 + ids.length * 12);
	name.writeUInt16BE(ids.length, 2);
	name.writeUInt16BE(6 + ids.length * 12, 4);
	let offset = 0;
	ids.forEach((id, i) => {
		const rec = 6 + i * 12;
		name.writeUInt16BE(3, rec);
		name.writeUInt16BE(1, rec + 2);
		name.writeUInt16BE(0x409, rec + 4);
		name.writeUInt16BE(id, rec + 6);
		name.writeUInt16BE(strings[i]?.length ?? 0, rec + 8);
		name.writeUInt16BE(offset, rec + 10);
		offset += strings[i]?.length ?? 0;
	});
	const tables: [string, Buffer][] = [
		["OS/2", os2],
		["head", head],
		["name", Buffer.concat([name, ...strings])],
	];
	const dir = Buffer.alloc(12 + tables.length * 16);
	dir.writeUInt32BE(0x00010000, 0);
	dir.writeUInt16BE(tables.length, 4);
	let at = dir.length;
	const bodies: Buffer[] = [];
	tables.forEach(([tag, data], i) => {
		const rec = 12 + i * 16;
		dir.write(tag, rec, "latin1");
		dir.writeUInt32BE(at, rec + 8);
		dir.writeUInt32BE(data.length, rec + 12);
		const padded = Buffer.alloc(Math.ceil(data.length / 4) * 4);
		data.copy(padded);
		bodies.push(padded);
		at += padded.length;
	});
	return Buffer.concat([dir, ...bodies]);
}

function readName(eot: Buffer, at: number): [string, number] {
	const size = eot.readUInt16LE(at);
	return [eot.toString("utf16le", at + 2, at + 2 + size), at + 2 + size + 2];
}

describe("toEot", () => {
	const font = fakeFont({ 1: "Inter SemiBold", 2: "Regular", 4: "Inter SemiBold", 5: "Version 4" });
	const eot = toEot(font);

	it("writes an uncompressed v2.1 header around the font", () => {
		expect(eot.readUInt32LE(0)).toBe(eot.length);
		expect(eot.readUInt32LE(4)).toBe(font.length);
		expect(eot.readUInt32LE(8)).toBe(0x00020001);
		expect(eot.readUInt32LE(12)).toBe(0);
		expect(eot.subarray(eot.length - font.length).equals(font)).toBe(true);
	});

	it("copies OS/2 and head fields", () => {
		expect([...eot.subarray(16, 26)]).toEqual(Array(10).fill(7));
		expect(eot.readUInt8(26)).toBe(1); // charset
		expect(eot.readUInt8(27)).toBe(1); // italic
		expect(eot.readUInt32LE(28)).toBe(600);
		expect(eot.readUInt16LE(34)).toBe(0x504c);
		expect(eot.readUInt32LE(36)).toBe(0x11223344);
		expect(eot.readUInt32LE(52)).toBe(0x55667788);
		expect(eot.readUInt32LE(60)).toBe(0xdeadbeef);
	});

	it("names the font", () => {
		let at = 82;
		const out: string[] = [];
		for (let i = 0; i < 4; i++) {
			const [s, next] = readName(eot, at);
			out.push(s);
			at = next;
		}
		expect(out).toEqual(["Inter SemiBold", "Regular", "Version 4", "Inter SemiBold"]);
		expect(eot.readUInt16LE(at - 2)).toBe(0); // RootStringSize (after Padding5)
	});
});

describe("embeddingPermissions", () => {
	it("reads fsType", () => {
		expect(embeddingPermissions(fakeFont({ 1: "X" }, 0x0002))).toBe(0x0002);
	});
});

describe("withLegacyFamilyOnly", () => {
	it("drops the typographic family so the legacy family is the only one", () => {
		const font = fakeFont({ 1: "Inter SemiBold", 2: "Regular", 16: "Inter", 17: "SemiBold" });
		const eot = toEot(withLegacyFamilyOnly(font));
		expect(readName(eot, 82)[0]).toBe("Inter SemiBold");
		const out = withLegacyFamilyOnly(font);
		const nameRec = 12 + 2 * 16;
		const base = out.readUInt32BE(nameRec + 8);
		expect(out.readUInt16BE(base + 2)).toBe(2);
		expect(out.readUInt32BE(nameRec + 12)).toBe(6 + 2 * 12 + (14 + 7 + 5 + 8) * 2);
	});

	it("leaves fonts without typographic names alone", () => {
		const font = fakeFont({ 1: "Inter", 2: "Regular" });
		expect(withLegacyFamilyOnly(font)).toBe(font);
	});
});
