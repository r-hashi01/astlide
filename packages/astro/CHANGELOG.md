# @astlide/astro

## 3.0.3

### Patch Changes

- Updated dependencies [[`ab6a9cb`](https://github.com/r-hashi01/astlide/commit/ab6a9cbd1773533a42c63b2e3399fea0a8c81565)]:
  - @astlide/core@3.0.3

## 3.0.2

### Patch Changes

- [#297](https://github.com/r-hashi01/astlide/pull/297) [`ab9399e`](https://github.com/r-hashi01/astlide/commit/ab9399e9062956cb6987d4e1c0ba7edfd102e777) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Fix `astro build` and `astlide export` with pnpm and other strict installs, which failed to resolve `@astlide/core/styles/themes/default.css`.

## 3.0.1

### Patch Changes

- [#294](https://github.com/r-hashi01/astlide/pull/294) [`efd2c93`](https://github.com/r-hashi01/astlide/commit/efd2c93d74e1dde22d21efbbaed2d324eda64e59) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Depend on `@astlide/core` 3 (and on `@astlide/react` / `@astlide/vue` 3). The 3.0.0 releases of these packages, and `astlide` 0.2.0, were published depending on the previous versions.
- Updated dependencies [[`efd2c93`](https://github.com/r-hashi01/astlide/commit/efd2c93d74e1dde22d21efbbaed2d324eda64e59)]:
  - @astlide/core@3.0.1

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

### Patch Changes

- Updated dependencies [[`3b73a63`](https://github.com/r-hashi01/astlide/commit/3b73a63d1ce05a8452136c0dc570151dfb3b1e59), [`9360c4a`](https://github.com/r-hashi01/astlide/commit/9360c4a7a0fb686bc0570c6ea84f62ad303ba2af), [`6dd1add`](https://github.com/r-hashi01/astlide/commit/6dd1adda4bc3d5aba7e2710ece77c72c510e216c), [`934761a`](https://github.com/r-hashi01/astlide/commit/934761af53671800510c22a62bfff7bf38c7e506), [`98cf488`](https://github.com/r-hashi01/astlide/commit/98cf4884d30042a04f14bf5eba91f5ebd3f3d9ba), [`dcf7d27`](https://github.com/r-hashi01/astlide/commit/dcf7d2735570147aa26182e6d4c1a8bb68309d5d), [`88146fa`](https://github.com/r-hashi01/astlide/commit/88146fa594347d93dd987b0527b18af56da05763), [`c1fb41f`](https://github.com/r-hashi01/astlide/commit/c1fb41f7b97b77af936295b70ad69a3b0a7f5102), [`10167df`](https://github.com/r-hashi01/astlide/commit/10167df9b3adc6b569c3c4aabd282d7cd4b4cb12), [`310ace6`](https://github.com/r-hashi01/astlide/commit/310ace6e12b9520b812bdf3847137ddc680bfdc4), [`20c416d`](https://github.com/r-hashi01/astlide/commit/20c416d9cd0266cb0384aa0d30e4021fe1cfcd34), [`934761a`](https://github.com/r-hashi01/astlide/commit/934761af53671800510c22a62bfff7bf38c7e506), [`8f12d72`](https://github.com/r-hashi01/astlide/commit/8f12d72c0476b9a2e7b286a2eff84b7915a7931f), [`43f1d72`](https://github.com/r-hashi01/astlide/commit/43f1d7229a7cf87ad1391d64669d6747fcaf165e), [`6f0433f`](https://github.com/r-hashi01/astlide/commit/6f0433fbd76b7f8a571305425dbab5601e2fad26), [`732b7ab`](https://github.com/r-hashi01/astlide/commit/732b7ab4807c117d50e62d03fa4a8b951c9d442b), [`d041996`](https://github.com/r-hashi01/astlide/commit/d0419962f4af0bb6fc003e07131bce671b77ddc4)]:
  - @astlide/core@3.0.0
