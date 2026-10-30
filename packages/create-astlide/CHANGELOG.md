# create-astlide

## 0.3.0

### Minor Changes

- [#292](https://github.com/r-hashi01/astlide/pull/292) [`9e4b6cd`](https://github.com/r-hashi01/astlide/commit/9e4b6cd7af15131614c516be3b35377328d0aaf3) Thanks [@r-hashi01](https://github.com/r-hashi01)! - New projects use Astlide 3: they depend on `@astlide/astro` and import the integration, `astlideDeckLoader` and `slideSchema` from it.

## 0.2.7

### Patch Changes

- [#245](https://github.com/r-hashi01/astlide/pull/245) [`471e58f`](https://github.com/r-hashi01/astlide/commit/471e58f4a4cf85360bce3a7a6d928c1d7ea97f5a) Thanks [@r-hashi01](https://github.com/r-hashi01)! - New projects load every slide format. The template's `src/content.config.ts` now uses `astlideDeckLoader()`, so `.md` and `.html` slides, `.pptx` files in a deck and slides written by `astlide import` show up. Before, it used a `.mdx`-only `glob()` loader.

## 0.2.6

### Patch Changes

- [#220](https://github.com/r-hashi01/astlide/pull/220) [`8bec7f4`](https://github.com/r-hashi01/astlide/commit/8bec7f460a59be4714fa0de30b186c405e1382a7) Thanks [@r-hashi01](https://github.com/r-hashi01)! - New projects' `.gitignore` also leaves out `.env` files.

## 0.2.5

### Patch Changes

- [#159](https://github.com/r-hashi01/astlide/pull/159) [`01c0b37`](https://github.com/r-hashi01/astlide/commit/01c0b374695aa46d23776c0fe735c4f24fa47e9b) Thanks [@r-hashi01](https://github.com/r-hashi01)! - The docs moved to https://astlide.dev/ (package `homepage`, README links).

- [#192](https://github.com/r-hashi01/astlide/pull/192) [`e426a22`](https://github.com/r-hashi01/astlide/commit/e426a22e6915ef0e52e22644fde69326893013a0) Thanks [@r-hashi01](https://github.com/r-hashi01)! - `create-astlide deck <name>` accepts only plain folder names (letters, digits, `-`, `_`, `.`), like `astlide import`.

## 0.2.4

### Patch Changes

- [#156](https://github.com/r-hashi01/astlide/pull/156) [`d622bf2`](https://github.com/r-hashi01/astlide/commit/d622bf287bf0442c27f442ece30010cb19a921ab) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Describe Astlide as what it is — an Astro integration ("slides that live in your Astro site"), not a framework: the npm README now lists what it does (many decks per site, PowerPoint templates in / editable PPTX out, import, embedding, `astlide mcp`) and links the docs; the starter deck's wording matches.

## 0.2.3

### Patch Changes

- [#134](https://github.com/r-hashi01/astlide/pull/134) [`00ce654`](https://github.com/r-hashi01/astlide/commit/00ce6546e2fc4aa312e7838f3d261514b7ee8fee) Thanks [@r-hashi01](https://github.com/r-hashi01)! - npm metadata: descriptions mention presentations and editable PowerPoint export, more keywords (slides, presentation, pptx, powerpoint, astro-loader …), and `homepage` points to the docs site.

## 0.2.2

### Patch Changes

- [#105](https://github.com/r-hashi01/astlide/pull/105) [`2b68573`](https://github.com/r-hashi01/astlide/commit/2b685735ff81d6b306d7deb7b8eb619a59df148a) Thanks [@r-hashi01](https://github.com/r-hashi01)! - New `astlide export` command — one CLI for every format: `astlide export my-talk [--pdf] [--pptx] [--png]`, or `--all`. PDF / PNG no longer need a running server: the site is built and served on a free port for the export, and Astro's `base` is detected. `--base-url` still exports from a server you run. Exports go to `exports/`. New projects get a `bun run export` script.

  Also fixed: exported PDFs ended with a blank page. A trailing page break and Mermaid's hover tooltip spilled past the last slide.

- [#80](https://github.com/r-hashi01/astlide/pull/80) [`fe43b55`](https://github.com/r-hashi01/astlide/commit/fe43b55dca33b26f8cfaae4791694bd4523bc031) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Update the package descriptions: "Slides that live in your Astro site".

## 0.2.1

### Patch Changes

- [#59](https://github.com/r-hashi01/astlide/pull/59) [`b1fa5b6`](https://github.com/r-hashi01/astlide/commit/b1fa5b60ed7630d80f149e60f5b26070b717d6ae) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Upgrade `@astrojs/mdx` to 8. It requires Astro 7.2.10 or later, so the `astro` peer dependency is now `^7.2.10` (was `^7.0.0`), and `create-astlide` scaffolds projects with the same range.

## 0.2.0

### Minor Changes

- [#47](https://github.com/r-hashi01/astlide/pull/47) [`f9b22b5`](https://github.com/r-hashi01/astlide/commit/f9b22b50232ac0815ccabc3089976525e61462ea) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Support Astro 7 (drops Astro 6).
  - `astro` peer dependency is now `^7.0.0`, and `@astrojs/mdx` is bumped to `^7.0.3` (which requires Astro 7).
  - The built-in `Fragment` slide component is now registered under an alias internally, since Astro 7's compiler injects its own `Fragment` binding into every `.astro` file. MDX usage (`<Fragment>`) is unchanged.
  - `create-astlide` scaffolds projects on Astro 7.

### Patch Changes

- [#49](https://github.com/r-hashi01/astlide/pull/49) [`f52de6d`](https://github.com/r-hashi01/astlide/commit/f52de6d8e969cf5174b9dc809b350ab5087d7c55) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Scaffold projects with `@astlide/core@^2.0.0` (the template still pinned `^0.1.0`, which does not support Astro 7).

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
