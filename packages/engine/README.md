# @astlide/engine

Lay out HTML + CSS slides without a browser.

The engine behind [Astlide](https://github.com/r-hashi01/astlide)'s `astlide export --pptx`: it reads a built page, applies its CSS, and computes where every box, line of text, list marker, image and background goes — the geometry an editable PowerPoint needs — with no Chromium.

- **Layout:** block and inline flow, flexbox and grid (via [Yoga](https://www.yogalayout.dev/)), tables, `::before` / `::after`, `aspect-ratio`, `min()` / `max()` / `clamp()`, overflow clipping, nested `<iframe srcdoc>` documents.
- **Text:** font selection from `font-family` (with generic families), glyph measuring and kerning via [fontkit](https://github.com/foliojs/fontkit), line breaking like Chromium for `white-space`, `overflow-wrap`, `text-transform` and `text-decoration`.
- **Scene:** `toScene()` flattens a layout into paint-ordered rectangles, gradients, hatches, images and text runs.
- **Diagrams:** Mermaid rendered to SVG / PNG without a browser.

```ts
import { FontRegistry, layoutPage, loadFontFaces, pageCss, toScene } from "@astlide/engine";

const fonts = new FontRegistry();
loadFontFaces(fonts, pageCss(html, dist), dist);
const [slide] = layoutPage(html, dist, fonts, { width: 1920, height: 1080, media: "screen" });
const scene = toScene(slide);
```

It is developed for Astlide and versioned with it; the API may change between minor versions.

## License

MIT
