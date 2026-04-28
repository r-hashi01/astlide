---
"create-astlide": patch
---

Make tsconfig + source compatible with TypeScript 6: explicitly include `node` in `compilerOptions.types` and annotate readline callback parameters as `string` (TS 6 no longer infers them implicitly).
