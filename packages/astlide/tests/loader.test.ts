import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { astlideDeckLoader } from "../src/loader";
import { slideSchema } from "../src/schema";

/** Minimal in-memory DataStore matching the subset the loader uses. */
function createStore() {
	const map = new Map<string, Record<string, unknown>>();
	return {
		map,
		get: (key: string) => map.get(key),
		set: (entry: { id: string }) => {
			map.set(entry.id, entry);
			return true;
		},
		entries: () => Array.from(map.entries()) as Array<[string, Record<string, unknown>]>,
		values: () => Array.from(map.values()),
		keys: () => Array.from(map.keys()),
		delete: (key: string) => {
			map.delete(key);
		},
		clear: () => map.clear(),
		has: (key: string) => map.has(key),
		addModuleImport: () => {},
	};
}

/** Build a LoaderContext stub whose root is a real temp directory. */
function createContext(rootDir: string, store: ReturnType<typeof createStore>) {
	return {
		collection: "decks",
		store,
		meta: { get: () => undefined, set: () => {}, has: () => false, delete: () => {} },
		logger: { warn: () => {}, info: () => {}, error: () => {}, debug: () => {} },
		config: { root: pathToFileURL(`${rootDir}/`) },
		parseData: async ({ data }: { data: Record<string, unknown> }) => slideSchema.parse(data),
		generateDigest: (input: unknown) => String(JSON.stringify(input)).length.toString(),
		renderMarkdown: async (content: string) => ({ html: content }),
		// biome-ignore lint/suspicious/noExplicitAny: test stub for Astro's LoaderContext
	} as any;
}

describe("astlideDeckLoader — HTML slides", () => {
	let root: string;
	let deckDir: string;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "astlide-loader-"));
		deckDir = join(root, "src", "content", "decks", "deck-a");
		mkdirSync(deckDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it("ingests a .html slide with frontmatter as pre-rendered content", async () => {
		writeFileSync(
			join(deckDir, "01-cover.html"),
			`---\nslideLayout: cover\nbackground: "#0b132b"\n---\n<h1>Hello HTML</h1>`,
		);

		const store = createStore();
		const loader = astlideDeckLoader();
		await loader.load(createContext(root, store));

		const entry = store.get("deck-a/01-cover") as {
			data: { slideLayout: string; background?: string };
			rendered: { html: string };
			body: string;
		};
		expect(entry).toBeDefined();
		expect(entry.data.slideLayout).toBe("cover");
		expect(entry.data.background).toBe("#0b132b");
		expect(entry.rendered.html).toContain("<h1>Hello HTML</h1>");
		// Frontmatter must be stripped from the rendered body.
		expect(entry.rendered.html).not.toContain("slideLayout");
	});

	it("applies schema defaults when a .html slide has no frontmatter", async () => {
		writeFileSync(join(deckDir, "02-plain.htm"), `<p>No frontmatter here</p>`);

		const store = createStore();
		await astlideDeckLoader().load(createContext(root, store));

		const entry = store.get("deck-a/02-plain") as {
			data: { slideLayout: string; transition: string };
			rendered: { html: string };
		};
		expect(entry.data.slideLayout).toBe("default");
		expect(entry.data.transition).toBe("fade");
		expect(entry.rendered.html).toContain("No frontmatter here");
	});

	it("removes store entries whose .html source was deleted", async () => {
		const htmlPath = join(deckDir, "03-temp.html");
		writeFileSync(htmlPath, `<h1>Temporary</h1>`);

		const store = createStore();
		const ctx = createContext(root, store);
		await astlideDeckLoader().load(ctx);
		expect(store.has("deck-a/03-temp")).toBe(true);

		rmSync(htmlPath);
		await astlideDeckLoader().load(ctx);
		expect(store.has("deck-a/03-temp")).toBe(false);
	});
});
