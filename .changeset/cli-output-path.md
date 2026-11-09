---
"@astlide/core": patch
---

`astlide export`: relative `-o` / `--out-dir` paths start from the folder you run the command in, as the docs say — also when the command finds the project above it or you pass `--cwd`. They used to start from the project root. The default `exports/` stays in the project.
