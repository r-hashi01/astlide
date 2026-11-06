---
"@astlide/core": patch
---

PowerPoint export keeps the remote images it downloads for that export only. A long-running process (the MCP server, the render service) no longer holds every image it ever exported, and two exports at once no longer share them.
