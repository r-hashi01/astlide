/**
 * The decks as modules, made when the app is built (and again on changes in
 * development):
 *
 * - `virtual:astlide-nuxt/decks`: the decks and their slides' frontmatter,
 *   each slide with `load()`;
 * - one module per slide: its HTML (Markdown, HTML, PowerPoint) or its MDX
 *   compiled into a Vue component (`default`), plus its notes.
 *
 * @module
 */

import { createRequire } from "node:module";
import { compileSlideMdx, type Deck, readDecks, renderNotesHtml } from "@astlide/core/deck";
import { slideTitle } from "@astlide/core/utils/slide-title";
import type { Plugin, ViteDevServer } from "vite";

export interface DecksPluginOptions {
	dir: string;
	shikiTheme?: string;
	showHidden: boolean;
	/** Settings the pages read (`options` of the decks module). */
	runtime: { basePath: string; toolbar?: string[] };
}

const DECKS = "virtual:astlide-nuxt/decks";
const SLIDE = "virtual:astlide-nuxt/slide/";
const UNSAFE: Record<string, string> = {
	"<": "\\u003C",
	">": "\\u003E",
	"\u2028": "\\u2028",
	"\u2029": "\\u2029",
};
/** A value as a JavaScript literal in generated code (`JSON.stringify`, with nothing that could end a script). */
const json = (value: unknown) =>
	(JSON.stringify(value) ?? "undefined").replace(/[<>\u2028\u2029]/g, (c) => UNSAFE[c] ?? c);
/** MDX slides' JSX runtime, resolved from here (the app needn't depend on `@astlide/vue`). */
const JSX_RUNTIME = "@astlide/vue/jsx-runtime";

export function astlideDecksPlugin(options: DecksPluginOptions): Plugin {
	const markdown = { shikiTheme: options.shikiTheme };
	let cached: Promise<Deck[]> | undefined;
	const decks = () => {
		cached ??= readDecks(options.dir, { markdown }).then((all) =>
			all.map((d) => ({
				...d,
				slides: d.slides.filter((s) => options.showHidden || !s.data.hidden),
			})),
		);
		return cached;
	};
	const slideId = (deck: string, id: string) =>
		`${SLIDE}${encodeURIComponent(deck)}/${encodeURIComponent(id)}`;

	const servers = new Set<ViteDevServer>();
	const reload = () => {
		cached = undefined;
		for (const server of servers) {
			for (const [id, mod] of server.moduleGraph.idToModuleMap)
				if (id.startsWith(`\0${DECKS}`) || id.startsWith(`\0${SLIDE}`))
					server.moduleGraph.invalidateModule(mod);
			server.ws.send({ type: "full-reload" });
		}
	};

	return {
		name: "astlide:nuxt-decks",
		enforce: "pre",
		resolveId(id, importer) {
			if (id === DECKS || id.startsWith(SLIDE)) return `\0${id}`;
			if (id === JSX_RUNTIME && importer?.startsWith(`\0${SLIDE}`))
				return createRequire(import.meta.url).resolve(JSX_RUNTIME);
		},
		async load(id) {
			if (id === `\0${DECKS}`) {
				const all = await decks();
				const list = all.map(
					(d) =>
						`{name:${json(d.name)},config:${json(d.config)},slides:[${d.slides
							.map(
								(s) =>
									`{id:${json(s.id)},format:${json(s.format)},data:${json(s.data)},title:${json(
										s.title,
									)},description:${json(slideTitle({ data: s.data, body: s.body }))},load:()=>import(${json(
										slideId(d.name, s.id),
									)})}`,
							)
							.join(",")}]}`,
				);
				return `export const options=${json(options.runtime)};\nexport const decks=[${list.join(",\n")}];\n`;
			}
			if (!id.startsWith(`\0${SLIDE}`)) return;
			const [deckName, slideName] = id
				.slice(SLIDE.length + 1)
				.split("/")
				.map(decodeURIComponent);
			const slide = (await decks())
				.find((d) => d.name === deckName)
				?.slides.find((s) => s.id === slideName);
			if (!slide) return "export const html = '';";
			const notes = slide.notes
				? `export const notes=${json(slide.notes)};\nexport const notesHtml=${json(await renderNotesHtml(slide.notes))};\n`
				: "";
			if (slide.format !== "mdx") return `export const html=${json(slide.html ?? "")};\n${notes}`;
			const code = await compileSlideMdx(slide.body, {
				...markdown,
				jsxImportSource: "@astlide/vue",
			});
			return `${code}\n${notes}`;
		},
		configureServer(server) {
			servers.add(server);
			server.watcher.add(options.dir);
			const changed = (file: string) => {
				if (file.startsWith(options.dir)) reload();
			};
			server.watcher.on("add", changed);
			server.watcher.on("change", changed);
			server.watcher.on("unlink", changed);
		},
	};
}
