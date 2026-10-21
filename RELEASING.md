# Releasing Astlide

Releases are driven by [Changesets](https://github.com/changesets/changesets) + the [`Release` GitHub Actions workflow](.github/workflows/release.yml). After the initial v0.1.0 cut (see "First publish" below), normal releases are fully automated.

## Pre-publish checklist (run locally before tagging the first release)

```bash
bun install --frozen-lockfile
bun run lint
bun run test
bun run build
node scripts/test-template.mjs   # template smoke
```

All five must pass cleanly. CI runs the same plus the astro-compat matrix and the browser tests (`bun run test:e2e`).

## First publish (v0.1.0) — one-time manual

The repository ships v0.1.0 as the initial release, so there is no prior changeset to apply. The CHANGELOG entries are already authored manually under `packages/*/CHANGELOG.md`.

1. **Reserve the npm scope.** Confirm the maintainer owns the `@astlide` scope on npm and that `npm whoami` matches.
   ```bash
   npm login                       # interactive
   npm access list packages        # confirm the scope is yours (npm CLI 11+)
   # On older CLIs:  npm access ls-packages
   ```
   If `@astlide` is unowned, create it from <https://www.npmjs.com/settings/<user>/orgs> (or just publish — npm auto-creates the scope on first scoped publish for an authenticated user).
2. **Generate an automation token** at <https://www.npmjs.com/settings/<user>/tokens> (type: Automation). Save it as the `NPM_TOKEN` secret on GitHub:
   <https://github.com/r-hashi01/astlide/settings/secrets/actions> → New repository secret → name `NPM_TOKEN`.
3. **Verify the package contents** match expectations:
   ```bash
   cd packages/astlide && npm pack --dry-run
   cd ../create-astlide && npm pack --dry-run
   ```
   Both should list `package.json`, `README.md`, `LICENSE`, `CHANGELOG.md`, plus `src/` (core) or `dist/` + `template/` (CLI).
4. **Publish from local** (only because no prior tags exist for changesets/action to detect, and granular tokens cannot pre-authorise unscoped packages that don't exist on npm yet):

   ```bash
   # Easier: full-permission interactive auth — not a long-lived token.
   npm logout
   npm login
   npm whoami    # confirm

   # Provenance requires GitHub Actions OIDC; from local it falls back to
   # un-attested. v0.1.1+ will carry provenance via Trusted Publishing.
   cd packages/astlide
   npm publish --access=public

   cd ../create-astlide
   npm publish --access=public
   ```

   The Release workflow has its `push` trigger removed for the same chicken-egg reason — re-enable it after step 6.
5. **Tag the release in git** so changesets can compute future diffs:
   ```bash
   git tag @astlide/core@0.1.0
   git tag create-astlide@0.1.0
   git push --tags
   ```
6. **Smoke test the published packages** from a clean directory:
   ```bash
   bun create astlide /tmp/astlide-smoke
   cd /tmp/astlide-smoke && bun install && bun run build
   ```

## Trusted Publishing

Every published package (`@astlide/core`, `@astlide/engine`, `create-astlide`, `astlide`) publishes through npm Trusted Publishing (OIDC) — no npm token is stored anywhere. Each one trusts this repository's `release.yml` **in the `npm-publish` environment** only, so a modified workflow on another branch, or a job without the approval, can't publish:

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

3. Merging the version PR triggers the workflow again:
   - **Build packages** builds and packs (`scripts/release-pack.mjs`) every public package whose version isn't on npm yet. It has no publishing rights.
   - **Publish to npm** waits for approval: the `npm-publish` environment requires a maintainer's review (Actions → the run → *Review deployments* → approve). It then publishes those tarballs with provenance and creates the tags and GitHub releases. It runs none of the repository's code — no checkout, no install — so a compromised dependency can't reach the publishing credentials.

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


