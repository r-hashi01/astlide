---
"@astlide/core": patch
---

Built decks now navigate around hidden slides: ←/→, Home/End, the toolbar and presenter buttons, the next-slide preview and the overview skip `hidden: true` slides. Before, ← from the slide after a hidden one landed on its redirect and bounced back, so you couldn't go back past it.
