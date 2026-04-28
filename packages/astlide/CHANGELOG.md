# @astlide/core

## 0.1.0

Initial public release.

### Highlights

- **Astro 6 Integration**: drop-in `astlide()` integration that injects `/[deck]/[slide]` and `/` routes, auto-adds `@astrojs/mdx`, configures Shiki, and warns when content collections are not set up.
- **MDX-authored slides**: zod-validated frontmatter via `slideSchema` (`slideLayout`, `transition`, `title`, `background`, `notes`, `hidden`, `class`).
- **10 built-in slide layouts**: `default`, `cover`, `section`, `two-column`, `image-full`, `image-left`, `image-right`, `code`, `quote`, `statement`.
- **7 built-in themes**: `default`, `dark`, `minimal`, `corporate`, `gradient`, `rose`, `forest`.
- **Components**: `<Slide>`, `<Fragment>`, `<Left>`, `<Right>`, `<ImageSide>`, `<TextPanel>`, `<Notes>`, `<Columns>`, `<CodeBlock>`, `<Math>` (KaTeX SSR), `<YouTube>`, `<Tweet>`.
- **DeckLayout**: viewport scaling, keyboard navigation, fragment reveals, presenter window with timer + speaker notes, overview mode, notes overlay, touch swipe, BroadcastChannel sync between presenter and main windows, View Transitions–driven slide transitions.
- **Plugin API** (`@astlide/core/plugin`): `defineAstlidePlugin()` lets external packages contribute themes, layout names, transition names, and Shiki languages/themes. Built-in 7 themes are registered through the same path. Theme CSS is loaded via the `virtual:astlide/themes` Vite virtual module.
- **Schema relaxation for plugin extensibility**: `slideLayout`, `transition`, and deck `theme` accept any string. Unknown names trigger a dev-only console warning + on-screen overlay rather than failing validation.
- **Dev-only error overlay**: surfaces `_config.json` parse failures and unknown layout/theme/transition names directly on the slide. Dismissable, persistent across the session.
- **Security hardening**: default CSP meta tag, `noindex,nofollow` opt-out via `astlide({ indexable: true })`, server + client HTML allowlist sanitisation for speaker notes, CSS pattern blocklist on `background` frontmatter (blocks `expression()`, `javascript:` / `vbscript:` URLs, `data:image/svg+xml`, `@import`, `behavior:`), KaTeX output sanitisation that preserves SVG/inline-style while stripping scripts and event handlers.
- **Accessibility**: skip link, `aria-live` slide announcer, semantic landmarks (`role="main"` / `region` / `dialog` / `complementary`), `aria-roledescription="slide"` per slide, `aria-disabled` on disabled nav buttons, `prefers-reduced-motion` support across all animations.
- **Static export niceties**: OG meta tags, `noindex,nofollow` by default, `<link rel="prefetch">` for the next slide, KaTeX font preload.
- **CLI exporters**:
  - `astlide-export-pdf` — Playwright-based, multi-page PDF via pdf-lib, configurable viewport / base URL.
  - `astlide-export-pptx` — MDX → HAST → OOXML pipeline, no browser dependency, all 10 layouts and 7 themes mapped to PPTX slide geometries.
- **Tests**: 364 tests across schema validation, sanitisation, integration, plugin resolution, OOXML output, MDX parsing, hast building, theme mapping, API stability snapshots, and Astro component rendering. Visual regression suite (pixelmatch) runs on macOS via a dedicated weekly workflow.

### Known limitations

- Documentation site is forthcoming. The README and TSDoc comments are the current source of truth.
- Visual regression baselines are macOS-only; CI runs them on `macos-latest` weekly.
- `astro-components.test.ts` runs in a separate `vmThreads` vitest project to avoid an upstream `getViteConfig` + worker fork deadlock.

### Compatibility

- **Astro**: `^6.0.0` (peer dependency). Tested against 6.0.8 and 6.1.9 in CI.
- **Node**: `>=20.0.0`.
- **Package manager**: bun is the source-of-truth; npm/pnpm/yarn work for consumers.

### Distribution

This package is shipped **source-only** — TypeScript and `.astro` files are published as-is and consumed through Astro's Vite pipeline. No build step is required by consumers.
