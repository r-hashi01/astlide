---
title: Embedding a deck
description: Show a deck inside a blog post, a docs page or a React / Vue app with the <astlide-deck> element.
---

A built deck can be placed inside any other page — a blog post, a docs page, a Next.js or Nuxt app. The `<astlide-deck>` custom element loads the deck in an iframe, keeps it at 16:9 at the width of its container, and lets the page drive it: next / previous / go to slide, fullscreen, and an event whenever the slide changes.

Inside the frame the deck hides its own chrome (toolbar, progress bar, notes) and only shows the slide. Click into it and the arrow keys, Space, Page Up / Down, Home and End move through it; moving through slides doesn't add entries to the host page's history.

## In another page of the same Astro site

Use the `DeckEmbed` component — it resolves the deck's URL against Astro's [`base`](/astlide/guides/deploy/):

```astro
---
import DeckEmbed from "@astlide/core/components/DeckEmbed.astro";
---

<DeckEmbed deck="my-talk" />
<DeckEmbed deck="my-talk" start={3} controls title="My talk" />
```

It works in `.mdx` pages too. Without JavaScript a link to the deck is shown instead.

| Prop | Default | |
| --- | --- | --- |
| `deck` | — | Deck name (its directory under `src/content/decks/`) |
| `start` | `1` | Slide shown first |
| `controls` | `false` | Show previous / next, a slide counter and fullscreen below the deck |
| `title` | deck name | Accessible name of the frame |
| `class` | — | Extra CSS class |

## In any HTML page

Import the element once — from a bundler (`import "@astlide/core/embed"`) — and point `src` at the deck's root URL:

```html
<script type="module">
  import "@astlide/core/embed";
</script>

<astlide-deck src="https://example.com/talks/my-talk/" start="2" controls></astlide-deck>
```

The trailing slash of `src` decides the slide URLs: `…/my-talk/` loads `…/my-talk/2/`, `…/my-talk` loads `…/my-talk/2` — match how the deck's site is built (the default `directory` format uses slashes).

### Attributes

| Attribute | | |
| --- | --- | --- |
| `src` | required | URL of the deck root, absolute or relative to the page |
| `start` | `1` | Slide shown first. Changing it later moves the deck there |
| `controls` | off | Show the control bar (previous, counter, next, fullscreen) |
| `label` | `"Slide deck"` | Accessible name of the frame |

### Methods and properties

```js
const deck = document.querySelector("astlide-deck");

deck.next();              // next step, or next slide
deck.prev();              // previous step, or previous slide
deck.goTo(5);             // slide 5
deck.requestFullscreen(); // the standard fullscreen API

deck.slide; // current slide (0 until loaded)
deck.total; // number of slides
deck.step;  // steps revealed on the current slide
```

Calls made before the deck has loaded are queued and sent once it reports in. When the element itself has focus, ← / → / Home / End and `f` (fullscreen) work too.

### Events

`slidechange` fires once the deck has loaded and every time the slide or step changes. It bubbles, and `event.detail` is:

```ts
interface SlideChangeDetail {
  deck: string;  // deck name
  slide: number; // 1-based
  total: number;
  step: number;  // steps revealed on this slide (0 = none)
  steps: number; // steps this slide has
}
```

```js
deck.addEventListener("slidechange", (e) => {
  console.log(`slide ${e.detail.slide} of ${e.detail.total}`);
});
```

### Sizing

The element is a block as wide as its container, with a 16:9 frame. For decks of another shape, set `--astlide-aspect-ratio`:

```css
astlide-deck {
  max-width: 960px;
  --astlide-aspect-ratio: 4 / 3;
}
```

The parts are stylable with `::part(frame)`, `::part(iframe)` and `::part(controls)`.

## React

```tsx
import { useRef } from "react";
import { AstlideDeck, type AstlideDeckElement } from "@astlide/core/embed/react";

export function Talk() {
  const deck = useRef<AstlideDeckElement>(null);
  return (
    <>
      <AstlideDeck
        ref={deck}
        src="https://example.com/talks/my-talk/"
        controls
        onSlideChange={(e) => console.log(e.detail.slide)}
      />
      <button onClick={() => deck.current?.next()}>Next</button>
    </>
  );
}
```

The ref is the element, so its methods and properties are available. The component renders on the server too (Next.js, Remix …); the element comes alive in the browser. `react` is an optional peer dependency of `@astlide/core`.

## Vue

```vue
<script setup lang="ts">
import { ref } from "vue";
import { AstlideDeck } from "@astlide/core/embed/vue";

const deck = ref();
</script>

<template>
  <AstlideDeck
    ref="deck"
    src="https://example.com/talks/my-talk/"
    :start="2"
    controls
    @slidechange="(d) => console.log(d.slide)"
  />
  <button @click="deck.next()">Next</button>
</template>
```

`slidechange` is emitted with the event's detail. The component exposes `next()`, `prev()`, `goTo(n)`, `requestFullscreen()` and `element`. It renders on the server too (Nuxt …). `vue` is an optional peer dependency of `@astlide/core`.

## How it works

The element and the deck talk over `postMessage`. The deck page only listens when it is framed, and only to its parent window; it reports to the origin of the page that greeted it. The element only accepts messages from its own frame and the deck's origin. Commands can only move within the deck.

A deck hosted on another domain can be embedded as long as that host allows framing — check for `X-Frame-Options` or a `frame-ancestors` Content Security Policy on the deck's server.
