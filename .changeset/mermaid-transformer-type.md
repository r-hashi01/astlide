---
"@astlide/core": patch
---

`astlideMermaid()` now type-checks as a Shiki transformer (`ShikiTransformer`) in your own Shiki setup. Its return type was too loose for hast's types. The code is unchanged.
