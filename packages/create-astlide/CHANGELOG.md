# create-astlide

## 0.1.2

### Patch Changes

- [`ee7db18`](https://github.com/r-hashi01/astlide/commit/ee7db18e26e5f37a2084b77b87f071780d4cad1c) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Make tsconfig + source compatible with TypeScript 6: explicitly include `node` in `compilerOptions.types` and annotate readline callback parameters as `string` (TS 6 no longer infers them implicitly).

## 0.1.1

### Patch Changes

- [`859d98f`](https://github.com/r-hashi01/astlide/commit/859d98f20c5b7a0652d35b3cb36e6f0c126843b1) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Sync `engines.node` to `>=22.12.0` (Astro 6 requirement) and drop `publishConfig.provenance: true` (provenance is now driven by Trusted Publishing OIDC, no need for the package.json hint that was breaking local `npm publish` when not running under GitHub Actions OIDC).

## 0.1.0

Initial public release.

### Highlights

- `bun create astlide [project-name]` (also `npm create astlide@latest`, `pnpm create astlide`, `yarn create astlide`).
- Interactive scaffolder built on Node's built-in `readline` — zero runtime dependencies.
- Prompts:
  1. Project name (required if not given as argument)
  2. Theme — pick one of the 7 built-in themes
  3. Include sample slides? — drops 5 example slides if no
  4. Package manager — bun / npm / pnpm / yarn (next-step instructions adapt accordingly)
- Generated project structure:
  ```
  my-slides/
  ├── astro.config.mjs
  ├── package.json              # @astlide/core peer-installed
  ├── src/
  │   ├── content.config.ts     # slideSchema-based collection
  │   └── content/decks/example-deck/
  │       ├── _config.json      # title, author, date, theme
  │       ├── 01-cover.mdx
  │       ├── 02-intro.mdx
  │       ├── 03-two-column.mdx
  │       ├── 04-code.mdx       # CodeBlock demo
  │       ├── 05-fragments.mdx
  │       ├── 06-columns.mdx
  │       └── 07-end.mdx
  ```
- `--help` / `-h` and `--version` / `-v` flags.
- ANSI-coloured output without a colour library.
- Comprehensive CI smoke: `npm pack` of `@astlide/core` → install → `astro build` runs on every PR.

### Compatibility

- **Node**: `>=22.12.0` (required by Astro 6).
- Works with bun, npm, pnpm, and yarn.
