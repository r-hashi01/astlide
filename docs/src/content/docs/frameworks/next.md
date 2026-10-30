---
title: Next.js
description: Serve a folder of Astlide decks as pages of a Next.js app, with the presenter window, the print view and PDF / PPTX export.
---

`@astlide/next` turns a folder of decks into pages of a Next.js app (App Router). The decks are the same files as in an Astro site: `_config.json` and numbered `.mdx`, `.md`, `.html` and `.pptx` slides.

You need Next.js 15 or later and React 19.

## Set up

Install the package. Add `mermaid` too if your slides have ```` ```mermaid ```` diagrams:

```bash
bun add @astlide/next
bun add mermaid   # optional
```

Wrap your Next config with `withAstlide`:

```js
// next.config.mjs
import { withAstlide } from "@astlide/next/config";

export default withAstlide({});
```

Create the routes for a folder of decks, then add three pages that use them:

```ts
// lib/decks.ts
import { createDeckRoutes } from "@astlide/next";

export const decks = createDeckRoutes({ dir: "decks", basePath: "/decks" });
```

```tsx
// app/decks/page.tsx: the list of decks
import { decks } from "@/lib/decks";

export default decks.IndexPage;
```

```tsx
// app/decks/[deck]/[slide]/page.tsx: one slide
import { decks } from "@/lib/decks";

export const generateStaticParams = decks.slideParams;
export const generateMetadata = decks.slideMetadata;
export default decks.SlidePage;
```

```tsx
// app/decks/[deck]/all/page.tsx: the print view (PDF, PPTX, printing)
import { decks } from "@/lib/decks";

export const generateStaticParams = decks.deckParams;
export const generateMetadata = decks.printMetadata;
export default decks.PrintPage;
```

`basePath` must match the folder the pages are in, here `app/decks/`. To serve the decks at the root of the app, leave `basePath` out and put the pages in `app/`.

Finally, load the styles in the root layout:

```tsx
// app/layout.tsx
import "@astlide/next/styles";
import { AstlideMermaid } from "@astlide/next/mermaid";
import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AstlideMermaid />
        {children}
      </body>
    </html>
  );
}
```

Leave out `<AstlideMermaid />` if you didn't install `mermaid`. Diagrams then show their source.

Load the fonts with a `<link>` in the layout's `<head>`:

```tsx
<head>
  <link
    rel="stylesheet"
    href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;700&display=swap"
  />
</head>
```

With `next/font`, the built-in themes don't get the fonts.

Put a deck in `decks/my-talk/` and open `/decks/my-talk/1`.

## Options

`createDeckRoutes()` takes:

| Option | Default | Description |
|---|---|---|
| `dir` | `"decks"` | The folder with the deck folders, relative to the project root. |
| `basePath` | `""` | The URL path the deck pages are under. |
| `trailingSlash` | `false` | Set it to the same value as `trailingSlash` in your Next config. |
| `toolbar` | prev, counter, next | The toolbar buttons, as in the Astro integration's [`toolbar`](/reference/configuration/) option. |
| `shikiTheme` | `"github-dark"` | The Shiki theme for code blocks. |
| `showHidden` | in development | Show slides marked `hidden: true`. |

After editing a deck in production, restart the server. In development, edits show up on reload.

## Writing slides

Slides work as in an Astro site. The layouts, frontmatter, fragments, code highlighting, math, Mermaid and speaker notes are all the same. In MDX you can use Astlide's components without importing them: `Columns`, `Left`, `Right`, `ImageSide`, `TextPanel`, `Fragment`, `Fragments`, `SpeakerNotes` (or `Notes`), `CodeBlock`, `Math`, `YouTube` and `Tweet`. Hidden slides keep their number and are skipped in production, as in Astro.

The presenter window, overview, go-to dialog, pen, laser pointer and notes overlay work as well, with the same keys.

## Export

Run the app, then point `astlide export` at it. Include `basePath` in the URL:

```bash
bun run build && bun run start
bunx astlide export my-talk --pdf --pptx --png --base-url http://localhost:3000/decks
```

PPTX doesn't come out right from the development server. Use the production server (`next start`).

## Compared with the Astro integration

- Only the seven built-in themes are available. Plugins (custom themes, layouts, transitions, decorators) and [PowerPoint templates as themes](/guides/templates/) are Astro-only for now.
- The Astro integration's `font`, `favicon`, `csp` and `slideScripts` options have no counterpart. `<script>` tags in Markdown, HTML and PowerPoint slides are removed.
- The live slide editor (`e` in development) is Astro-only.
