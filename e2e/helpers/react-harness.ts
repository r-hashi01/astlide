/**
 * A React app over the playground's decks, for the e2e tests: every slide
 * page rendered on the client by `@astlide/react` (MDX slides compiled with
 * `compileSlideMdx`), with the stylesheets an Astlide site loads. Served as
 * static files; navigation is full page loads, as `<DeckPage>` does without
 * a router.
 */

import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readDeck } from "../../packages/astlide/src/deck/index";
import { compileSlideMdx } from "../../packages/astlide/src/deck/mdx";
import { renderNotesHtml } from "../../packages/astlide/src/deck/notes";
import { THEMES } from "../../packages/astlide/src/schema";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const styles = join(repo, "packages/astlide/src/styles");
const FONT =
	"https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;700&display=swap";

/** Build the app for these decks into `out`. */
export async function buildReactHarness(decks: string[], out: string): Promise<void> {
	// Sources inside the repo, so their imports resolve from its node_modules.
	const src = join(repo, "node_modules", ".cache", "astlide-react-harness");
	rmSync(src, { recursive: true, force: true });
	mkdirSync(join(src, "slides"), { recursive: true });
	mkdirSync(join(out, "_css"), { recursive: true });
	const sheets = [
		"base.css",
		"deck.css",
		"slide.css",
		"components.css",
		...THEMES.map((t) => `themes/${t}.css`),
	];
	for (const s of sheets)
		copyFileSync(join(styles, s), join(out, "_css", s.replace("themes/", "theme-")));
	const katex = createRequire(join(repo, "packages/react/package.json")).resolve(
		"katex/dist/katex.min.css",
	);
	copyFileSync(katex, join(out, "_css", "katex.css"));
	// KaTeX's fonts, next to its stylesheet as it expects.
	cpSync(join(dirname(katex), "fonts"), join(out, "_css", "fonts"), { recursive: true });

	const table: string[] = [];
	const imports: string[] = [];
	for (const name of decks) {
		const deck = await readDeck(join(repo, "playground/src/content/decks", name));
		const rows: string[] = [];
		for (const s of deck.slides) {
			let content = "null";
			if (s.format === "mdx") {
				const id = `${name.replace(/\W/g, "_")}_${s.number}`;
				writeFileSync(join(src, "slides", `${id}.jsx`), await compileSlideMdx(s.body));
				imports.push(`import ${id} from "./slides/${id}.jsx";`);
				content = id;
			}
			rows.push(
				`{ data: ${JSON.stringify(s.data)}, title: ${JSON.stringify(s.title ?? null)}, html: ${JSON.stringify(s.html ?? null)}, notes: ${JSON.stringify(s.notes ? await renderNotesHtml(s.notes) : null)}, Content: ${content} }`,
			);
			const dir = join(out, name, String(s.number));
			mkdirSync(dir, { recursive: true });
			writeFileSync(
				join(dir, "index.html"),
				`<!DOCTYPE html>
<html lang="en" data-theme="${deck.config.theme ?? "default"}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${deck.config.title ?? name} - Slide ${s.number}</title>
<link href="${FONT}" rel="stylesheet" />
${sheets.map((x) => `<link rel="stylesheet" href="/_css/${x.replace("themes/", "theme-")}" />`).join("\n")}
<link rel="stylesheet" href="/_css/katex.css" />
</head>
<body><div id="root"></div><script type="module" src="/_app.js"></script></body>
</html>
`,
			);
		}
		table.push(
			`${JSON.stringify(name)}: { config: ${JSON.stringify(deck.config)}, slides: [${rows.join(",\n")}] }`,
		);
	}
	writeFileSync(
		join(src, "entry.jsx"),
		`import { createRoot } from "react-dom/client";
import { jsx } from "react/jsx-runtime";
import { DeckPage, Slide, mdxComponents } from "${join(repo, "packages/react/src/index.tsx")}";
${imports.join("\n")}
const decks = { ${table.join(",\n")} };
const [, deckName, n] = location.pathname.match(/^\\/([^/]+)\\/(\\d+)/) ?? [];
const deck = decks[deckName];
const number = Number(n);
const slide = deck.slides[number - 1];
const content = slide.Content ? jsx(slide.Content, { components: mdxComponents }) : undefined;
document.title = \`\${deck.config.title ?? deckName} - Slide \${number}\`;
createRoot(document.getElementById("root")).render(
	jsx(DeckPage, {
			deck: deckName,
			slideNumber: number,
			totalSlides: deck.slides.length,
			trailingSlash: true,
			toolbar: ["prev", "counter", "next", "spacer", "notes", "overview", "presenter"],
			notesHtml: slide.notes ?? undefined,
			outline: deck.slides.map((s, i) => ({ n: i + 1, title: s.title ?? \`Slide \${i + 1}\` })),
			presenter: new URLSearchParams(location.search).has("presenter") || window.name === "astlide-presenter",
			loadMermaid: () => import("mermaid"),
			children: jsx(Slide, {
				layout: slide.data.slideLayout,
				transition: slide.data.transition,
				background: slide.data.background,
				className: slide.data.class,
				slideNumber: number,
				totalSlides: deck.slides.length,
				...(content ? { children: content } : { html: slide.html ?? "" }),
			}),
	}),
);
`,
	);
	// Bundled with the bun CLI (the tests run under Node).
	execFileSync(
		"bun",
		[
			"build",
			join(src, "entry.jsx"),
			"--outfile",
			join(out, "_app.js"),
			"--target=browser",
			"--minify",
			"--define",
			'process.env.NODE_ENV="production"',
		],
		{ stdio: "pipe" },
	);
}
