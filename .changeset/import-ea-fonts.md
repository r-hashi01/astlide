---
"@astlide/core": patch
---

PowerPoint import: East Asian text keeps its font — a run's `a:ea` font follows its Latin font in the CSS font stack (the browser draws Japanese with it, as PowerPoint does), and the theme's East Asian fonts (`+mn-ea`, `+mj-ea`) resolve to the theme's `a:ea` faces instead of the Latin ones.
