---
"@astlide/core": patch
---

Exported PPTX files open in PowerPoint without the "repair" prompt. The built-in zip writer flagged every entry as having a data descriptor it never wrote, and stamped an invalid DOS date. Packages also now include the parts and default text styles PowerPoint itself writes (presProps / viewProps / tableStyles, master `txStyles`, `defaultTextStyle`), with timestamps without fractional seconds.
