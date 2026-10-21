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
	it("prefers slides over markdown and needs one of them", async () => {
		expect((await parseSlides({ slides: ["# A"], markdown: "# B" }))[0]?.body).toBe("# A");
		expect((await parseSlides({ markdown: "# B" }))[0]?.body).toBe("# B");
		await expect(parseSlides({})).rejects.toThrow(BadRequest);
		await expect(parseSlides({ markdown: "---\n---" })).rejects.toThrow(/no slides/);
	});

	it("validates frontmatter against the slide schema", async () => {
		await expect(
			parseSlides({ slides: [{ markdown: "# A", frontmatter: { hidden: "yes" } }] }),
		).rejects.toThrow(/slide 1: hidden/);
		await expect(
			parseSlides({
				slides: [{ markdown: "# A", frontmatter: { background: "url(javascript:x)" } }],
			}),
		).rejects.toThrow(/background/);
		await expect(parseSlides({ markdown: "---\nfoo: [\n---\n# A" })).rejects.toThrow(
			/invalid frontmatter/,
		);
	});

	it("turns layout (reserved by Astro) into slideLayout", async () => {
		const [slide] = await parseSlides({ markdown: "---\nlayout: section\n---\n# A" });
		expect(slide?.frontmatter).toEqual({ slideLayout: "section" });
	});
});

describe("deckFiles", () => {
	it("writes numbered slide files with frontmatter and _config.json", async () => {
		const files = deckFiles(
			await parseSlides({
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

	it("pads numbers so slides sort", async () => {
		const files = deckFiles(
			await parseSlides({ slides: Array.from({ length: 120 }, (_, i) => `# ${i}`) }),
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
	it("keeps a body that starts with --- as body, not frontmatter", async () => {
		const evil = "---\nslideLayout: 42\nfoo: bar\n---\n# Hi";
		const files = deckFiles(await parseSlides({ slides: [evil, { html: evil }] }), {});
		expect(files["01-slide.md"]).toBe(`---\n{}\n---\n${evil}\n`);
		expect(files["02-slide.html"]).toBe(`---\n{}\n---\n${evil}\n`);
	});

	it("refuses Markdown images that are file paths", async () => {
		for (const markdown of [
			"![x](../../../../etc/secret.png)",
			"![x](<./a b.png>)",
			'![x](img.jpg "title")',
			"![x][a]\n\n[a]: ../../x.svg",
			"![x](%2e%2e/%2e%2e/x.png)",
			"![x](..\\..\\x.png)",
			"![x](x.png?raw)",
			"[![x](../x.png)](https://example.com)",
			"> - ![x](../x.png)",
			"![x](<../a b.png> 'title')",
		])
			await expect(parseSlides({ markdown }), markdown).rejects.toThrow(/file path/);
	});

	it("allows image URLs, and links to relative pages", async () => {
		for (const markdown of [
			"![x](https://example.com/a.png)",
			"![x](data:image/png;base64,AAAA)",
			"![x](/public.png)",
			"[docs](../guide.html)",
			'<img src="../x.png">',
			"![x](//cdn.example.com/a.png)",
			"![x](file:///etc/x.png)",
			"`![x](../x.png)`",
			"text\n\n    ![x](../x.png)",
		])
			await expect(parseSlides({ markdown }), markdown).resolves.toBeDefined();
	});
});

describe("input meant to exhaust the server", () => {
	it("checks images in linear time", async () => {
		for (const body of ["![](".repeat(250_000), "![](<".repeat(200_000), "[\n".repeat(500_000)]) {
			const started = performance.now();
			await parseSlides({ slides: [body] });
			expect(performance.now() - started).toBeLessThan(1000);
		}
	});

	it("refuses YAML aliases in frontmatter", async () => {
		const levels = ["a: &a [x, x, x, x, x, x, x, x, x, x]"];
		for (let i = 1; i < 9; i++)
			levels.push(
				`l${i}: &l${i} [${Array(10)
					.fill(i === 1 ? "*a" : `*l${i - 1}`)
					.join(", ")}]`,
			);
		await expect(parseSlides({ markdown: `---\n${levels.join("\n")}\n---\n# A` })).rejects.toThrow(
			/invalid frontmatter/,
		);
	});

	it("refuses oversized frontmatter", async () => {
		await expect(
			(async () =>
				deckFiles(
					await parseSlides({
						slides: [{ markdown: "# A", frontmatter: { x: "y".repeat(300_000) } }],
					}),
					{},
				))(),
		).rejects.toThrow(/frontmatter is larger/);
	});

	it("counts slides before checking each one", async () => {
		await expect(
			parseSlides({ slides: Array.from({ length: 11 }, () => ({ frontmatter: 42 })) }, 10),
		).rejects.toThrow(/at most 10 slides/);
		await expect(parseSlides({ markdown: "# A\n---\n# B\n---\n# C" }, 2)).rejects.toThrow(
			/at most 2/,
		);
	});
});
