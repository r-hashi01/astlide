---
"@astlide/core": patch
"@astlide/engine": patch
---

PPTX export is sturdier against the pages and images a deck points to: embed-card links are http(s) only, page tags are read with a parser (linear time), URLs a remote response chose (an advertised oEmbed endpoint, thumbnails, `og:image`, redirects from a public server) must be public addresses, an embed or SVG that fails no longer aborts the export, SVG pictures above 50 megapixels are skipped, control characters XML can't hold are dropped, and Google Fonts downloads have a size cap and timeout.
