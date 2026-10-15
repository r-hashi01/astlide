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
- Chromium for the browser tests: `bunx playwright install chromium` once.

## Repository layout

```
packages/astlide/         @astlide/core — Astro Integration (source-only npm package)
packages/create-astlide/  create-astlide — CLI scaffolder
playground/               development Astro project (not published)
e2e/                      browser tests (Playwright): layout properties and keyboard flows
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
bun run test:e2e        # browser tests on the built playground (builds it if dist/ is missing; E2E_BUILD=1 to rebuild)
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
| Browser (layout) | `e2e/layout.test.ts` | New layout or theme: add the property it must keep (parts' placement, nothing spilling out of the slide) |
| Browser (presenting) | `e2e/navigation.test.ts` | New keyboard shortcut, dialog or step behaviour in `DeckLayout.astro` |

`astro-components.test.ts` runs in a dedicated vitest project (`vmThreads` pool) — `getViteConfig` plus a `forks` worker deadlocks when transforming `.astro` files, so this suite is isolated to keep the rest of the test pyramid fast.

The browser tests check properties rather than pixels: every slide is 1920×1080 and nothing spills out of it, each layout places its parts (two columns side by side, equal `<Columns>`, the image beside the text …), every theme styles the slides, and the keyboard drives slides, steps, the overview, go-to and notes. Changing a deck's content or a font doesn't need new baselines, and a failure names the slide and the element. They run on the built playground (served statically, so a running `astro dev` doesn't get in the way) in the `E2E` CI job on every pull request.

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
