---
title: React
description: Astlide's slides, layouts, components and deck page as React components, to build deck pages into any React app.
---

`@astlide/react` gives you Astlide's slides as React components. Use it when you build the deck pages yourself, for example in a Vite app or a React framework other than Next.js. For Next.js, use [`@astlide/next`](/frameworks/next/).

## What's in it

- **`<Slide>`** is one slide. It takes the same frontmatter fields as an Astro site (`layout`, `transition`, `background`, `className`) and the slide's content, as children or as `html`.
- **Slide components** come with the same names and markup as the Astro ones: `Columns`, `Left`, `Right`, `ImageSide`, `TextPanel`, `Fragment`, `Fragments`, `SpeakerNotes` (or `Notes`), `CodeBlock`, `Math`, `YouTube` and `Tweet`.
- **`createMdxComponents(settings)`** returns those components by the names MDX slides use. `mdxComponents` is the same with the default settings. The settings are `resolveUrl`, for root-relative URLs under a base path, and `notes`, to leave speaker notes out.
- **`<DeckPage>`** is a slide page with the toolbar, presenter window, overview, go-to dialog, pen, laser pointer and notes. Pass your router's navigation as `navigate`, or leave it out for full page loads.
- **`@astlide/react/server`** has `renderMdxToHtml(source)`, which renders an MDX slide to HTML on the server. One use is `renderDeck` from `@astlide/core/render`, for PDF and PPTX without a site.

## A slide page

The deck is read on the server or at build time with `@astlide/core`. `slidePage()` gives what page `n` shows:

```tsx
import { readDeck, renderNotesHtml } from "@astlide/core/deck";
import { slidePage } from "@astlide/core/deck/pages";
import { DeckPage, Slide } from "@astlide/react";

const deck = await readDeck("decks/my-talk");
const page = slidePage(deck, 3); // null when there's no slide 3
// page.redirectTo is set when slide 3 is hidden: send the browser there.
const notesHtml = page?.slide.notes ? await renderNotesHtml(page.slide.notes) : undefined;

// `navigate` is your router's navigation, e.g. React Router's useNavigate().
export function SlidePage({ navigate }: { navigate: (url: string, o: { replace: boolean }) => void }) {
  if (!page) return null;
  const { slide } = page;
  return (
    <DeckPage
      deck={deck.name}
      slideNumber={page.number}
      totalSlides={page.totalSlides}
      prevSlide={page.prevSlide}
      nextSlide={page.nextSlide}
      firstSlide={page.firstSlide}
      lastSlide={page.lastSlide}
      outline={page.outline}
      deckContext={page.deckContext}
      notesHtml={notesHtml}
      basePath="/decks"
      navigate={navigate}
    >
      <Slide
        layout={slide.data.slideLayout}
        transition={slide.data.transition}
        background={slide.data.background}
        className={slide.data.class}
        slideNumber={page.number}
        totalSlides={page.totalSlides}
        html={slide.html}
      />
    </DeckPage>
  );
}
```

Markdown, HTML and PowerPoint slides arrive as sanitized HTML in `slide.html`. MDX slides arrive as source in `slide.body`. Compile them with `@astlide/core/deck`:

- **On the server:** `evaluateSlideMdx(slide.body, runtime)`, with `import * as runtime from "react/jsx-runtime"`, returns the slide's component.
- **At build time:** `compileSlideMdx(slide.body)` returns an ES module (`export default MDXContent`) for your bundler.

Render the component inside `<Slide>`, with the components the slide uses:

```tsx
<Slide /* … */>
  <Content components={mdxComponents} />
</Slide>
```

`<DeckPage>` places the slide itself. When the page is the presenter window (`?presenter` in the URL, or the window Astlide opens), pass `presenter`.

## Styles

Load these once:

```ts
import "@astlide/core/styles/base.css";
import "@astlide/core/styles/deck.css";
import "@astlide/core/styles/slide.css";
import "@astlide/core/styles/components.css";
import "@astlide/core/styles/print.css";
import "@astlide/core/styles/themes/default.css"; // and the other themes your decks use
import "katex/dist/katex.min.css"; // for <Math>
```

Set the deck's theme on `<html data-theme="…">`.

## A print view, for export

`astlide export --base-url` reads `/<deck>/all`: every slide, without hidden ones (`printSlides()` from `@astlide/core/deck/pages`), on one page. Give that page the attributes and `<meta>` tags from `@astlide/core/deck/print-view`, `printViewAttributes(deck.config)` and `printViewMeta(deck)`. Then PDF, PNG and PPTX come out the same as from an Astro site. See [Next.js](/frameworks/next/#export) for the command.
