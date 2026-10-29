# Patched dependencies

`bun install` applies these (`patchedDependencies` in the root `package.json`).

- **`vitest@5.0.5.patch`**: the fix from [vitest-dev/vitest#11709](https://github.com/vitest-dev/vitest/pull/11709) for [#11682](https://github.com/vitest-dev/vitest/issues/11682). Vitest 5.0.5's server module runner reads cached module source as a Buffer. With Vite 8.3.5, mapping an error's stack then crashes (`TypeError: code.charCodeAt is not a function`), and the error that was being reported is lost (our #281). **Remove this patch** when upgrading to a Vitest release that includes #11709 (after 5.0.5).
