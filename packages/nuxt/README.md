# @astlide/nuxt

Astlide for Nuxt: a folder of [Astlide](https://astlide.dev) decks (the same `_config.json` and numbered `.md` / `.mdx` / `.html` / `.pptx` slides) as pages of a Nuxt app, with the presenter window, overview, notes, print view and exports.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@astlide/nuxt"],
  astlide: { dir: "decks", basePath: "/decks" },
});
```

- Pages: `/decks/` (the list), `/decks/<deck>/<n>` (a slide), `/decks/<deck>/all` (the print view `astlide export --base-url` reads).
- **MDX** slides are compiled when the app is built (and on changes in development) into Vue components using `@astlide/vue`: rendered on the server, hydrated, with no MDX compiler at run time.
- Options: `dir`, `basePath`, `toolbar`, `shikiTheme`, `showHidden`, `mermaid` (default: when `mermaid` is installed).

