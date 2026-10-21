---
"@astlide/core": patch
---

PowerPoint import and templates bound more of their work: numbered lists start within PowerPoint's range (1–32767), each master, layout and embedded font is read once (at most 64 masters, 256 layouts, 32 font families), XML parts over 32 MB or with more than 500 000 elements are refused while parsing, and names such as `constructor` in a file no longer break color, dash or bullet lookups.
