---
"@astlide/core": patch
---

A plugin theme's `cssEntrypoint` can now be a project path starting with `./` or `../`, resolved from the project root like layout and decorator entrypoints. Previously the build failed with "Module not found". Entrypoints starting with `/` are now left for Vite to resolve (from the project root, or as an absolute file path) instead of being treated as file-system paths.
