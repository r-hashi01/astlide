# create-astlide

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
