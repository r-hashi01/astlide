# @astlide/core

## 2.4.0

### Minor Changes

- [#77](https://github.com/r-hashi01/astlide/pull/77) [`8fd972f`](https://github.com/r-hashi01/astlide/commit/8fd972f5ffde913411aeb31d2b2101eaf8bf227e) Thanks [@r-hashi01](https://github.com/r-hashi01)! - - `<ImageSide src>` and image `background`s with a root-relative path (`/photo.jpg`) now resolve against Astro's `base`, so decks with images work under a sub-path. New helper `withBaseIfRootRelative` in `@astlide/core/utils/base-path`.
  - `two-column` layout: a title (or anything other than `<Left>` / `<Right>`) now spans the full width above the columns instead of becoming a third column.
  - `class: text-light` / `text-dark` now also recolor headings (they previously kept the theme's heading color, e.g. dark titles on `image-full` backgrounds).

## 2.3.0

### Minor Changes

- [#69](https://github.com/r-hashi01/astlide/pull/69) [`7434035`](https://github.com/r-hashi01/astlide/commit/7434035d63c42bf646bfa34c03f1b9bf80e72044) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Support Astro's `base` option for sub-path deployments (e.g. GitHub Pages project sites). Navigation, toolbar and presenter links, the deck index, hidden-slide redirects, overview thumbnails, the presenter preview and in-browser PDF export now resolve against `base` instead of the site root.

- [#65](https://github.com/r-hashi01/astlide/pull/65) [`d06ebcd`](https://github.com/r-hashi01/astlide/commit/d06ebcdbef4994eb7a70ead6282cea35f4cdca6b) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Finer-grained reveals:

  - `<Fragment until={n}>` hides a fragment again at step `n`; `<Fragment hide>` starts visible and disappears at its step.
  - Fragments sharing an `index` now reveal together (previously each took its own step).
  - New `<Fragments>` component reveals each list item (or child element) one step at a time.
  - Fragment and code highlight steps are now synced between the presenter and audience windows — previously only slide changes were, so reveals made from the presenter window never reached the audience.

- [#64](https://github.com/r-hashi01/astlide/pull/64) [`01b823a`](https://github.com/r-hashi01/astlide/commit/01b823ac274314ccd90ea9aa4136e3d0ed7c9974) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Render Mermaid diagrams from ```mermaid code fences. `mermaid` is an optional dependency (`bun add mermaid`) loaded only on slides that contain a diagram. Diagrams follow the deck theme, scale labels to the slide's text size, and are awaited by the PDF exporters. Without `mermaid` — or on a syntax error — the source is shown as code.

- [#67](https://github.com/r-hashi01/astlide/pull/67) [`e7b3ce4`](https://github.com/r-hashi01/astlide/commit/e7b3ce4d54b6b38df9050833735337889dc4f533) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Add a pen and a laser pointer. Press `d` (or the `draw` toolbar action) to draw on the slide — `c` clears the current slide's drawing — and `l` (or `laser`) for a laser pointer; `Esc` exits. Drawings are kept per slide while you navigate, and both strokes and the pointer are mirrored between the presenter and audience windows, so you can annotate from the presenter screen. Colors follow `--astlide-pen-color` / `--astlide-laser-color`.

### Patch Changes

- [#70](https://github.com/r-hashi01/astlide/pull/70) [`da42b66`](https://github.com/r-hashi01/astlide/commit/da42b66bca4014e85c0d7b880d158cb6e3270b10) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Expose the exporters as commands: `bunx astlide-export` (PDF / PNG) and `bunx astlide-export-pptx` (PowerPoint). They were documented but not registered as package `bin`s, so they couldn't be run from a project. Both run with Bun.

- [#66](https://github.com/r-hashi01/astlide/pull/66) [`aca4822`](https://github.com/r-hashi01/astlide/commit/aca482248b2dccecfb76454e086aa21f994b4b7f) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Fix navigation after returning to a previously visited slide. Astro's ClientRouter skips inline scripts whose text already ran, so the deck runtime of a revisited slide never re-ran and kept the last slide's state — e.g. pressing → on slide 2 after visiting slide 3 jumped to slide 4, and scaling/fragments/notes were stale. The script is now marked `data-astro-rerun`.

## 2.2.0

### Minor Changes

- [#61](https://github.com/r-hashi01/astlide/pull/61) [`827565d`](https://github.com/r-hashi01/astlide/commit/827565d59b110143a765e1a6bda2b514949935e0) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Add a go-to-slide dialog: press `g` (or add `goto` to `toolbar`) to jump by slide number or search slide titles, `↑`/`↓` to pick and `Enter` to go. Titles come from frontmatter `title`, else the slide's first heading (Markdown or HTML).

## 2.1.0

### Minor Changes

- [#50](https://github.com/r-hashi01/astlide/pull/50) [`979a01e`](https://github.com/r-hashi01/astlide/commit/979a01ea76769ff392d064d873a082d67fecf401) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Add line highlighting for code fences. `{2,4-6}` after the language highlights those lines and dims the rest; `{1|3-5|all}` steps through the ranges on → / Space, sharing one sequence with `<Fragment>` reveals. Works in `.mdx` and `.md` slides. The Shiki transformer is also exported as `astlideCodeHighlight` from `@astlide/core/utils/code-highlight`.

  Also fixes the print view (`/[deck]/all`, used for PDF export) rendering `<Fragment>` content invisible — fragments and code steps now appear in their final state.

- [#59](https://github.com/r-hashi01/astlide/pull/59) [`b1fa5b6`](https://github.com/r-hashi01/astlide/commit/b1fa5b60ed7630d80f149e60f5b26070b717d6ae) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Upgrade `@astrojs/mdx` to 8. It requires Astro 7.2.10 or later, so the `astro` peer dependency is now `^7.2.10` (was `^7.0.0`), and `create-astlide` scaffolds projects with the same range.

- [#57](https://github.com/r-hashi01/astlide/pull/57) [`30bdcc2`](https://github.com/r-hashi01/astlide/commit/30bdcc24e3bf9e55fe5f14735b5f4b048d2dd1a0) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Presenter mode shows a live preview of the next slide (or "End of deck") and how many steps — `<Fragment>` reveals and code highlight steps — remain on the current slide.

  Slides rendered inside an iframe now switch to an embed mode: no toolbar/progress bar, and no keyboard, touch or presenter-sync handling. This also fixes overview (`o`) thumbnails, whose styles were never applied (they are created by script, so Astro's scoped CSS didn't match) and which could follow the presenter's navigation broadcasts.

## 2.0.0

### Major Changes

- [#47](https://github.com/r-hashi01/astlide/pull/47) [`f9b22b5`](https://github.com/r-hashi01/astlide/commit/f9b22b50232ac0815ccabc3089976525e61462ea) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Support Astro 7 (drops Astro 6).
  - `astro` peer dependency is now `^7.0.0`, and `@astrojs/mdx` is bumped to `^7.0.3` (which requires Astro 7).
  - The built-in `Fragment` slide component is now registered under an alias internally, since Astro 7's compiler injects its own `Fragment` binding into every `.astro` file. MDX usage (`<Fragment>`) is unchanged.
  - `create-astlide` scaffolds projects on Astro 7.

### Patch Changes

- [#44](https://github.com/r-hashi01/astlide/pull/44) [`ee8f7e3`](https://github.com/r-hashi01/astlide/commit/ee8f7e32f181f270372db8df7350463582f681e3) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Fix `astlide export pptx` frontmatter parsing with js-yaml 5, which no longer provides a default export. `@types/js-yaml` is dropped since js-yaml 5 ships its own types.

## 1.0.1

### Patch Changes

- [#25](https://github.com/r-hashi01/astlide/pull/25) [`d4a6ac8`](https://github.com/r-hashi01/astlide/commit/d4a6ac8077837422ec2d2bc9fdd4f53cdeddd87b) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Add `injectIndexRoute` option and auto-skip the `/` index route when you have your own home page.

  Astlide injects a deck-index page at `/`. If your project has its own
  `src/pages/index.{astro,md,mdx,html}`, that previously produced an Astro route
  collision warning (a hard error in future Astro).
  - **Default (auto):** the `/` route is injected only when no user index page
    exists — a custom home page now works out of the box, no collision.
  - `injectIndexRoute: false` — never inject; you own `/`.
  - `injectIndexRoute: true` — always inject, even alongside your own index.

## 1.0.0

### Major Changes

- [`b0ded22`](https://github.com/r-hashi01/astlide/commit/b0ded22c58a4fa99beb3c24905c82f35152826e2) Thanks [@r-hashi01](https://github.com/r-hashi01)! - v1.0.0 — upstream feedback from real-world deck usage.

  **Multi-format slides: MDX, Markdown, and HTML**
  - New `astlideDeckLoader()` (exported from `@astlide/core`, also at
    `@astlide/core/loader`) renders slides authored as `.mdx`, `.md`, **or
    `.html`** from one deck directory. MDX/Markdown are delegated to Astro's
    built-in loader; `.html` files are ingested as pre-rendered content (inline
    `<style>`/markup preserved, same trust level as MDX) and share the MDX id
    scheme so numbered files interleave regardless of extension. `.html` slides
    accept the same frontmatter as `.mdx`.

  **Composable navigation toolbar (`toolbar` option)**
  - New `toolbar?: ToolbarItem[]` option composes the floating `.slide-nav` from
    ordered action IDs: `home` `prev` `counter` `next` `notes` `overview`
    `presenter` `fullscreen` `print` `share` `download` `spacer`.
  - New `home` action links back to the deck index (`/`). The toolbar now reveals
    on hover **and** keyboard focus (`:focus-within`), and stays visible on touch
    devices (`@media (hover: none)`) so the return path is always reachable.

  **Speaker notes render as Markdown**
  - Frontmatter `notes` are now run through remark/rehype before sanitizing, so
    `**bold**`, lists, links, and `code` render in the presenter panel and notes
    overlay. Adds `rehype-stringify` dependency and `utils/markdown`.

  **Layouts can be registered as components**
  - `LayoutContribution.componentEntrypoint` is now live: a plugin-contributed
    layout component owns the slide markup via `virtual:astlide/layouts`, instead
    of only toggling a `.slide-<name>` CSS class.

  **Every-slide decorators (no more hand-placed extras)**
  - New `slideDecorators` option and plugin `decorators` contribution render a
    component on every slide (logo / footer / page number / home link) via
    `virtual:astlide/decorators` — no need to place it in each MDX/HTML file.

  **Typed deck/slide metadata API**
  - New `@astlide/core/context`: `getDeckContext(Astro)` (server) and
    `getClientDeckContext()` (browser, backed by `window.__astlide`) expose the
    current deck name, slide number, total, layout, transition, and parsed config
    — replacing `document.title`/`body.dataset` scraping.

  **Theme-adjustable chrome (fewer `!important` overrides)**
  - Progress bar, nav toolbar, and presenter panel read CSS custom properties
    (`--astlide-progress-color`, `--astlide-nav-bg`, `--astlide-nav-btn-bg`,
    `--astlide-nav-fg`, `--astlide-presenter-bg/-fg/-accent/-width`, …) with
    fallbacks to the current defaults.

  **`create-astlide deck <name>` scaffolder**
  - New subcommand generates a deck folder (`_config.json` + cover/content/end
    slides) in an existing project. `--theme` and `--format mdx|md|html` flags.

  **PDF export**
  - CLI exporter now emits a single multi-page PDF from the new `/[deck]/all` print
    route instead of merging per-page with `pdf-lib` (removes the `pdf-lib` optional
    dependency). This is the stable export path.
  - In-browser "download PDF" (`download` toolbar action) is **experimental** — it
    depends on the pre-1.0 optional `@astlide/crispdf` and its output may change.

  **Theming hooks**
  - New `font` option to override or disable the injected web-font stylesheet.
  - Presenter notes font-size controls.

## 0.1.1

### Patch Changes

- [`859d98f`](https://github.com/r-hashi01/astlide/commit/859d98f20c5b7a0652d35b3cb36e6f0c126843b1) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Sync `engines.node` to `>=22.12.0` (Astro 6 requirement) and drop `publishConfig.provenance: true` (provenance is now driven by Trusted Publishing OIDC, no need for the package.json hint that was breaking local `npm publish` when not running under GitHub Actions OIDC).

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
- **Node**: `>=22.12.0` (required by Astro 6).
- **Package manager**: bun is the source-of-truth; npm/pnpm/yarn work for consumers.

### Distribution

This package is shipped **source-only** — TypeScript and `.astro` files are published as-is and consumed through Astro's Vite pipeline. No build step is required by consumers.
