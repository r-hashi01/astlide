# @astlide/next

Astlide for Next.js (App Router): a folder of [Astlide](https://astlide.dev) decks — `_config.json` and numbered `.md` / `.mdx` / `.html` / `.pptx` slides, the same files as an Astlide site — as pages, with the presenter window, overview, pen and laser, notes and the print view.

```js
// next.config.mjs
import { withAstlide } from "@astlide/next/config";
export default withAstlide({});
```

```ts
// lib/decks.ts
import { createDeckRoutes } from "@astlide/next";
export const decks = createDeckRoutes({ dir: "decks" });

// app/[deck]/[slide]/page.tsx
export const generateStaticParams = decks.slideParams;
export const generateMetadata = decks.slideMetadata;
export default decks.SlidePage;

// app/[deck]/all/page.tsx (print view: PDF export, printing)
export const generateStaticParams = decks.deckParams;
export default decks.PrintPage;
```

```tsx
// app/layout.tsx
import "@astlide/next/styles";
import { AstlideMermaid } from "@astlide/next/mermaid"; // with `mermaid` installed, for diagrams
```

MDX slides are compiled with Astro's MDX engine and rendered on the server with `@astlide/react`; moving between slides uses Next's router. `astlide export <deck> --pdf --png --base-url <your Next site>` exports from a running site.

Not published yet: part of the work towards Astlide 3. See `playground-next/` for a working app.
