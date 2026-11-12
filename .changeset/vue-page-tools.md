---
"@astlide/vue": patch
---

`<DeckPage>`: the toolbar's PDF download (and the recording's deck) follow the deck it shows when an app reuses the component for another deck (vue-router does for the same route), instead of keeping the first deck's.
