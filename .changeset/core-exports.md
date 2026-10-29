---
"@astlide/core": major
"@astlide/astro": major
---

**Breaking:** `@astlide/core` no longer exports `./internal/*` and `./utils/*` as wildcards. Every entry point is now listed in its `exports`.
- `@astlide/core/internal/diagrams`, `internal/recording` and `internal/pdf-export` become `@astlide/core/runtime/diagrams`, `runtime/media` and `runtime/pdf-export`.
- `utils/csp`, `utils/favicon`, `utils/pptx-templates` and `utils/slide-mark` move into `@astlide/astro`, the only package that uses them. Its internals are not public API.
- Still available: `utils/base-path`, `code-highlight`, `mermaid`, `sanitize`, `safe-url` and `slide-title`, plus the helpers the framework packages share (`comment-notes`, `markdown`, `notes`, `export-build`, `pptx-assets`, `slide-scripts`, `network`).
- Imports with a `.ts` extension (`@astlide/core/utils/network.ts`) no longer resolve. Drop the extension.
