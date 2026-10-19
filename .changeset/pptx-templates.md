---
"@astlide/core": minor
---

PowerPoint templates as themes: `astlide({ templates: { brand: "./brand.pptx" } })` (also `.potx` and Office `.thmx`; Google Slides via its PowerPoint download), then `"theme": "brand"` in a deck's `_config.json`.

- Markdown slides get the template's backgrounds and artwork per layout, its theme colors and fonts, and its slide numbers.
- The first heading goes into the layout's title placeholder and the rest into its body placeholder(s), in the template's text style.
- `cover`, `section`, `default`, `two-column` and `code` use the template's matching layouts, and every template layout is available by name (`slideLayout: comparison`).
- `@astlide/core/pptx` exports `pptxToTemplate` and `templateCss`.
