# @astlide/vue

Astlide for Vue: the slides of an [Astlide](https://astlide.dev) site as Vue components, so the same decks (Markdown, HTML and **MDX**) run in a Vue app.

- `Slide` and the slide components — `Columns`, `Left` / `Right`, `ImageSide`, `TextPanel`, `Fragment`, `Fragments`, `SpeakerNotes`, `CodeBlock`, `Math`, `YouTube`, `Tweet` — with the markup of the Astro ones. Written with `h()`: no SFC compiler needed.
- `DeckPage`: a slide page (the slide in its default slot) with the toolbar, presenter window, overview, go-to, pen and laser, notes, driven by Astlide's deck runtime. Pass your router as `navigate`.
- `createMdxComponents()` / `mdxComponents`: the names MDX slides use. Compile slides with `compileMdxComponent` from `@astlide/vue/server` (Astro's own MDX engine and Astlide's code highlighting, Vue's JSX runtime); `renderMdxToHtml` renders one to HTML (e.g. for `renderDeck`).

Load `@astlide/core/styles/base.css`, `deck.css`, `slide.css`, `components.css`, a theme, and `katex/dist/katex.min.css` for `Math`.

Not published yet: part of the work towards Astlide 3. The Nuxt module builds on it.
