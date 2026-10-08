---
"@astlide/core": major
"create-astlide": minor
---

Support Astro 7 (drops Astro 6).

- `astro` peer dependency is now `^7.0.0`, and `@astrojs/mdx` is bumped to `^7.0.3` (which requires Astro 7).
- The built-in `Fragment` slide component is now registered under an alias internally, since Astro 7's compiler injects its own `Fragment` binding into every `.astro` file. MDX usage (`<Fragment>`) is unchanged.
- `create-astlide` scaffolds projects on Astro 7.
