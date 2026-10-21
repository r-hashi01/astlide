---
"@astlide/engine": patch
"@astlide/core": patch
---

SVG rasterized for PPTX export (remote SVG images, inline SVG) only draws in-document references and inline PNG / JPEG / GIF / WebP images; other image links, including file paths, are dropped.
