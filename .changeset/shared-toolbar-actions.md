---
"@astlide/core": patch
"@astlide/react": patch
"@astlide/vue": patch
---

`@astlide/core/runtime/chrome` exports `TOOLBAR_ACTIONS` (and its `ToolbarAction` type): the toolbar's action buttons with their labels, tooltips and glyphs. `@astlide/react` and `@astlide/vue` render their toolbars from it instead of their own copies; the markup is unchanged.
