---
title: Embedding a deck
description: Show a deck inside a blog post, a docs page or a React / Vue app with the <astlide-deck> element.
---

You can show a built deck inside another page: a blog post, a docs page, or a Next.js or Nuxt app. The `<astlide-deck>` custom element loads the deck in an iframe and keeps it at 16:9 across the width of its container. Your page can move through the slides, open the deck in fullscreen, and listen for slide changes.

An embedded deck shows only the slide. The toolbar, progress bar and notes are hidden. Viewers click into the deck and use the arrow keys, Space, Page Up / Down, Home and End to move through it. Moving between slides doesn't add entries to the host page's history.

## In your Astro site

To embed a deck in another page of the same Astro site, use the `DeckEmbed` component. It adds Astro's [`base`](/guides/deploy/) to the deck's URL for you.

```astro
---
import DeckEmbed from "@astlide/astro/components/DeckEmbed.astro";
---

<DeckEmbed deck="my-talk" />
<DeckEmbed deck="my-talk" start={3} controls title="My talk" />
```

It works in `.mdx` pages too. When JavaScript isn't available, a link to the deck is shown instead.

| Prop | Default | |
| --- | --- | --- |
| `deck` | — | Deck name (its folder under `src/content/decks/`) |
| `start` | `1` | Slide to show first |
| `controls` | `false` | Show previous / next buttons, a slide counter and a fullscreen button below the deck |
| `title` | deck name | Accessible name of the frame, read out by screen readers |
| `class` | — | Extra CSS class |

## In any other page

Import the element once, then point `src` at the deck's root URL:

```html
<script type="module">
  import "@astlide/core/embed";
</script>

<astlide-deck src="https://example.com/talks/my-talk/" start="2" controls></astlide-deck>
```

The import needs a bundler such as Vite, or a framework that bundles your scripts.

Whether `src` ends in a slash decides the slide URLs. `…/my-talk/` loads `…/my-talk/2/`, and `…/my-talk` loads `…/my-talk/2`. Match the way the deck's site was built. With Astro's default `directory` format, use the trailing slash.

### Attributes

| Attribute | Default | |
| --- | --- | --- |
| `src` | required | URL of the deck root. Either an absolute `http` / `https` URL or a URL relative to the page. Other schemes, such as `javascript:`, are ignored |
| `start` | `1` | Slide to show first. If you change it later, the deck moves to that slide |
| `controls` | off | Show the control bar: previous, slide counter, next, fullscreen |
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

You can call the methods before the deck has loaded. The calls wait and run once the deck is ready.

The element can take keyboard focus itself. While it has focus, ← / →, Page Up / Down, Space, Home, End and `f` (fullscreen) work as well.

### Events

The element fires `slidechange` once when the deck has loaded, and again every time the slide or step changes. The event bubbles. Its `event.detail` looks like this:

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

The element is a block as wide as its container, with a 16:9 frame. If your deck has a different shape, set `--astlide-aspect-ratio`:

```css
astlide-deck {
  max-width: 960px;
  --astlide-aspect-ratio: 4 / 3;
}
```

To style the inner parts, use `::part(frame)`, `::part(iframe)` and `::part(controls)`.

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

The ref points at the `<astlide-deck>` element, so you can use the methods and properties above. The component also renders on the server (Next.js, Remix and so on), and the element starts working once it reaches the browser. `react` is an optional peer dependency of `@astlide/core`.

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

The `slidechange` handler receives the event's `detail`. Through the component ref you can call `next()`, `prev()`, `goTo(n)` and `requestFullscreen()`, and reach the element itself as `element`. The component also renders on the server (Nuxt and so on). `vue` is an optional peer dependency of `@astlide/core`.

## How it works

The element and the deck talk to each other with `postMessage`. Both sides limit what they accept:

- The deck page listens only when it is inside a frame, and only to its parent window. It sends its state only to the origin of the page that first contacted it.
- The element accepts messages only from its own iframe, and only from the deck's origin.
- The messages can only move around within the deck.

You can embed a deck hosted on another domain if that server allows framing. Check whether it sends `X-Frame-Options` or a Content Security Policy with `frame-ancestors`. To control who can embed your own decks, see [Framing and headers](/reference/configuration/#framing-and-headers).
