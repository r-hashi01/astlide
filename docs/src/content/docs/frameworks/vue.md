---
title: Vue
description: Astlide's slides, layouts, components and deck page as Vue components, to build deck pages into any Vue app.
---

`@astlide/vue` gives you Astlide's slides as Vue components. Use it when you build the deck pages yourself, for example in a Vite app. For Nuxt, use [`@astlide/nuxt`](/frameworks/nuxt/).

The components work in `.vue` files, in JSX and in render functions.

## What's in it

- **`Slide`** is one slide. It takes the same frontmatter fields as an Astro site (`layout`, `transition`, `background`, `className`) and the slide's content, in its default slot or as `html`.
- **Slide components** come with the same names and markup as the Astro ones: `Columns`, `Left`, `Right`, `ImageSide`, `TextPanel`, `Fragment`, `Fragments`, `SpeakerNotes` (or `Notes`), `CodeBlock`, `Math`, `YouTube` and `Tweet`.
- **`createMdxComponents(settings)`** returns those components by the names MDX slides use. `mdxComponents` is the same with the default settings. The settings are `resolveUrl`, for root-relative URLs under a base path, and `notes`, to leave speaker notes out.
- **`DeckPage`** is a slide page with the toolbar, presenter window, overview, go-to dialog, pen, laser pointer and notes, with the slide in its default slot. Pass your router's navigation as `navigate`, for example `(url, { replace }) => (replace ? router.replace(url) : router.push(url))`.
- **`@astlide/vue/jsx-runtime`** is the JSX runtime for MDX slides in Vue. It passes a component's children as its default slot, the way Vue expects.
- **`@astlide/vue/server`** has `compileMdxComponent(source)`, which turns an MDX slide into a Vue component on the server, and `renderMdxToHtml(source)`, which renders one to HTML. One use is `renderDeck` from `@astlide/core/render`, for PDF and PPTX without a site.

## Slides and MDX

Read the deck on the server or at build time with `readDeck()` from `@astlide/core/deck`. `slidePage(deck, n)` from `@astlide/core/deck/pages` gives what `DeckPage` needs for page `n`: the slide, prev / next / first / last, the outline and the deck context.

Markdown, HTML and PowerPoint slides arrive as sanitized HTML (`slide.html`), so pass them as `html`. MDX slides arrive as source (`slide.body`). Compile them:

- **At build time:** `compileSlideMdx(slide.body, { jsxImportSource: "@astlide/vue" })` from `@astlide/core/deck` returns an ES module (`export default MDXContent`) for your bundler.
- **On the server:** `compileMdxComponent(slide.body)` from `@astlide/vue/server`.

Render the component in `Slide`'s default slot, with `components`:

```ts
h(Slide, { layout: slide.data.slideLayout, slideNumber: page.number, totalSlides: page.totalSlides }, () =>
  h(Content, { components: mdxComponents }),
);
```

## Styles

Load these once:

```ts
import "@astlide/core/styles/base.css";
import "@astlide/core/styles/deck.css";
import "@astlide/core/styles/slide.css";
import "@astlide/core/styles/components.css";
import "@astlide/core/styles/print.css";
import "@astlide/core/styles/themes/default.css"; // and the other themes your decks use
import "katex/dist/katex.min.css"; // for Math
```

Set the deck's theme on `<html data-theme="…">`.

## A print view, for export

`astlide export --base-url` reads `/<deck>/all`: every slide, without hidden ones (`printSlides()` from `@astlide/core/deck/pages`), on one page. Give that page the attributes and `<meta>` tags from `@astlide/core/deck/print-view`, `printViewAttributes(deck.config)` and `printViewMeta(deck)`. Then PDF, PNG and PPTX come out the same as from an Astro site. See [Nuxt](/frameworks/nuxt/#export) for the command.
