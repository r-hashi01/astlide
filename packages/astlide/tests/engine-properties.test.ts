import { describe, expect, it } from "vitest";
import { computeStyle } from "../src/engine/cascade";
import { clipsOverflow, isAbsolute, keyword, value } from "../src/engine/properties";

const vp = { width: 1920, height: 1080, media: "screen" as const };
const compute = (decls: Record<string, string>, parent: Map<string, string> | null = null) =>
	computeStyle(new Map(Object.entries(decls)), { parent, rootFontSize: 16, vp });

describe("computed values", () => {
	it("holds every known property, at its initial value when unset", () => {
		const s = compute({});
		expect(value(s, "flex-wrap")).toBe("nowrap");
		expect(value(s, "border-top-width")).toBe("0");
		expect(value(s, "vertical-align")).toBe("baseline");
		expect(value(s, "word-break")).toBe("normal");
	});

	it("inherits inherited properties and not the others", () => {
		const parent = compute({ "word-break": "break-all", "flex-wrap": "wrap" });
		const child = compute({}, parent);
		expect(keyword(child, "word-break")).toBe("break-all");
		expect(keyword(child, "flex-wrap")).toBe("nowrap");
	});

	it("reads every absolute font-size keyword (Chromium's sizes)", () => {
		const size = (k: string) => compute({ "font-size": k }).get("font-size");
		expect(size("xx-small")).toBe("9px");
		expect(size("x-small")).toBe("10px");
		expect(size("xxx-large")).toBe("48px");
	});

	it("reads a keyword it doesn't know as the initial value", () => {
		expect(keyword(compute({ "flex-wrap": "bogus" }), "flex-wrap")).toBe("nowrap");
	});

	it("blockifies absolute, floated and flex / grid item boxes (CSS Display 3 §2.7)", () => {
		const abs = compute({ position: "absolute", display: "inline-flex", float: "left" });
		expect(isAbsolute(abs)).toBe(true);
		expect(keyword(abs, "display")).toBe("flex");
		expect(keyword(abs, "float")).toBe("none");
		expect(keyword(compute({ float: "left" }), "display")).toBe("block");
		const flex = compute({ display: "flex" });
		expect(keyword(compute({ display: "inline-grid" }, flex), "display")).toBe("grid");
		expect(keyword(compute({}), "display")).toBe("inline");
	});

	it("tells when overflow is clipped, per axis", () => {
		expect(clipsOverflow(compute({}))).toBe(false);
		expect(clipsOverflow(compute({ "overflow-x": "hidden" }), "x")).toBe(true);
		expect(clipsOverflow(compute({ "overflow-x": "hidden" }), "y")).toBe(false);
		expect(clipsOverflow(compute({ overflow: "auto" }), "y")).toBe(true);
	});
});
