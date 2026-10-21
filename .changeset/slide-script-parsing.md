---
"@astlide/core": patch
---

Scripts in Markdown, HTML and PowerPoint slides (and template artwork) are found with a spec-compliant HTML parser (parse5), so slide markup is read the way browsers read it, and they are also removed from the final pages — `astro dev` responses and built pages — which covers what Astro adds after loading (image placeholders keep only image options). Slides cached by an earlier version, or with `slideScripts` set differently, are rendered again. Trailing-comment speaker notes are removed from rendered Markdown wherever the comment ends up (before footnotes, inside lists). The dev slide editor only mounts in the layout's own host element.
