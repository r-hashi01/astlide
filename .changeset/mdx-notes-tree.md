---
"@astlide/core": patch
---

`compileSlideMdx` / `evaluateSlideMdx` with `notes: false` leave out every `<SpeakerNotes>` / `<Notes>` element, also one that doesn't start a line (`<Left><SpeakerNotes>…</SpeakerNotes></Left>`), so Next and Nuxt pages built without notes don't carry their text.
