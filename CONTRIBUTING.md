# Contributing to Astlide

Thanks for your interest in improving Astlide!

## Quick links

- 🐛 [Report a bug](https://github.com/r-hashi01/astlide/issues/new?template=bug_report.yml)
- 💡 [Request a feature](https://github.com/r-hashi01/astlide/issues/new?template=feature_request.yml)
- 🔌 [Build a plugin](README.md#plugin-api)
- 🔒 [Report a security issue](SECURITY.md) (do **not** open a public issue)

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.2 — Astlide is bun-only. Do not use npm / pnpm / yarn for repo-local installs.
- Node.js ≥ 22.12 (required by Astro 6 — Bun's Node-compat alone is not enough; `astro check` and `astro build` shell into the system `node`).
- A Chromium-based browser for e2e tests (`agent-browser` downloads one automatically).

## Repository layout

```
packages/astlide/         @astlide/core — Astro Integration (source-only npm package)
packages/create-astlide/  create-astlide — CLI scaffolder
playground/               development Astro project (not published)
e2e/                      Playwright-style e2e + visual regression tests
scripts/                  one-off measurement scripts (not published)
```

## Setup

```bash
bun install         # install all workspace dependencies
bun run dev         # start playground at http://localhost:4321
```

## Common commands

```bash
bun run lint            # Biome lint + format check
bun run lint:fix        # auto-fix lint issues
bun run format          # format with Biome
bun run test            # vitest unit tests (341 tests, ~500 ms)
bun run test:watch      # watch mode
bun run test:e2e        # e2e + visual regression (needs no running dev server — globalSetup starts one)
bun run build           # build playground
bun run docs            # generate TypeDoc API reference under docs/api/
```

## Workflow

1. **Fork & branch** — branch from `main` (`feature/...`, `fix/...`, `chore/...`).
2. **Make changes** — keep them focused. One PR = one logical change.
3. **Add a changeset** — for any user-visible change to `@astlide/core` or `create-astlide`:
   ```bash
   bun run changeset
   ```
   Pick `patch` for bug fixes, `minor` for additive features, `major` for breaking changes. The summary becomes a CHANGELOG entry, so write it for users — what changed, not implementation detail.
4. **Run the full check locally** before pushing:
   ```bash
   bun run lint && bun run test && bun run build
   ```
5. **Open a PR** — fill in the template. CI must be green before review.

## Code style

- **Biome** is the linter & formatter. Tabs for indentation, double quotes, trailing commas. Run `bun run lint:fix` before commit.
- **TypeScript strict**. No `any` unless escaping a third-party type gap (and document why).
- **TSDoc on public API.** Update doc comments when behaviour changes — comments are the source of truth, the docs site reads from them.
- **No comments on what the code does** — well-named identifiers do that. Comments are for non-obvious *why* (constraints, workarounds, surprising decisions).
- **Avoid `process.cwd()` in code that runs in different working directories.** Inside injected pages, prefer `Astro.url`, `import.meta.url`, or pre-computed absolute paths.

## Tests

| Layer | Where | When to add tests |
|---|---|---|
| Unit | `packages/astlide/tests/*.test.ts` | New schema field, new utility, new plugin contribution shape, new component prop |
| Astro components | `packages/astlide/tests/astro-components.test.ts` | New `.astro` component, new prop on existing component |
| Visual regression | `e2e/visual.test.ts` + `e2e/__snapshots__/visual/` | New layout, new theme, anything that should be visually stable. macOS-only (font drift). |

`astro-components.test.ts` runs in a dedicated vitest project (`vmThreads` pool) — see [PROBLEM.md](PROBLEM.md) for background on why.

We deliberately do **not** run general-purpose browser e2e (keyboard nav, fragment toggles, UI mode flips). Those flows live in `DeckLayout.astro`'s inline `<script>`; until that is extracted into a separately-testable module, the cost of maintaining a real-browser harness for them outweighs the value at the current project size. Visual regression is kept because the only meaningful failure mode (CSS / theme drift) genuinely requires a real browser.

### Running visual regression

```bash
bun run test:e2e                  # macOS only — runs the suite, fails if pixel diff > 0.1%
UPDATE_SNAPSHOTS=1 bun run test:e2e   # regenerate baselines after intentional visual changes
```

A weekly `Visual Regression` workflow (`.github/workflows/visual-regression.yml`) runs the suite on `macos-latest` and uploads diff PNGs as artifacts when it fails. You can also run it on demand from the Actions tab.

## Conventions to follow

- ❌ `layout` in MDX frontmatter — Astro reserves it. Use `slideLayout`.
- ❌ Relative imports across package internals. Use `@astlide/core/...` paths (resolved via the `exports` map).
- ❌ npm/pnpm/yarn. Use bun.
- ✅ Slide files numbered: `01-name.mdx`, `02-name.mdx`, …
- ✅ Deck config: `_config.json` (`title`, `author`, `date`, `theme`).

## Releasing

Releases are automated by [changesets](https://github.com/changesets/changesets) via the `release.yml` workflow. As a contributor, you only need to add a changeset — maintainers will merge the auto-generated "Version Packages" PR to publish.

## Reporting bugs / requesting features

Use the issue templates. For bugs, include:

- Astlide version (`@astlide/core` from your `package.json`)
- Astro version
- Reproduction (smallest possible MDX + config)
- What you expected vs. what happened

## License

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
