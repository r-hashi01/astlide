---
"@astlide/core": patch
---

PowerPoint import does less work on crafted files: placeholders are matched through a per-layout index instead of shape by shape, XML nested deeper than 256 levels is refused, and `astlide import <Google Slides URL>` caps the download (512 MB, 5 minutes) with clearer errors.
