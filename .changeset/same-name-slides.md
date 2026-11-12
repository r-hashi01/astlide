---
"@astlide/core": patch
"@astlide/astro": patch
---

Two slide files whose names differ only in extension (`03-intro.md` and `03-intro.html`) are an error naming them, in every framework. The Astro loader used to show one of them and drop the other without a word, while React / Vue / Next / Nuxt showed both; removing one in `astro dev` could also hide the other.
