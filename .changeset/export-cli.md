---
"@astlide/core": minor
"create-astlide": patch
---

New `astlide export` command — one CLI for every format: `astlide export my-talk [--pdf] [--pptx] [--png]`, or `--all`. PDF / PNG no longer need a running server: the site is built and served on a free port for the export, and Astro's `base` is detected. `--base-url` still exports from a server you run. Exports go to `exports/`. New projects get a `bun run export` script.

Also fixed: exported PDFs ended with a blank page. A trailing page break and Mermaid's hover tooltip spilled past the last slide.
