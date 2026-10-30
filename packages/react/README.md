# @astlide/react

Astlide for React: the slides of an [Astlide](https://astlide.dev) site as React components, so the same decks (Markdown, HTML and **MDX**) run in a React app.

- `<Slide>` and the slide components — `Columns`, `Left` / `Right`, `ImageSide`, `TextPanel`, `Fragment`, `Fragments`, `SpeakerNotes`, `CodeBlock`, `Math`, `YouTube`, `Tweet` — with the markup of the Astro ones.
- `<DeckPage>`: a slide page with the toolbar, presenter window, overview, go-to, pen and laser, notes and PDF download, driven by Astlide's deck runtime. Pass your router as `navigate`.
- `mdxComponents`: the names MDX slides use. Compile slides with `compileSlideMdx` / `evaluateSlideMdx` from `@astlide/core/deck` (Astro's own MDX engine and Astlide's code highlighting, with React as the JSX runtime).

Load `@astlide/core/styles/base.css`, `deck.css`, `slide.css`, `components.css` and a theme (`@astlide/core/styles/themes/<name>.css`); for `<Math>`, `katex/dist/katex.min.css`.

