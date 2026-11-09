/**
 * Fonts in PowerPoint: weights as face names, and the font files embedded.
 *
 * @module
 */

import { readFileSync } from "node:fs";
import { embeddingPermissions, withLegacyFamilyOnly } from "../ooxml/eot";
import type { TextItem, Warn } from "./common";
import type { EmbeddedFont } from "./writer/spec";

const WEIGHT_NAMES: Record<number, string> = {
	100: "Thin",
	200: "ExtraLight",
	300: "Light",
	500: "Medium",
	600: "SemiBold",
	800: "ExtraBold",
	900: "Black",
};

/** PowerPoint only knows regular / bold: other weights go by their own face name. */
export function fontFor(family: string, weight: number): { face: string; bold: boolean } {
	if (weight >= 700 && weight < 800) return { face: family, bold: true };
	if (weight === 400) return { face: family, bold: false };
	const name = WEIGHT_NAMES[Math.round(weight / 100) * 100];
	// Static faces already carry the weight in their family name ("Inter SemiBold").
	if (!name || family.endsWith(` ${name}`)) return { face: family, bold: false };
	return { face: `${family} ${name}`, bold: false };
}

/**
 * The font files behind the text, by the typeface and slot the runs use
 * (see {@link fontFor}), so PowerPoint shows them without the fonts
 * installed. Fonts whose license forbids embedding (`fsType` restricted)
 * are left out.
 */
export function embeddedFonts(items: TextItem[], warn: Warn): EmbeddedFont[] {
	const byFace = new Map<string, EmbeddedFont>();
	const skipped = new Set<string>();
	for (const item of items) {
		// By the file's own style: an upright file goes in the upright slot, and
		// PowerPoint slants it for italic text, as a browser does.
		const { file, fileItalic: italic } = item.font;
		if (!file) continue;
		const f = fontFor(item.font.family, item.font.weight);
		const slot = f.bold ? (italic ? "boldItalic" : "bold") : italic ? "italic" : "regular";
		const font = byFace.get(f.face) ?? { typeface: f.face };
		if (font[slot]) continue;
		const data = readFileSync(file);
		if (embeddingPermissions(data) & 0x0002) {
			skipped.add(f.face);
			continue;
		}
		// Weights PowerPoint has no slot for are families of their own.
		const ownFamily = item.font.weight !== 400 && !f.bold;
		font[slot] = ownFamily ? withLegacyFamilyOnly(data) : data;
		byFace.set(f.face, font);
	}
	if (skipped.size)
		warn(`  ⚠ not embedded (license restricts embedding): ${[...skipped].join(", ")}`);
	return [...byFace.values()];
}
