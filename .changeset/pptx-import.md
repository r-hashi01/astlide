---
"@astlide/core": minor
---

Import PowerPoint and Google Slides.

- Put a `.pptx` in a deck folder and its pages become slides, in place among the deck's other files — text kept as text, shapes, pictures and tables where they were, placeholders styled from their layout and master, notes / titles / hidden slides carried over, embedded fonts used.
- `astlide import <file.pptx | Google Slides URL> [--deck name]` turns one into an editable deck of `.html` slides.
- `@astlide/core/pptx` exports the converter (`pptxToSlides`) for your own tools.
