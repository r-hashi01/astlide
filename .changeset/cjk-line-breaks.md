---
"@astlide/core": patch
---

`check_deck` and PowerPoint export break Japanese, Chinese and Korean lines between characters (with kinsoku: no closing punctuation or small kana at the start of a line, no opening bracket at the end), as browsers do. Before, a sentence without spaces ran off the right edge and was reported as overflowing.
