---
"@astlide/core": patch
---

Exports bound what they download: remote images at most 20 MB, pages read for embed previews at most 2 MB, redirects followed hop by hop (at most 5). With `ASTLIDE_PUBLIC_NETWORK_ONLY=1` — set by the render service for every render — PDF / PNG rendering and the PPTX exporter only reach public internet hosts: loopback, private, link-local (cloud metadata) and other reserved addresses are refused, on every redirect too, and WebSockets and service workers are blocked.
