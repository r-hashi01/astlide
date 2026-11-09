---
"@astlide/core": patch
---

`astlide import` and `astlide template add` name decks, slide files and templates without breaking accented or voiced letters: `Café Überblick.pptx` becomes `cafe-uberblick` (was `cafe-u-berblick`), `ガイド` stays `ガイド` (was `カ-イト`). Template layout names are unchanged, so decks keep finding their layouts.
