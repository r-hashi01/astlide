---
"@astlide/core": minor
---

Speaker notes: `<SpeakerNotes>` is the new name of the notes component — "note" usually means a *visible* callout (GitHub `> [!NOTE]`, Qiita / Starlight `:::note`). `<Notes>` keeps working as an alias. Notes can now also be written as an HTML comment at the end of a slide, as in Slidev and Marp — in `.md`, `.mdx` and `.html` slides (priority: `<SpeakerNotes>` > frontmatter `notes` > trailing comment).
