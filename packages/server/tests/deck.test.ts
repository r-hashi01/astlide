import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { BadRequest, deckFiles, parseSlides, slidesFromArray, splitMarkdown } from "../src/deck";
import { Queue, QueueFull } from "../src/queue";
import { zip } from "../src/zip";

describe("splitMarkdown", () => {
	it("splits slides on --- lines", () => {
		const slides = splitMarkdown("# One\n\ntext\n---\n# Two\n---\n\n# Three\n");
		expect(slides.map((s) => s.body)).toEqual(["# One\n\ntext", "# Two", "# Three"]);
		expect(slides.every((s) => s.kind === "md")).toBe(true);
	});

	it("reads a slide's frontmatter block, also on the first slide", () => {
		const slides = splitMarkdown(
			"---\nslideLayout: cover\ntitle: Hello\n---\n# Hi\n---\nnotes: |\n  Line one\n  Line two\n---\n# Second",
		);
		expect(slides).toHaveLength(2);
		expect(slides[0]).toEqual({
			kind: "md",
			body: "# Hi",
			frontmatter: { slideLayout: "cover", title: "Hello" },
		});
		expect(slides[1]?.frontmatter).toEqual({ notes: "Line one\nLine two\n" });
		expect(slides[1]?.body).toBe("# Second");
	});

	it("keeps a last key: value segment as a slide (nothing follows it)", () => {
		const slides = splitMarkdown("# One\n---\nNote: this is text");
		expect(slides.map((s) => s.body)).toEqual(["# One", "Note: this is text"]);
	});

	it("handles CRLF line endings", () => {
		expect(splitMarkdown("# A\r\n---\r\n# B").map((s) => s.body)).toEqual(["# A", "# B"]);
	});
});

describe("slidesFromArray", () => {
	it("takes strings and objects, folding shorthand keys into frontmatter", () => {
		const slides = slidesFromArray([
			"# Plain",
			{ markdown: "# Cover", slideLayout: "cover", notes: "hi", frontmatter: { hidden: true } },
			{ html: "<h1>HTML</h1>", title: "HTML slide" },
		]);
		expect(slides[0]).toEqual({ kind: "md", body: "# Plain", frontmatter: {} });
		expect(slides[1]?.frontmatter).toEqual({ hidden: true, slideLayout: "cover", notes: "hi" });
		expect(slides[2]).toMatchObject({ kind: "html", frontmatter: { title: "HTML slide" } });
	});

	it("refuses items without a body", () => {
		expect(() => slidesFromArray([{ title: "x" }])).toThrow(BadRequest);
		expect(() => slidesFromArray([42])).toThrow(/slides\[0\]/);
	});
});

describe("parseSlides", () => {
	it("prefers slides over markdown and needs one of them", () => {
		expect(parseSlides({ slides: ["# A"], markdown: "# B" })[0]?.body).toBe("# A");
		expect(parseSlides({ markdown: "# B" })[0]?.body).toBe("# B");
		expect(() => parseSlides({})).toThrow(BadRequest);
		expect(() => parseSlides({ markdown: "---\n---" })).toThrow(/no slides/);
	});

	it("validates frontmatter against the slide schema", () => {
		expect(() =>
			parseSlides({ slides: [{ markdown: "# A", frontmatter: { hidden: "yes" } }] }),
		).toThrow(/slide 1: hidden/);
		expect(() =>
			parseSlides({
				slides: [{ markdown: "# A", frontmatter: { background: "url(javascript:x)" } }],
			}),
		).toThrow(/background/);
		expect(() => parseSlides({ markdown: "---\nfoo: [\n---\n# A" })).toThrow(/invalid frontmatter/);
	});

	it("turns layout (reserved by Astro) into slideLayout", () => {
		const [slide] = parseSlides({ markdown: "---\nlayout: section\n---\n# A" });
		expect(slide?.frontmatter).toEqual({ slideLayout: "section" });
	});
});

describe("deckFiles", () => {
	it("writes numbered slide files with frontmatter and _config.json", () => {
		const files = deckFiles(
			parseSlides({
				slides: [
					{ markdown: "# A", slideLayout: "cover", notes: 'Say "hi"\n: ok' },
					{ html: "<p>B</p>" },
				],
			}),
			{ title: "Deck", theme: "dark" },
		);
		expect(Object.keys(files)).toEqual(["01-slide.md", "02-slide.html", "_config.json"]);
		expect(files["01-slide.md"]).toBe(
			'---\nslideLayout: "cover"\nnotes: "Say \\"hi\\"\\n: ok"\n---\n# A\n',
		);
		expect(files["02-slide.html"]).toBe("---\n{}\n---\n<p>B</p>\n");
		expect(JSON.parse(files["_config.json"] as string)).toEqual({ title: "Deck", theme: "dark" });
	});

	it("pads numbers so slides sort", () => {
		const files = deckFiles(
			parseSlides({ slides: Array.from({ length: 120 }, (_, i) => `# ${i}`) }),
			{},
		);
		expect(Object.keys(files)[0]).toBe("001-slide.md");
		expect(Object.keys(files)).toContain("120-slide.md");
	});
});

describe("zip", () => {
	it("writes entries a reader can inflate", () => {
		const data = Buffer.from("hello hello hello");
		const archive = zip([{ name: "a.txt", data }]);
		expect(archive.readUInt32LE(0)).toBe(0x04034b50);
		const nameLength = archive.readUInt16LE(26);
		const size = archive.readUInt32LE(18);
		const start = 30 + nameLength;
		expect(archive.subarray(30, start).toString()).toBe("a.txt");
		expect(inflateRawSync(archive.subarray(start, start + size)).toString()).toBe(data.toString());
		expect(archive.readUInt32LE(archive.length - 22)).toBe(0x06054b50);
	});
});

describe("Queue", () => {
	it("runs at most `concurrency` jobs and refuses beyond the queue", async () => {
		const queue = new Queue(1, 1);
		let release!: () => void;
		const first = queue.run(() => new Promise<string>((r) => (release = () => r("first"))));
		const second = queue.run(async () => "second");
		await expect(queue.run(async () => "third")).rejects.toBeInstanceOf(QueueFull);
		expect(queue.size).toEqual({ running: 1, waiting: 1 });
		release();
		expect(await first).toBe("first");
		expect(await second).toBe("second");
		expect(queue.size).toEqual({ running: 0, waiting: 0 });
	});
});

describe("input that could escape the slide", () => {
	it("keeps a body that starts with --- as body, not frontmatter", () => {
		const evil = "---\nslideLayout: 42\nfoo: bar\n---\n# Hi";
		const files = deckFiles(parseSlides({ slides: [evil, { html: evil }] }), {});
		expect(files["01-slide.md"]).toBe(`---\n{}\n---\n${evil}\n`);
		expect(files["02-slide.html"]).toBe(`---\n{}\n---\n${evil}\n`);
	});

	it("refuses Markdown images that are file paths", () => {
		for (const markdown of [
			"![x](../../../../etc/secret.png)",
			"![x](<./a b.png>)",
			'![x](img.jpg "title")',
			"![x][a]\n\n[a]: ../../x.svg",
		])
			expect(() => parseSlides({ markdown }), markdown).toThrow(/file path/);
	});

	it("allows image URLs, and links to relative pages", () => {
		for (const markdown of [
			"![x](https://example.com/a.png)",
			"![x](data:image/png;base64,AAAA)",
			"![x](/public.png)",
			"[docs](../guide.html)",
			'<img src="../x.png">',
		])
			expect(() => parseSlides({ markdown }), markdown).not.toThrow();
	});
});
