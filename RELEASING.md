# Releasing Astlide

Releases are driven by [Changesets](https://github.com/changesets/changesets) + the [`Release` GitHub Actions workflow](.github/workflows/release.yml). After the initial v0.1.0 cut (see "First publish" below), normal releases are fully automated.

## Pre-publish checklist (run locally before tagging the first release)

```bash
bun install --frozen-lockfile
bun run lint
bun run test
bun run build
node scripts/test-template.mjs   # template smoke
node scripts/test-strict-install.mjs   # Astro, Next.js and Nuxt with a strict install
```

All six must pass cleanly. CI runs the same plus the astro-compat matrix and the browser tests (`bun run test:e2e`).

## Publishing is CI-only

Every release goes through the **Release** workflow below — never `npm publish` from a laptop, and never an npm token stored as a repository secret: either would skip the approval step and provenance. (`bun run release` refuses and points here.) The one exception is a brand-new package's very first version, described under Trusted Publishing.

To check what a package will contain before a release:

```bash
cd packages/<package> && npm pack --dry-run
```

## Trusted Publishing

Every published package (`@astlide/core`, `create-astlide`, `astlide`) publishes through npm Trusted Publishing (OIDC) — no npm token is stored anywhere. Each one trusts this repository's `release.yml` **in the `npm-publish` environment** only, so a modified workflow on another branch, or a job without the approval, can't publish:

```bash
npm trust github <package> --file release.yml --repo r-hashi01/astlide --env npm-publish --allow-publish
```

The `npm-publish` environment (repository settings → Environments) requires a maintainer's approval and only allows `main`. The `release-tags` ruleset protects the `@astlide/*`, `create-astlide@*` and `astlide@*` tags.

A new package's first version has to be published by hand (Trusted Publishing can only be set up for an existing package): `npm publish --access public` from its folder, then the `npm trust` command above.

What this does not cover: the build job runs the build (and its dependencies) to produce the tarballs, so a compromised build dependency could still change what's inside them. The split keeps such code away from the publishing credentials; review lockfile changes (including in the "version packages" PR) as you would code.

## Subsequent releases (v0.1.1 onward) — automated

For every PR that changes `@astlide/core` or `create-astlide` runtime behaviour:

1. Add a changeset describing the change:
   ```bash
   bun run changeset
   ```
   Pick `patch` for fixes, `minor` for additive features, `major` for breaking changes. Commit the generated `.changeset/*.md` file with the PR.

2. When the PR merges to `main`, the **Release** workflow opens (or updates) a "chore: version packages" PR. That PR consumes all pending changesets, bumps versions, regenerates `CHANGELOG.md`, and removes the consumed changeset files.

3. Merging the version PR triggers the workflow again. Only versions bumped by that commit are built, so a later push can't publish an older pending release; to finish a release that didn't publish (e.g. a fix had to land after the version PR), run the workflow by hand (Actions → Release → Run workflow, *Publish every version not yet on npm*).
   - **Build packages** builds and packs (`scripts/release-pack.mjs`) every public package whose version isn't on npm yet. It has no publishing rights.
   - **Publish to npm** waits for approval: the `npm-publish` environment requires a maintainer's review (Actions → the run → *Review deployments* → approve). The run's summary page lists each tarball (name, version, sha256, files) — compare it with the merged version PR before approving. It then publishes those tarballs with provenance and creates the tags and GitHub releases. It runs none of the repository's code — no checkout, no install — so a compromised dependency can't reach the publishing credentials.

No manual `npm publish` is needed after step 1.

## Release artefacts produced per version

| Artefact | Location | Owner |
|---|---|---|
| npm tarball | `https://www.npmjs.com/package/@astlide/core` | npm |
| GitHub release | Release tab on the repo | `Publish to npm` job |
| CHANGELOG.md update | `packages/*/CHANGELOG.md` | changesets |
| Git tag | `@astlide/core@x.y.z`, `create-astlide@x.y.z`, `astlide@x.y.z` | `Publish to npm` job |

## Rolling back

If a published version is bad:

1. Deprecate it (does **not** delete from npm — npm forbids unpublishing >72h):
   ```bash
   npm deprecate @astlide/core@x.y.z "Use x.y.z+1 — fixes <bug>"
   ```
2. Land the fix on `main`, add a changeset (`patch`), let the workflow publish the next patch version.

## Signed commits (required on main)

The `main` branch ruleset enforces `required_signatures`, so every commit landing on `main` must carry a verified signature. Auto-merged PRs squash-commit via GitHub's web-flow user (auto-verified). Direct pushes from a maintainer require local SSH/GPG signing setup:

```bash
ssh-keygen -t ed25519 -C "<your-handle>@github astlide signing" -f ~/.ssh/id_ed25519_astlide -N ""
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519_astlide.pub
git config --global commit.gpgsign true
git config --global tag.gpgsign true
```

Then upload the public key to <https://github.com/settings/ssh/new> as a **Signing Key** (not Authentication Key).

The release-tags ruleset deliberately does not require signatures — the publish job creates tags from inside CI without a configured signing key, and the registry-side provenance attestation already binds each tag to a verified GitHub Actions workflow run.

## Branch protection (recommended)

Once v0.1.0 is out, set up branch protection on `main`:

- Require PR review (1+ approval)
- Require status checks: `Lint`, `Type Check`, `Test`, `Build`, `Build CLI`, `Template Smoke`, both `Astro x.y.z` matrix legs
- Disallow direct pushes
- Require linear history

See <https://github.com/r-hashi01/astlide/settings/branches>.

## Reference

- [`.github/workflows/release.yml`](.github/workflows/release.yml) — automated workflow
- [`.changeset/config.json`](.changeset/config.json) — changesets config (changelog format, base branch, ignored packages)
- [Changesets docs](https://github.com/changesets/changesets/blob/main/docs/intro-to-using-changesets.md) — upstream guidance
- [npm provenance docs](https://docs.npmjs.com/generating-provenance-statements) — supply-chain transparency


