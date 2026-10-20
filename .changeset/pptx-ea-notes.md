---
"@astlide/core": minor
---

PPTX export: speaker notes and Japanese text.

- Speaker notes (`<SpeakerNotes>`, frontmatter `notes`, a trailing `<!-- … -->`) are written to the PPTX and show in PowerPoint's notes pane.
- Text gets an East Asian font (`<a:ea>`): the CJK font the slides' CSS names, else Yu Gothic (installed with Office). The theme's East Asian font is set too, and Japanese / Korean runs are tagged `ja-JP` / `ko-KR`.
- Japanese text is measured with a Japanese font (the CSS's, else Noto Sans JP from Google Fonts), so lines break where they do in the browser.
