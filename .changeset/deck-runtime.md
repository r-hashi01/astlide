---
"@astlide/core": minor
---

The slide page's browser code (scaling, navigation, fragments and code steps, presenter sync, pen and laser, overview, go-to, notes, timer, PDF download, embedding) is now a module, `@astlide/core/runtime` (`mountDeck(config, { navigate })`, experimental), instead of an inline script on every slide page. Slide pages load it as one cached script and pass their settings as JSON. No change in behavior.
