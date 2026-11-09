---
"@astlide/core": patch
---

Layout engine (`check_deck` and the PowerPoint export), CSS grid: rows are sized by their tracks (`auto 1fr` gives the free space to the `fr` row, `1fr 3fr` splits it 1:3, fixed rows keep their size); items are placed by line numbers (`grid-column: 2 / -1`, `grid-column-start`, `grid-row`, `grid-area: 2 / 2 / 3 / 4`); `fr` tracks keep other tracks' `minmax()` minimums; `place-self`, `place-content` and auto margins center items.
