# @astlide/core

## 3.0.0

### Major Changes

- [#275](https://github.com/r-hashi01/astlide/pull/275) [`3b73a63`](https://github.com/r-hashi01/astlide/commit/3b73a63d1ce05a8452136c0dc570151dfb3b1e59) Thanks [@r-hashi01](https://github.com/r-hashi01)! - **Breaking:** the Astro integration moves out of `@astlide/core` into the new `@astlide/astro`. `@astlide/core` is now the framework-agnostic core: deck reader, rendering and exports, deck runtime, styles, PowerPoint, template stores, the `astlide` CLI and the MCP server. The React, Next.js, Vue and Nuxt packages build on it too.

  To migrate an Astro project:

  1. Install `@astlide/astro` in place of `@astlide/core`. It installs the core and the `astlide` command.
  2. In `astro.config.mjs`, change `import astlide from "@astlide/core"` to `import astlide from "@astlide/astro"`.
  3. In `src/content.config.ts`, import `astlideDeckLoader` and `slideSchema` from `@astlide/astro`, and `@astlide/core/loader` becomes `@astlide/astro/loader`.
  4. Component imports change from `@astlide/core/components/*.astro` to `@astlide/astro/components/*.astro`.

  These stay in `@astlide/core`: `@astlide/core/schema`, `/plugin`, `/context`, `/styles/*`, `/deck`, `/render`, `/runtime`, `/pptx`, `/templates`, `/embed` and `/mcp`. Plugins keep importing `defineAstlidePlugin` from `@astlide/core/plugin`. The `@astlide/core` entry point no longer has the integration or `astlideDeckLoader`. It keeps the schemas, the plugin API and the deck metadata functions.

- [#284](https://github.com/r-hashi01/astlide/pull/284) [`6dd1add`](https://github.com/r-hashi01/astlide/commit/6dd1adda4bc3d5aba7e2710ece77c72c510e216c) Thanks [@r-hashi01](https://github.com/r-hashi01)! - **Breaking:** `@astlide/core` no longer exports `./internal/*` and `./utils/*` as wildcards. Every entry point is now listed in its `exports`.
  - `@astlide/core/internal/diagrams`, `internal/recording` and `internal/pdf-export` become `@astlide/core/runtime/diagrams`, `runtime/media` and `runtime/pdf-export`.
  - `utils/csp`, `utils/favicon`, `utils/pptx-templates` and `utils/slide-mark` move into `@astlide/astro`, the only package that uses them. Its internals are not public API.
  - Still available: `utils/base-path`, `code-highlight`, `mermaid`, `sanitize`, `safe-url` and `slide-title`, plus the helpers the framework packages share (`comment-notes`, `markdown`, `notes`, `export-build`, `pptx-assets`, `slide-scripts`, `network`).
  - Imports with a `.ts` extension (`@astlide/core/utils/network.ts`) no longer resolve. Drop the extension.

- [#291](https://github.com/r-hashi01/astlide/pull/291) [`934761a`](https://github.com/r-hashi01/astlide/commit/934761af53671800510c22a62bfff7bf38c7e506) Thanks [@r-hashi01](https://github.com/r-hashi01)! - `@astlide/core` no longer references Vite. Its two Vite plugins, `astlideCommentNotesPlugin` (from `utils/comment-notes`) and `astlideSlideScriptsPlugin` (from `utils/slide-scripts`), move into `@astlide/astro`, the only package that uses them.

### Minor Changes

- [#269](https://github.com/r-hashi01/astlide/pull/269) [`9360c4a`](https://github.com/r-hashi01/astlide/commit/9360c4a7a0fb686bc0570c6ea84f62ad303ba2af) Thanks [@r-hashi01](https://github.com/r-hashi01)! - The slide components' styles (Columns, Left / Right, ImageSide, TextPanel, Fragment, SpeakerNotes, CodeBlock, Math, YouTube, Tweet) are now one stylesheet, `@astlide/core/styles/components.css`, for every framework. Each component's root element carries `data-astlide-c` and every rule goes through it, so — as with Astro's scoped styles before — they never reach an element of yours that uses the same class name. Slides look the same.

- [#264](https://github.com/r-hashi01/astlide/pull/264) [`98cf488`](https://github.com/r-hashi01/astlide/commit/98cf4884d30042a04f14bf5eba91f5ebd3f3d9ba) Thanks [@r-hashi01](https://github.com/r-hashi01)! - The markup and styles around a slide (toolbar, presenter panel, notes, overview, go-to and PDF overlays) are now framework-agnostic too: `@astlide/core/runtime/chrome` renders them as HTML strings and `@astlide/core/styles/deck.css` styles them (experimental, for the upcoming React / Next / Vue packages). Slide pages look and behave the same; the styles still never reach slide content.

- [#279](https://github.com/r-hashi01/astlide/pull/279) [`dcf7d27`](https://github.com/r-hashi01/astlide/commit/dcf7d2735570147aa26182e6d4c1a8bb68309d5d) Thanks [@r-hashi01](https://github.com/r-hashi01)! - `@astlide/core/deck/pages` adds `slidePage(deck, n)` and `printSlides(slides)`. They decide, the same way for every framework, which slide is page `n`, where navigation goes, the go-to outline, the deck context and the slides of the print view. Hidden slides keep their number and redirect onward in production. The Astro, Next.js and Nuxt pages all use them, so Next.js and Nuxt now number hidden slides as Astro does. Before, they renumbered the rest.

- [#265](https://github.com/r-hashi01/astlide/pull/265) [`88146fa`](https://github.com/r-hashi01/astlide/commit/88146fa594347d93dd987b0527b18af56da05763) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Read decks without Astro: `readDeck(dir)` / `readDecks(base)` from `@astlide/core/deck` (experimental) return a deck's config and its slides in order, with validated frontmatter, title, speaker notes and, for `.md` / `.html` / `.pptx` slides, the HTML an Astlide site renders (Astro's Markdown processor with Astlide's code steps and Mermaid fences). `.mdx` slides come back as source for the host's MDX setup.

- [#262](https://github.com/r-hashi01/astlide/pull/262) [`c1fb41f`](https://github.com/r-hashi01/astlide/commit/c1fb41f7b97b77af936295b70ad69a3b0a7f5102) Thanks [@r-hashi01](https://github.com/r-hashi01)! - The slide page's browser code (scaling, navigation, fragments and code steps, presenter sync, pen and laser, overview, go-to, notes, timer, PDF download, embedding) is now a module, `@astlide/core/runtime` (`mountDeck(config, { navigate })`, experimental), instead of an inline script on every slide page. Slide pages load it as one cached script and pass their settings as JSON. No change in behavior.

- [#277](https://github.com/r-hashi01/astlide/pull/277) [`10167df`](https://github.com/r-hashi01/astlide/commit/10167df9b3adc6b569c3c4aabd282d7cd4b4cb12) Thanks [@r-hashi01](https://github.com/r-hashi01)! - `astlide export --base-url` works for sites built without Astro (Next.js, Nuxt, React, Vue). Outside an Astro project, every format comes from the running site. PDF and PNG are rendered from its pages. PPTX is made from its print view (`/<deck>/all`), with the same engine and output as an Astro build. A deck is checked against the site instead of `src/content/decks`. Use the site's production server for PPTX.

- [#272](https://github.com/r-hashi01/astlide/pull/272) [`20c416d`](https://github.com/r-hashi01/astlide/commit/20c416d9cd0266cb0384aa0d30e4021fe1cfcd34) Thanks [@r-hashi01](https://github.com/r-hashi01)! - More groundwork for React / Next.js (experimental):

  - `renderDeck` renders MDX slides with a `renderMdx` (`renderMdxToHtml` from `@astlide/react`) and takes the site's `publicDir` for root-relative pictures; the print view gets the components' and KaTeX's styles.
  - The print view's styles are `@astlide/core/styles/print.css`, written so slides may sit in a framework's wrappers (`/<deck>/all` looks the same).
  - `mountDeck(config, { placeSlide: false })` leaves the presenter window's slide where the host rendered it.

- [#282](https://github.com/r-hashi01/astlide/pull/282) [`8f12d72`](https://github.com/r-hashi01/astlide/commit/8f12d72c0476b9a2e7b286a2eff84b7915a7931f) Thanks [@r-hashi01](https://github.com/r-hashi01)! - `@astlide/core/deck/print-view` defines what a deck's print view (`/<deck>/all`) states about itself, the same way in every framework:
  - `printViewAttributes(config)` gives the `<html>` attributes.
  - `printViewMeta(deck)` gives the `astlide:title`, `astlide:author` and `astlide:theme` meta tags.
  - `readPrintViewMeta()` reads those tags back.

  The Astro, Next.js and Nuxt print views and `renderDeck` all write them, and `astlide export --pptx --base-url` reads them. Before, each framework had its own way (`<title>`, `<meta name="author">`, a Next.js-only `astlide:theme`). The CLI's export is split into one path for an Astro project and one for a running site.

- [#270](https://github.com/r-hashi01/astlide/pull/270) [`43f1d72`](https://github.com/r-hashi01/astlide/commit/43f1d7229a7cf87ad1391d64669d6747fcaf165e) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Groundwork for React, Next.js and Vue (experimental):

  - `compileSlideMdx` / `evaluateSlideMdx` (`@astlide/core/deck`): MDX slides compiled with Astro's own MDX engine and Astlide's Shiki transformers for any JSX runtime (`react`, `vue` …), so the same `.mdx` slides render the same outside Astro. `readDeck` now reads an MDX slide's trailing comment as its notes, and `renderNotesHtml` renders notes for the presenter.
  - The deck runtime exports `applyPageFlags`, and keeps a slide the host already placed in the presenter panel; `backgroundDeclarations` gives a slide's background as declarations.
  - Diagrams render through `renderDiagramsWith(loadMermaid)` outside Astro; `base-path` works where `import.meta.env` doesn't exist.

- [#267](https://github.com/r-hashi01/astlide/pull/267) [`6f0433f`](https://github.com/r-hashi01/astlide/commit/6f0433fbd76b7f8a571305425dbab5601e2fad26) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Export a deck folder without Astro: `renderDeck({ dir, format: "pptx" | "pdf" | "png", output, template? })` from `@astlide/core/render` (experimental) reads the deck, writes its print view with the same markup and styles as an Astlide site, and runs the same exporters as `astlide export` (the layout engine for PPTX, Chromium for PDF / PNG). Markdown, HTML and PowerPoint slides; MDX and slide decorators still need a build.

- [#266](https://github.com/r-hashi01/astlide/pull/266) [`d041996`](https://github.com/r-hashi01/astlide/commit/d0419962f4af0bb6fc003e07131bce671b77ddc4) Thanks [@r-hashi01](https://github.com/r-hashi01)! - A slide's own markup and styles are framework-agnostic too: `@astlide/core/runtime/slide` renders the `<section class="slide …">` around a slide's content (layout classes, background, PowerPoint template artwork and number) and `@astlide/core/styles/slide.css` styles it (experimental). `Slide.astro` uses both; slides look the same.

### Patch Changes

- [#285](https://github.com/r-hashi01/astlide/pull/285) [`310ace6`](https://github.com/r-hashi01/astlide/commit/310ace6e12b9520b812bdf3847137ddc680bfdc4) Thanks [@r-hashi01](https://github.com/r-hashi01)! - `astlideMermaid()` now type-checks as a Shiki transformer (`ShikiTransformer`) in your own Shiki setup. Its return type was too loose for hast's types. The code is unchanged.

- [#291](https://github.com/r-hashi01/astlide/pull/291) [`934761a`](https://github.com/r-hashi01/astlide/commit/934761af53671800510c22a62bfff7bf38c7e506) Thanks [@r-hashi01](https://github.com/r-hashi01)! - PPTX export of Mermaid diagrams works with pnpm and other isolated installs. Before, it failed with "dompurify (a dependency of mermaid) not found".

- [#268](https://github.com/r-hashi01/astlide/pull/268) [`732b7ab`](https://github.com/r-hashi01/astlide/commit/732b7ab4807c117d50e62d03fa4a8b951c9d442b) Thanks [@r-hashi01](https://github.com/r-hashi01)! - `renderDeck` takes a `tempDir` for its print view while it renders (default: the OS's temp folder).

## 2.11.0

### Minor Changes

- [#252](https://github.com/r-hashi01/astlide/pull/252) [`597a195`](https://github.com/r-hashi01/astlide/commit/597a19564d7fdce4d399b790fc262ad41bdb005c) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Use a template store everywhere, not only in the render service:

  - `astlide({ templates: "s3://bucket/prefix" })` (or a folder, `gs://`, `azure://`, or a `TemplateStore`): every stored template becomes a theme of its name, in its latest version. In dev, a folder store is watched and the server restarts when a template changes.
  - `astlide template list | add | show | download | remove`, on `--store <location>` or `ASTLIDE_TEMPLATE_STORE`.
  - `astlide mcp --template-store <location>`: a read-only `list_templates` tool, and `template_layouts` takes a stored template's name.

  `@astlide/core/templates` no longer needs the cloud SDKs' types to type-check: client options take structural types (`S3ClientLike`, `GcsClientLike`, `ContainerClientLike`), which the SDKs' own clients satisfy.

## 2.10.0

### Minor Changes

- [#250](https://github.com/r-hashi01/astlide/pull/250) [`d8b9cff`](https://github.com/r-hashi01/astlide/commit/d8b9cffdc15757cc6d748109e01bdada6aba6e8c) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Add `@astlide/core/templates`: a store that keeps PowerPoint templates by name, with every uploaded version. Keep them in a folder, in Amazon S3 or an S3-compatible service (R2, MinIO …), Google Cloud Storage or Azure Blob Storage, or in any storage you plug in through `ObjectStorage`. `openTemplateStore("gs://bucket/prefix")` picks the storage from a location; the cloud SDKs are optional peer dependencies, and credentials come from each SDK's usual chain (IAM roles, service accounts, managed identities). The render service uses it for its new `/templates` routes.

### Patch Changes

- [#244](https://github.com/r-hashi01/astlide/pull/244) [`bc22b52`](https://github.com/r-hashi01/astlide/commit/bc22b52615726c101d597212bae8033638f33fbe) Thanks [@r-hashi01](https://github.com/r-hashi01)! - A plugin theme's `cssEntrypoint` can now be a project path starting with `./` or `../`, resolved from the project root like layout and decorator entrypoints. Previously the build failed with "Module not found". Entrypoints starting with `/` are now left for Vite to resolve (from the project root, or as an absolute file path) instead of being treated as file-system paths.

## 2.9.2

### Patch Changes

- [#232](https://github.com/r-hashi01/astlide/pull/232) [`5dc3c38`](https://github.com/r-hashi01/astlide/commit/5dc3c38cf3e3b3cbb3b5c3991b0cb444d8f618e1) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Printing a deck from the browser (Save as PDF) fits each slide to the paper — also on A4 / Letter and in Safari, which ignores the `@page` size — instead of cropping it at 1920px, and a slide change in progress no longer prints over the new slide (doubled text). `astlide export --pdf` output is unchanged.

- [#225](https://github.com/r-hashi01/astlide/pull/225) [`04427a8`](https://github.com/r-hashi01/astlide/commit/04427a83da04efa352fe0957d24c867be94fb463) Thanks [@r-hashi01](https://github.com/r-hashi01)! - The layout engine is now part of `@astlide/core` (`@astlide/core/engine`); it was published separately as `@astlide/engine`, which is deprecated.

## 2.9.1

### Patch Changes

- [#220](https://github.com/r-hashi01/astlide/pull/220) [`8bec7f4`](https://github.com/r-hashi01/astlide/commit/8bec7f460a59be4714fa0de30b186c405e1382a7) Thanks [@r-hashi01](https://github.com/r-hashi01)! - MCP: `template_layouts` and `import_pptx` only read files inside the folders the server may work in (regular files, the right extension, at most 256 MB, symlinks resolved). Projects must be one of those folders or directly in one — a deeper project needs its own `--root`. `import_pptx` names and checks the deck itself, and projects with an `@astlide/core` older than 2.8.0 are written with the server's own CLI. `/Users/Shared` and `C:\Users\Public` count as too broad, like the home and temp folders.

- [#221](https://github.com/r-hashi01/astlide/pull/221) [`38777de`](https://github.com/r-hashi01/astlide/commit/38777de971f937ae7843f465f7f3e75862f0d796) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Exports are bounded further: PPTX downloads (images and embed previews) share one budget — 6 at a time, 200 MB and 200 distinct URLs in all; same-site iframes are laid out at most 32 documents per slide and never inside themselves; Google Fonts are limited to 12 families per export, cached under content hashes (written atomically, one file per download, the cache kept under 512 MB). Guarded PDF / PNG renders keep the page on its site (a refresh or redirect doesn't replace it), bound renderer processes and heap, disable DNS prefetch, and hold the download total exactly.

- [#222](https://github.com/r-hashi01/astlide/pull/222) [`ff6b4e9`](https://github.com/r-hashi01/astlide/commit/ff6b4e9b30b588032c2ff89a568d27c2487566da) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Scripts in Markdown, HTML and PowerPoint slides (and template artwork) are found with a spec-compliant HTML parser (parse5), so slide markup is read the way browsers read it, and they are also removed from the final pages — `astro dev` responses and built pages — which covers what Astro adds after loading (image placeholders keep only image options). Slides cached by an earlier version, or with `slideScripts` set differently, are rendered again. Trailing-comment speaker notes are removed from rendered Markdown wherever the comment ends up (before footnotes, inside lists). The dev slide editor only mounts in the layout's own host element.
- Updated dependencies [[`38777de`](https://github.com/r-hashi01/astlide/commit/38777de971f937ae7843f465f7f3e75862f0d796)]:
  - @astlide/engine@0.1.4

## 2.9.0

### Minor Changes

- [#210](https://github.com/r-hashi01/astlide/pull/210) [`8636ea8`](https://github.com/r-hashi01/astlide/commit/8636ea8a1a6d397694c029e60b70891a5ae5c3b3) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Built deck pages no longer allow `script-src 'unsafe-inline'`: after `astro build`, the inline scripts Astlide and Astro put on pages — and those of MDX slides and their components — are allowed by their SHA-256 hashes in the default CSP. **Behaviour change:** inline `<script>`s in Markdown, HTML and PowerPoint slides no longer run in built pages (the build warns), since that content can come from others; set the new `slideScripts: true` only for decks whose content you fully trust. Inline event-handler attributes (`onclick="…"`) and `javascript:` URLs in slides don't run either. `astro dev` and custom `csp` strings are unchanged. The configuration reference also explains how to send `frame-ancestors` as a header.

  Built pages are emitted without `'unsafe-inline'` for scripts from the start, and the build only adds hashes — a page it doesn't rewrite allows no inline scripts. Template artwork from a `.pptx` counts as slide content.

- [#200](https://github.com/r-hashi01/astlide/pull/200) [`18711e6`](https://github.com/r-hashi01/astlide/commit/18711e6317fd5dd7c004dcdd246c1adf3ec728ef) Thanks [@r-hashi01](https://github.com/r-hashi01)! - The dev slide editor needs a browser enabled through a link `astro dev` prints at startup: a one-time code (works once, for 30 minutes) that sets a cookie for this project and port, derived from a secret kept in `node_modules/.astro/` (delete it to reset). Without it the editor shows how to turn editing on and saves nothing — even for requests relayed to the dev server over a raw port forward. The editor only edits slide files that already exist in `src/content/decks/`.

  Scripts in Markdown, HTML and PowerPoint slides — `<script>`, inline event handlers, `javascript:` URLs — are now removed when the slide is rendered, in `astro dev` and in builds: slide content can come from others. MDX slides keep theirs. The new `slideScripts: true` option keeps them for decks you fully trust.

- [#201](https://github.com/r-hashi01/astlide/pull/201) [`1113d68`](https://github.com/r-hashi01/astlide/commit/1113d68eb9f05ebcf2e6e3504854e14a4c718b0f) Thanks [@r-hashi01](https://github.com/r-hashi01)! - **Speaker notes are no longer published by default.** The `notes` option now defaults to `"dev"`: notes are included while running `astro dev`, but not in pages built with `astro build` — a deployed deck's presenter window says its notes aren't published. To present from the deployed site with notes, set `notes: "public"` (anyone who can open the deck can then read them, as before).

  `astlide export` now builds into its own folder, `node_modules/.astro/astlide-export`, instead of `dist/`. That build always includes speaker notes, so PowerPoint exports keep them, and the `dist/` you deploy is never changed by an export. `--no-build` reuses the last export build (else `dist/`).

  Notes written as a trailing `<!-- … -->` comment are now also taken out of the rendered `.md` and `.html` slides (they were left in the page's HTML as a comment). `ASTLIDE_EXPORT_BUILD` only counts when it names the project's own export folder, and builds never inherit it.

### Patch Changes

- [#198](https://github.com/r-hashi01/astlide/pull/198) [`31dbb98`](https://github.com/r-hashi01/astlide/commit/31dbb98d232658e32ba6d20c21b036ce3e4fa227) Thanks [@r-hashi01](https://github.com/r-hashi01)! - PDF / PNG export runs Chromium with its sandbox on (Playwright turns it off by default). Where the system doesn't allow the user namespaces it needs, the export stops with how to allow them for Chromium alone (an AppArmor profile, documented in the export guide) instead of running unsandboxed; `ASTLIDE_CHROMIUM_SANDBOX=0` opts out.

- [#202](https://github.com/r-hashi01/astlide/pull/202) [`361c664`](https://github.com/r-hashi01/astlide/commit/361c664f7eb248cf344bb1372986603fee84c100) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Public-network-only exports check addresses as they connect: the connection goes to the address that was checked, so a host can't pass with one DNS answer and connect with another. In guarded PDF / PNG renders, Chromium no longer connects to other hosts itself — Astlide makes those requests, following redirects hop by hop (a redirect handed to Chromium was followed without the check) — and anything not routed goes to a dead proxy; WebRTC sends no UDP of its own.

- [#209](https://github.com/r-hashi01/astlide/pull/209) [`105a216`](https://github.com/r-hashi01/astlide/commit/105a216205a363164b714431ef3d5478cfd54002) Thanks [@r-hashi01](https://github.com/r-hashi01)! - PPTX export lays out a same-site iframe only from a page inside the built site: for an iframe pointing at the site's root folder, the `<dist>.html` file next to it is no longer considered.

  Reading files of the built site (stylesheets, same-site iframe pages) also refuses symlinks inside `dist/` that point elsewhere.

- [#208](https://github.com/r-hashi01/astlide/pull/208) [`deefe39`](https://github.com/r-hashi01/astlide/commit/deefe390e3a5cb7010dcd4f0362527367f3bec04) Thanks [@r-hashi01](https://github.com/r-hashi01)! - MCP: the folder the server was started in no longer counts as an allowed project folder when it is the filesystem root or the home folder (or above it) — where clients often start servers. Name the folders with `astlide mcp --root <dir>` (repeatable) or `ASTLIDE_MCP_ROOTS`; clients that send MCP roots (Claude Code) need nothing. The filesystem root never counts as a root. Named folders are the outer limit — client roots only narrow them — and client roots that are the filesystem root, the home folder or a shared temp folder are ignored; empty `--root=` is refused; the project path is resolved once and used as resolved.

- [#211](https://github.com/r-hashi01/astlide/pull/211) [`ce9a51c`](https://github.com/r-hashi01/astlide/commit/ce9a51c8e29dbc4788b624bbe2f197f86f0d10a9) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Pictures and fonts from `.pptx` decks and templates are stored by what their bytes are, not by the name the file gives them; anything that isn't a picture or a font — or a font whose first bytes could start a script — is left out. A build publishes only the `.pptx` assets the site uses (slides that aren't hidden, and templates), not everything in the cache from removed decks or older versions of a file.
- Updated dependencies [[`105a216`](https://github.com/r-hashi01/astlide/commit/105a216205a363164b714431ef3d5478cfd54002)]:
  - @astlide/engine@0.1.3

## 2.8.0

### Minor Changes

- [#193](https://github.com/r-hashi01/astlide/pull/193) [`18c2926`](https://github.com/r-hashi01/astlide/commit/18c29261d4067c9e89501dfc357c66aedf082efc) Thanks [@r-hashi01](https://github.com/r-hashi01)! - New `notes` option: `notes: "dev"` keeps speaker notes out of built pages (they are public by default — now documented). Hardening: the `/[deck]/all` page gets the CSP too, and the default policies add `base-uri 'self'; form-action 'self'; object-src 'none'`; the share / print toggle builds its URL from the slide number; `<Tweet>` links / avatars and `<YouTube>` ids are validated; `sanitizeKaTeXOutput` also strips non-math elements (`noscript`, `iframe`, `object`, SVG `animate` …) and `data:` URLs; `sanitizeHTML` drops `id`, refuses protocol-relative links and adds `rel="noopener noreferrer"` to kept `target`s; saved drawings are validated before use.

### Patch Changes

- [#159](https://github.com/r-hashi01/astlide/pull/159) [`01c0b37`](https://github.com/r-hashi01/astlide/commit/01c0b374695aa46d23776c0fe735c4f24fa47e9b) Thanks [@r-hashi01](https://github.com/r-hashi01)! - The docs moved to https://astlide.dev/ (package `homepage`, README links).

- [#184](https://github.com/r-hashi01/astlide/pull/184) [`834d12f`](https://github.com/r-hashi01/astlide/commit/834d12f7ceb7c4dcdad65b5d6d5988ba6edf7495) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Hardening: `<astlide-deck>` (and the React / Vue wrappers) only loads `http(s)` or relative `src` URLs; presenter sync checks incoming messages and is scoped to the site's base path; `sanitizeHTML` now works on a parsed tree (unterminated tags and encoded `javascript:` URLs no longer get through) and the client-side notes sanitizer keeps only allowlisted attributes; the engine's `distFile` and same-site iframes / stylesheets stay inside `dist` (a sibling folder like `dist-old` no longer counts).

- [#167](https://github.com/r-hashi01/astlide/pull/167) [`d05498f`](https://github.com/r-hashi01/astlide/commit/d05498f027e646637ab776347796a7f4fcb3a444) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Hardening from the first CodeQL scan: KaTeX output is sanitized on a parsed tree (script elements however spelled, `on*` handlers, `javascript:` / `vbscript:` URLs even when entity-encoded); slide titles from HTML headings remove one level of escaping, not two; CSS font parsing and trailing-slash trimming no longer use backtracking-prone regexes; table cells in MCP imports escape backslashes too.

- [#181](https://github.com/r-hashi01/astlide/pull/181) [`4ced530`](https://github.com/r-hashi01/astlide/commit/4ced5302fdfbb23c310ee05cf73fce19cd086480) Thanks [@r-hashi01](https://github.com/r-hashi01)! - The dev slide editor's endpoint now answers only local requests — from the machine running `astro dev`, addressed to `localhost` / `127.0.0.1` and not relayed by a proxy or tunnel — from the dev server's own pages, carrying the dev server's per-start token (which only those pages can fetch); it no longer follows symlinks out of `src/`. Viewing slides from other devices with `astro dev --host` or through a tunnel is unchanged; the editor works only at `localhost` on the machine running the dev server.

- [#191](https://github.com/r-hashi01/astlide/pull/191) [`e063de7`](https://github.com/r-hashi01/astlide/commit/e063de75ca23dedaf345e357291e7c0d539e0231) Thanks [@r-hashi01](https://github.com/r-hashi01)! - PPTX export is sturdier against the pages and images a deck points to: embed-card links are http(s) only, page tags are read with a parser (linear time), URLs a remote response chose (an advertised oEmbed endpoint, thumbnails, `og:image`, redirects from a public server) must be public addresses, an embed or SVG that fails no longer aborts the export, SVG pictures above 50 megapixels are skipped, control characters XML can't hold are dropped, and Google Fonts downloads have a size cap and timeout.

- [#172](https://github.com/r-hashi01/astlide/pull/172) [`9b33706`](https://github.com/r-hashi01/astlide/commit/9b3370677cdca5fe67739261d7838e845a843ba4) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Exports bound what they download: remote images at most 20 MB, pages read for embed previews at most 2 MB, redirects followed hop by hop (at most 5). With `ASTLIDE_PUBLIC_NETWORK_ONLY=1` — set by the render service for every render — PDF / PNG rendering and the PPTX exporter only reach public internet hosts: loopback, private, link-local (cloud metadata) and other reserved addresses are refused, on every redirect too, and WebSockets and service workers are blocked.

- [#171](https://github.com/r-hashi01/astlide/pull/171) [`229bbd4`](https://github.com/r-hashi01/astlide/commit/229bbd4850d2c6307e9c838dc9ad5439e97d6c8e) Thanks [@r-hashi01](https://github.com/r-hashi01)! - `astlide import --deck` and the MCP tool `import_pptx` accept only a plain folder name for the deck (letters, digits, `-`, `_`, `.`), checked before anything is read, and the deck and picture folders must stay inside `src/content/decks/` and `public/pptx/`.

- [#179](https://github.com/r-hashi01/astlide/pull/179) [`8a07b01`](https://github.com/r-hashi01/astlide/commit/8a07b0118a09be122f8ceb869c1c818255df788c) Thanks [@r-hashi01](https://github.com/r-hashi01)! - MCP: `check_deck` is no longer marked read-only (it builds the site by default); `render_deck` only writes inside the project (`outDir` outside it is refused); `check_deck` links nothing outside its temporary folder when resolving a built page under a base path.

- [#192](https://github.com/r-hashi01/astlide/pull/192) [`e426a22`](https://github.com/r-hashi01/astlide/commit/e426a22e6915ef0e52e22644fde69326893013a0) Thanks [@r-hashi01](https://github.com/r-hashi01)! - MCP server: `check_deck`, `render_deck` and `import_pptx` (with a project) only work on projects inside the client's MCP roots or the server's working directory (`ASTLIDE_MCP_ANY_PROJECT=1` allows any), say in their descriptions that they run the project's code, and give builds only the environment they need (no tokens or keys). Deck names follow the `astlide import` rule (no leading `-`) and reach `astlide export` after `--`; `outDir` and `astlide import` refuse folders that are symlinks out of the project; `import_pptx` is marked destructive.

- [#170](https://github.com/r-hashi01/astlide/pull/170) [`6d4baf5`](https://github.com/r-hashi01/astlide/commit/6d4baf51b03649d23ccab1784ba606ad5b9d0efe) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Safer reading of PowerPoint files (.pptx / .potx / .thmx), which often come from other people: font names are limited to letters, digits and a few punctuation marks wherever they reach CSS or HTML; theme colors must be 6-digit hex; ZIP entries are inflated only when used and only up to their declared size, within per-entry and per-file budgets (entries sharing data are refused); a slide listed more than once is read once, and at most 2000 slides are read.

- [#185](https://github.com/r-hashi01/astlide/pull/185) [`777f2f5`](https://github.com/r-hashi01/astlide/commit/777f2f511c9abc55afa6edffd7945b47e6d70253) Thanks [@r-hashi01](https://github.com/r-hashi01)! - PowerPoint import does less work on crafted files: placeholders are matched through a per-layout index instead of shape by shape, XML nested deeper than 256 levels is refused, and `astlide import <Google Slides URL>` caps the download (512 MB, 5 minutes) with clearer errors.

- [#194](https://github.com/r-hashi01/astlide/pull/194) [`f85d2c4`](https://github.com/r-hashi01/astlide/commit/f85d2c4c474d3c838f23d2b06f03ae49eb15ab44) Thanks [@r-hashi01](https://github.com/r-hashi01)! - PowerPoint import and templates bound more of their work: numbered lists start within PowerPoint's range (1–32767), each master, layout and embedded font is read once (at most 64 masters, 256 layouts, 32 font families), XML parts over 32 MB or with more than 500 000 elements are refused while parsing, and names such as `constructor` in a file no longer break color, dash or bullet lookups.

- [#180](https://github.com/r-hashi01/astlide/pull/180) [`ed3a17d`](https://github.com/r-hashi01/astlide/commit/ed3a17daf82867d735988abfb967020ad7837110) Thanks [@r-hashi01](https://github.com/r-hashi01)! - SVG pictures in `.pptx` decks and templates are inlined as `data:` URLs instead of being written to the site, and the `.pptx` asset route no longer serves SVG files (and sends `X-Content-Type-Options: nosniff`).

- [#182](https://github.com/r-hashi01/astlide/pull/182) [`07bb44a`](https://github.com/r-hashi01/astlide/commit/07bb44a41dfbad115b38cadee95351d080337ab6) Thanks [@r-hashi01](https://github.com/r-hashi01)! - PDF / PNG export reads two more settings from the environment (the render service sets them): `ASTLIDE_MAX_SLIDES` caps how many slides are rendered whatever count the page reports, and `ASTLIDE_CHROMIUM_SANDBOX=1` launches Chromium with its sandbox on.

- [#183](https://github.com/r-hashi01/astlide/pull/183) [`8b5dc4e`](https://github.com/r-hashi01/astlide/commit/8b5dc4ea75faf61d08a68b6b8d26e98bb935013c) Thanks [@r-hashi01](https://github.com/r-hashi01)! - SVG rasterized for PPTX export (remote SVG images, inline SVG) only draws in-document references and inline PNG / JPEG / GIF / WebP images; other image links, including file paths, are dropped.
- Updated dependencies [[`01c0b37`](https://github.com/r-hashi01/astlide/commit/01c0b374695aa46d23776c0fe735c4f24fa47e9b), [`834d12f`](https://github.com/r-hashi01/astlide/commit/834d12f7ceb7c4dcdad65b5d6d5988ba6edf7495), [`d05498f`](https://github.com/r-hashi01/astlide/commit/d05498f027e646637ab776347796a7f4fcb3a444), [`e063de7`](https://github.com/r-hashi01/astlide/commit/e063de75ca23dedaf345e357291e7c0d539e0231), [`8b5dc4e`](https://github.com/r-hashi01/astlide/commit/8b5dc4ea75faf61d08a68b6b8d26e98bb935013c)]:
  - @astlide/engine@0.1.2

## 2.7.1

### Patch Changes

- [#156](https://github.com/r-hashi01/astlide/pull/156) [`d622bf2`](https://github.com/r-hashi01/astlide/commit/d622bf287bf0442c27f442ece30010cb19a921ab) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Describe Astlide as what it is — an Astro integration ("slides that live in your Astro site"), not a framework: the npm README now lists what it does (many decks per site, PowerPoint templates in / editable PPTX out, import, embedding, `astlide mcp`) and links the docs; the starter deck's wording matches.

## 2.7.0

### Minor Changes

- [#153](https://github.com/r-hashi01/astlide/pull/153) [`d0b3972`](https://github.com/r-hashi01/astlide/commit/d0b397295b7be3cafff6b7d0f60ed181fe9abbe6) Thanks [@r-hashi01](https://github.com/r-hashi01)! - `astlide mcp`: the MCP server for coding agents now ships with `@astlide/core` — `claude mcp add astlide -- bunx astlide mcp` in any Astlide project, nothing else to install. Tools: `template_layouts`, `import_pptx`, `render_deck`, and `check_deck` (text and boxes that don't fit, measured by the layout engine). The tools' functions are exported from `@astlide/core/mcp`.

## 2.6.0

### Minor Changes

- [#138](https://github.com/r-hashi01/astlide/pull/138) [`30a7613`](https://github.com/r-hashi01/astlide/commit/30a7613178f191f2ac0989fecb555db4c67acea8) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Embed a deck in any page.

  - `<astlide-deck src="/my-talk/" start="2" controls>` (`@astlide/core/embed`): a framework-agnostic custom element that shows a built deck in an iframe at 16:9, responsive to its container. Methods `next()`, `prev()`, `goTo(n)`, `requestFullscreen()`; a `slidechange` event with `{ deck, slide, total, step, steps }`; an optional control bar (previous / next, counter, fullscreen). SSR-safe to import.
  - React and Vue wrappers: `@astlide/core/embed/react` and `@astlide/core/embed/vue` (`react` / `vue` are optional peer dependencies).
  - `<DeckEmbed deck="my-talk" />` (`@astlide/core/components/DeckEmbed.astro`) for embedding a deck in another page of the same site, with the URL resolved against Astro's `base`.
  - Deck pages framed by `<astlide-deck>` answer a small, origin-checked `postMessage` protocol, take arrow / Page / Home / End keys, and navigate without adding entries to the host page's history.

- [#133](https://github.com/r-hashi01/astlide/pull/133) [`c291813`](https://github.com/r-hashi01/astlide/commit/c291813c89387e39b2a519c7538fa418c4c0ba94) Thanks [@r-hashi01](https://github.com/r-hashi01)! - PPTX export: speaker notes and Japanese text.

  - Speaker notes (`<SpeakerNotes>`, frontmatter `notes`, a trailing `<!-- … -->`) are written to the PPTX and show in PowerPoint's notes pane.
  - Text gets an East Asian font (`<a:ea>`): the CJK font the slides' CSS names, else Yu Gothic (installed with Office). The theme's East Asian font is set too, and Japanese / Korean runs are tagged `ja-JP` / `ko-KR`.
  - Japanese text is measured with a Japanese font (the CSS's, else Noto Sans JP from Google Fonts), so lines break where they do in the browser.

### Patch Changes

- [#134](https://github.com/r-hashi01/astlide/pull/134) [`00ce654`](https://github.com/r-hashi01/astlide/commit/00ce6546e2fc4aa312e7838f3d261514b7ee8fee) Thanks [@r-hashi01](https://github.com/r-hashi01)! - npm metadata: descriptions mention presentations and editable PowerPoint export, more keywords (slides, presentation, pptx, powerpoint, astro-loader …), and `homepage` points to the docs site.

- [#121](https://github.com/r-hashi01/astlide/pull/121) [`7e291b9`](https://github.com/r-hashi01/astlide/commit/7e291b9dedf47298897d4a09557233e417b60af9) Thanks [@r-hashi01](https://github.com/r-hashi01)! - PPTX export: fonts, caps, hatches and list markers.

  - A font the slides ask for but the exporter doesn't have (e.g. Office fonts like Calibri from a PowerPoint template) is now named in the PPTX, so PowerPoint uses it where it's installed; text is measured with a common font of the same kind instead of whichever font was registered first. Generic families (`sans-serif`, `serif`, `monospace`, `system-ui`) resolve to common fonts.
  - `text-transform` (uppercase / lowercase / capitalize) is applied.
  - Hatched backgrounds (`repeating-linear-gradient` lines, as imported PowerPoint pattern fills draw them) are exported as PowerPoint pattern fills instead of a solid color.
  - List markers sit on the item's first line also with a tight `line-height`.
  - `@astlide/engine` ships a README and LICENSE.

- [#144](https://github.com/r-hashi01/astlide/pull/144) [`b0dd0dd`](https://github.com/r-hashi01/astlide/commit/b0dd0ddd69a255e92c05b3a745f1b7bc7ca04bf8) Thanks [@r-hashi01](https://github.com/r-hashi01)! - PPTX export fixes.

  - Sites with an Astro `base` (GitHub Pages project sites …) export: built files are found with or without the base path in their URLs (`distFile`).
  - Absolutely positioned boxes are placed against their nearest positioned ancestor, as in browsers, not their parent — `.pptx` pages shown in a deck are no longer shifted by the slide's padding. `position: relative` offsets apply.
  - `currentColor` in borders, backgrounds and outlines resolves to the element's color; buttons and form fields get Chromium's default look.
  - `@astlide/core/utils/*` and `@astlide/core/internal/*` imports without an extension type-check (they map to the `.ts` files).

- Updated dependencies [[`00ce654`](https://github.com/r-hashi01/astlide/commit/00ce6546e2fc4aa312e7838f3d261514b7ee8fee), [`7e291b9`](https://github.com/r-hashi01/astlide/commit/7e291b9dedf47298897d4a09557233e417b60af9), [`b0dd0dd`](https://github.com/r-hashi01/astlide/commit/b0dd0ddd69a255e92c05b3a745f1b7bc7ca04bf8)]:
  - @astlide/engine@0.1.1

## 2.5.0

### Minor Changes

- [#82](https://github.com/r-hashi01/astlide/pull/82) [`77c1814`](https://github.com/r-hashi01/astlide/commit/77c181432bfe9f43a12bc2c1fb9edfb2733d3727) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Add a camera bubble and talk recording. `v` (or the `camera` toolbar action) shows your webcam in a draggable bubble that stays live across slides; `r` (`record`) records a screen / window / tab you pick plus the microphone and downloads a `.webm` when stopped, with a recording indicator while it runs.

- [#83](https://github.com/r-hashi01/astlide/pull/83) [`8a24aa1`](https://github.com/r-hashi01/astlide/commit/8a24aa1462b8fc6a21df1c80267f6cfddff766d6) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Live-edit slides in the browser while developing: in `astro dev`, press `e` to open the current slide's source next to it and type — edits are saved automatically and only the changed parts of the slide are patched in place — no page reload or flicker (caret, current step, diagrams, camera and recording are kept). `Esc` saves and closes. Dev-only: the editor and its endpoint are not part of production builds, and they only read/write slide files under `src/` from the dev server's own origin.

- [#105](https://github.com/r-hashi01/astlide/pull/105) [`2b68573`](https://github.com/r-hashi01/astlide/commit/2b685735ff81d6b306d7deb7b8eb619a59df148a) Thanks [@r-hashi01](https://github.com/r-hashi01)! - New `astlide export` command — one CLI for every format: `astlide export my-talk [--pdf] [--pptx] [--png]`, or `--all`. PDF / PNG no longer need a running server: the site is built and served on a free port for the export, and Astro's `base` is detected. `--base-url` still exports from a server you run. Exports go to `exports/`. New projects get a `bun run export` script.

  Also fixed: exported PDFs ended with a blank page. A trailing page break and Mermaid's hover tooltip spilled past the last slide.

- [#100](https://github.com/r-hashi01/astlide/pull/100) [`e093a9c`](https://github.com/r-hashi01/astlide/commit/e093a9cd66f7c4ac4a7ab5b6e227be6bc3dc70df) Thanks [@r-hashi01](https://github.com/r-hashi01)! - New `favicon` option. Deck pages, the deck index and the print view now link a favicon: by default `favicon.svg` / `.ico` / `.png` from `public/`, with Astro's `base` applied. Without one, they use an empty icon, so browsers no longer request `/favicon.ico` at the domain root (a 404 under a sub-path such as GitHub Pages). Pass a path or URL to choose one, or `false` for no link.

- [#105](https://github.com/r-hashi01/astlide/pull/105) [`2b68573`](https://github.com/r-hashi01/astlide/commit/2b685735ff81d6b306d7deb7b8eb619a59df148a) Thanks [@r-hashi01](https://github.com/r-hashi01)! - One export command, one option per format: `astlide export <deck> --pdf | --png | --pptx`.

  - `--pptx` now lays out the built slides with the new `@astlide/engine` (CSS cascade, flexbox and font-metric line breaking, no browser) and writes native shapes and editable text boxes in the theme's fonts, so the PowerPoint matches the slides instead of a re-styled copy of the Markdown. It replaces the source-based exporter, which skipped `.md` / `.html` slides.
  - The fonts the slides use are embedded in the `.pptx`, so PowerPoint shows them without the fonts installed.
  - Tables become native PowerPoint tables; simple inline SVG drawings (boxes, lines and arrows, paths, text) become editable shapes; `::before` / `::after` content is included.
  - Background images (`background-size` / `-position`, cropped to their box) and linear-gradient backgrounds are included.
  - Embeds: `<YouTube>` exports as its thumbnail with a play button, linked to the video (in PDFs too); mark your own stand-in for any embed with `data-astlide-static`. Iframes of your own site (`srcdoc` or a built page) are laid out inside the frame; other sites become their thumbnail and title (oEmbed / Open Graph, cached), or a linked card offline. `overflow: hidden` clips what's drawn. Remote and JPEG images are included.
  - Mermaid diagrams and SVG images are included (rendered without a browser).
  - The older `astlide-export` and `astlide-export-pptx` commands are removed; use `astlide export`.

- [#81](https://github.com/r-hashi01/astlide/pull/81) [`9032586`](https://github.com/r-hashi01/astlide/commit/9032586c67bc0ea3edf567b35227b95d48c3d409) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Pen drawings can persist: `astlide({ drawings: { persist: true } })` keeps them in `localStorage` per deck, so they survive reloads and come back the next time the deck is opened in that browser (off by default). `Shift+C` (with the pen active) now clears the whole deck's drawings.

- [#115](https://github.com/r-hashi01/astlide/pull/115) [`6baa981`](https://github.com/r-hashi01/astlide/commit/6baa981fb01fe450b43a8b45b58dc8e0da00ba30) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Import PowerPoint and Google Slides.

  - Put a `.pptx` in a deck folder and its pages become slides, in place among the deck's other files — text kept as text, shapes, pictures and tables where they were, placeholders styled from their layout and master, notes / titles / hidden slides carried over, embedded fonts used.
  - `astlide import <file.pptx | Google Slides URL> [--deck name]` turns one into an editable deck of `.html` slides.
  - `@astlide/core/pptx` exports the converter (`pptxToSlides`) for your own tools.

- [#119](https://github.com/r-hashi01/astlide/pull/119) [`2652018`](https://github.com/r-hashi01/astlide/commit/2652018afdfe592c4cc8ebded4b4769a4223f63c) Thanks [@r-hashi01](https://github.com/r-hashi01)! - PowerPoint templates as themes: `astlide({ templates: { brand: "./brand.pptx" } })` (also `.potx` and Office `.thmx`; Google Slides via its PowerPoint download), then `"theme": "brand"` in a deck's `_config.json`.

  - Markdown slides get the template's backgrounds and artwork per layout, its theme colors and fonts, and its slide numbers.
  - The first heading goes into the layout's title placeholder and the rest into its body placeholder(s), in the template's text style.
  - `cover`, `section`, `default`, `two-column` and `code` use the template's matching layouts, and every template layout is available by name (`slideLayout: comparison`).
  - `@astlide/core/pptx` exports `pptxToTemplate` and `templateCss`.

- [#94](https://github.com/r-hashi01/astlide/pull/94) [`271b5c2`](https://github.com/r-hashi01/astlide/commit/271b5c24ff301c073ca4ca3a8c67d73f75adda5f) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Speaker notes: `<SpeakerNotes>` is the new name of the notes component — "note" usually means a _visible_ callout (GitHub `> [!NOTE]`, Qiita / Starlight `:::note`). `<Notes>` keeps working as an alias. Notes can now also be written as an HTML comment at the end of a slide, as in Slidev and Marp — in `.md`, `.mdx` and `.html` slides (priority: `<SpeakerNotes>` > frontmatter `notes` > trailing comment).

### Patch Changes

- [#97](https://github.com/r-hashi01/astlide/pull/97) [`2028fcd`](https://github.com/r-hashi01/astlide/commit/2028fcd203d27e42b3da1662ef99da20c65fd436) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Dev: the default (or custom) CSP now allows `blob:` workers during `astro dev` (`worker-src 'self' blob:`, unless the policy sets `worker-src`). Vite's client was blocked from starting its reconnect worker, which logged CSP errors and left background tabs, such as the presenter window, stuck after a dev server restart. Built output is unchanged.

- [#101](https://github.com/r-hashi01/astlide/pull/101) [`dc9a69b`](https://github.com/r-hashi01/astlide/commit/dc9a69bce8c51dc435f69bd43356f3afff19eeca) Thanks [@r-hashi01](https://github.com/r-hashi01)! - A `<Fragment>` on its own line now hugs its content instead of stretching across the slide, so `effect="highlight"` highlights the text, not a full-width bar.

- [#98](https://github.com/r-hashi01/astlide/pull/98) [`32b749d`](https://github.com/r-hashi01/astlide/commit/32b749d42256445395814dbe9f201ee69401c49d) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Built decks now navigate around hidden slides: ←/→, Home/End, the toolbar and presenter buttons, the next-slide preview and the overview skip `hidden: true` slides. Before, ← from the slide after a hidden one landed on its redirect and bounced back, so you couldn't go back past it.

- [#90](https://github.com/r-hashi01/astlide/pull/90) [`3651ffc`](https://github.com/r-hashi01/astlide/commit/3651ffc1b4b559679cb2c37b4b080224bd41b29a) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Dev: adding, removing or renaming slide files now updates open slides live (slide count, outline, navigation) without a full page reload. Each window stays on the slide it was showing, at the same step, even if its number changed; if that slide's file was removed, it shows the slide now at that position. Other pages reload as before.

- [#87](https://github.com/r-hashi01/astlide/pull/87) [`61c2174`](https://github.com/r-hashi01/astlide/commit/61c21745fd9ac87ef79e7c8b0525033f2f383b90) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Live edits now update speaker notes as well (frontmatter `notes` and `<Notes>`), in the notes overlay and in every window showing the edited slide, including the presenter window — still without a page reload.

- [#99](https://github.com/r-hashi01/astlide/pull/99) [`afa7538`](https://github.com/r-hashi01/astlide/commit/afa7538d9ab1c72e341e840092561f8bc51ed1c8) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Inline `code` in speaker notes is readable again in the presenter window and the notes overlay: it used the theme's light chip, so it showed light text on a light background.

- [#102](https://github.com/r-hashi01/astlide/pull/102) [`53a653f`](https://github.com/r-hashi01/astlide/commit/53a653fbe7004c5bb3cacaaf327340e41c8f78a6) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Overview thumbnails no longer use `sandbox="allow-same-origin allow-scripts"`. It gave no isolation for same-origin frames and logged a console warning per slide. Thumbnails render in embed mode, like the presenter's next-slide preview.

- [#80](https://github.com/r-hashi01/astlide/pull/80) [`fe43b55`](https://github.com/r-hashi01/astlide/commit/fe43b55dca33b26f8cfaae4791694bd4523bc031) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Update the package descriptions: "Slides that live in your Astro site".

- [#105](https://github.com/r-hashi01/astlide/pull/105) [`2b68573`](https://github.com/r-hashi01/astlide/commit/2b685735ff81d6b306d7deb7b8eb619a59df148a) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Exported PPTX files open in PowerPoint without the "repair" prompt. The built-in zip writer flagged every entry as having a data descriptor it never wrote, and stamped an invalid DOS date. Packages also now include the parts and default text styles PowerPoint itself writes (presProps / viewProps / tableStyles, master `txStyles`, `defaultTextStyle`), with timestamps without fractional seconds.

- [#105](https://github.com/r-hashi01/astlide/pull/105) [`2b68573`](https://github.com/r-hashi01/astlide/commit/2b685735ff81d6b306d7deb7b8eb619a59df148a) Thanks [@r-hashi01](https://github.com/r-hashi01)! - The print view (`/<deck>/all`), which PDF exports render, now loads the deck's web font (`font` option, Inter by default), like the slide pages. Before, exported PDFs used whatever font the machine had installed. The deck index also follows the `font` option now.

  The default `font` stylesheet also loads JetBrains Mono, the built-in themes' code font. Code blocks used to fall back to the system monospace font, which in exported PDFs was often Courier and looked lighter and smaller than on screen.

- [#114](https://github.com/r-hashi01/astlide/pull/114) [`f233eaf`](https://github.com/r-hashi01/astlide/commit/f233eaf8f26d6a03be4dc025730fa7f7b902774d) Thanks [@r-hashi01](https://github.com/r-hashi01)! - The print view (`/<deck>/all`, what PDF exports render) no longer plays slide transitions: a slide with `transition: zoom` was scaled down while it animated in, and an export could capture it that way.

- [#103](https://github.com/r-hashi01/astlide/pull/103) [`6f47fcc`](https://github.com/r-hashi01/astlide/commit/6f47fcc3d6e3d085874b4f25bd9ab04e5a96cdff) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Slide links follow Astro's `trailingSlash` / `build.format`: with the default `directory` format they end in `/`. Static hosts such as GitHub Pages no longer answer every navigation, prefetch, overview thumbnail and presenter preview with a 301 redirect.
- Updated dependencies [[`2b68573`](https://github.com/r-hashi01/astlide/commit/2b685735ff81d6b306d7deb7b8eb619a59df148a)]:
  - @astlide/engine@0.1.0

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
