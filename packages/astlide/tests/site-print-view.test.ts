import { describe, expect, it } from "vitest";
import { cssUrls } from "../src/cli/pptx/site-print-view";

describe("cssUrls", () => {
	it("finds url() values, quoted or not, with their positions", () => {
		const css = `@font-face{src:url(/f.woff2) format("woff2"),url( "../a b.ttf" )}.x{background:URL('i.png')}`;
		const found = cssUrls(css);
		expect(found.map((f) => f.url)).toEqual(["/f.woff2", "../a b.ttf", "i.png"]);
		for (const f of found) expect(css.slice(f.start, f.end).toLowerCase()).toMatch(/^url\(.*\)$/);
	});

	it("skips names that end in url(", () => {
		expect(cssUrls("a{b:myurl(x) src(y)}")).toEqual([]);
	});

	it("stops at an unclosed url(", () => {
		expect(cssUrls("a{b:url(x")).toEqual([]);
	});
});
