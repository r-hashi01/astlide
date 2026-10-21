---
"@astlide/core": patch
---

Pictures and fonts from `.pptx` decks and templates are stored by what their bytes are, not by the name the file gives them; anything that isn't a picture or a font — or a font whose first bytes could start a script — is left out. A build publishes only the `.pptx` assets the site uses (slides that aren't hidden, and templates), not everything in the cache from removed decks or older versions of a file.
