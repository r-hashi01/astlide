---
"@astlide/core": patch
---

`check_deck` and PowerPoint export lay out CSS grid columns as browsers do: `auto` columns as wide as their content, fixed widths, `fr` sharing the rest, `minmax()`, `repeat()` with `auto-fill` / `auto-fit`, and items spanning columns (`grid-column: span N` or `1 / -1`). Before, every grid had equal columns, one per `1fr`.
