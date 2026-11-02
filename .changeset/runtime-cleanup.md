---
"@astlide/core": patch
---

React and Vue deck pages no longer add a new set of listeners on every slide: the runtime's cleanup now removes every listener it added (pen, overview, go-to, notes, presenter timer), stops its timers, closes an open dialog and writes pending drawings. The overview marks the current slide and the presenter's next-slide preview follows after moving between slides.
