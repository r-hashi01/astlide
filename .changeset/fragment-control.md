---
"@astlide/core": minor
---

Finer-grained reveals:

- `<Fragment until={n}>` hides a fragment again at step `n`; `<Fragment hide>` starts visible and disappears at its step.
- Fragments sharing an `index` now reveal together (previously each took its own step).
- New `<Fragments>` component reveals each list item (or child element) one step at a time.
- Fragment and code highlight steps are now synced between the presenter and audience windows — previously only slide changes were, so reveals made from the presenter window never reached the audience.
