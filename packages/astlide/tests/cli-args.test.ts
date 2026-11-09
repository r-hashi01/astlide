import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CliUsageError, parseExportArgs, parseImportArgs } from "../src/cli/args";

const cwd = resolve("/work/site");

describe("astlide export arguments", () => {
	it("has defaults: PDF, ./exports, a build first, 1920×1080", () => {
		const o = parseExportArgs(["my-talk"], cwd);
		expect(o).toMatchObject({
			decks: ["my-talk"],
			all: false,
			outDir: "exports",
			build: true,
			width: 1920,
			height: 1080,
			cwd,
			cwdSet: false,
		});
		expect([...o.formats]).toEqual(["pdf"]);
	});

	it("reads formats, flags and their values", () => {
		const o = parseExportArgs(
			[
				"-a",
				"--pptx",
				"--png",
				"--out-dir",
				"out",
				"--base-url",
				"http://localhost:4321/repo//",
				"--no-build",
				"--width",
				"1280",
				"--height",
				"720",
				"--cwd",
				"../other",
			],
			cwd,
		);
		expect([...o.formats]).toEqual(["pptx", "png"]);
		expect(o).toMatchObject({
			all: true,
			// Where the command runs, also with --cwd (the project root it names).
			outDir: resolve("/work/site/out"),
			baseUrl: "http://localhost:4321/repo",
			build: false,
			width: 1280,
			height: 720,
			cwd: resolve("/work/other"),
			cwdSet: true,
		});
		expect(parseExportArgs(["t", "-o", "talk.pdf"], cwd).output).toBe(
			resolve("/work/site/talk.pdf"),
		);
		expect(parseExportArgs(["t", "-o", "/tmp/talk.pdf"], cwd).output).toBe(
			resolve("/tmp/talk.pdf"),
		);
	});

	it("takes everything after -- as deck names", () => {
		expect(parseExportArgs(["--pdf", "--", "-odd", "--pptx"], cwd).decks).toEqual([
			"-odd",
			"--pptx",
		]);
	});

	it("refuses unknown options, missing values and bad sizes", () => {
		for (const args of [["--nope"], ["--output"], ["--cwd"], ["--width", "0"], ["--height", "x"]])
			expect(() => parseExportArgs(args, cwd), args.join(" ")).toThrow(CliUsageError);
		expect(() => parseExportArgs(["--width", "-3"], cwd)).toThrow(
			"--width must be a positive integer",
		);
		// Not numbers with something after them, nor the next option as a value.
		for (const args of [
			["--width", "1e3"],
			["--height", "720px"],
			["--base-url", "--pdf"],
			["-o", "--pptx"],
			["--out-dir", "-a"],
		])
			expect(() => parseExportArgs(args, cwd), args.join(" ")).toThrow(CliUsageError);
	});
});

describe("astlide import arguments", () => {
	it("resolves a file against the working directory, keeps a URL, and reads the flags", () => {
		expect(parseImportArgs(["talk.pptx"], cwd)).toEqual({
			source: resolve(cwd, "talk.pptx"),
			cwd,
			force: false,
		});
		expect(
			parseImportArgs(
				["https://docs.google.com/presentation/d/x", "--deck", "kickoff", "--force", "--cwd", "p"],
				cwd,
			),
		).toEqual({
			source: "https://docs.google.com/presentation/d/x",
			deck: "kickoff",
			cwd: resolve(cwd, "p"),
			force: true,
		});
	});

	it("needs exactly one source, and known options", () => {
		expect(() => parseImportArgs([], cwd)).toThrow("name a .pptx file or a Google Slides URL");
		expect(() => parseImportArgs(["a.pptx", "b.pptx"], cwd)).toThrow(
			"import takes one file or URL",
		);
		expect(() => parseImportArgs(["a.pptx", "--deck"], cwd)).toThrow(CliUsageError);
		expect(() => parseImportArgs(["a.pptx", "--x"], cwd)).toThrow("unknown option --x");
		expect(() => parseImportArgs(["a.pptx", "--deck", "--force"], cwd)).toThrow(CliUsageError);
	});

	it("takes Google Slides URLs only", () => {
		for (const url of [
			"https://example.com/deck.pptx",
			"http://docs.google.com/presentation/d/x",
			"https://docs.google.com/document/d/x",
		])
			expect(() => parseImportArgs([url], cwd), url).toThrow("only Google Slides URLs");
	});
});
