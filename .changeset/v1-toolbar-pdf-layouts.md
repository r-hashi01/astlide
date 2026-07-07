---
"@astlide/core": major
---

v1.0.0 — upstream feedback from real-world deck usage.

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

**First-class PDF export**
- In-browser "download PDF" via `@astlide/crispdf` (optional dependency) wired to
  the `download` toolbar action, plus a new `/[deck]/all` print route. The CLI
  exporter now emits a single multi-page PDF from `/all` instead of merging with
  `pdf-lib` (removes the `pdf-lib` optional dependency).

**Theming hooks**
- New `font` option to override or disable the injected web-font stylesheet.
- Presenter notes font-size controls.
