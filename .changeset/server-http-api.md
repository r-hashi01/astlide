---
"@astlide/server": minor
---

New: `@astlide/server`, an HTTP render service with an OpenAPI 3.1 spec and a Dockerfile. `POST /render` turns Markdown slides (with a built-in theme or an uploaded PowerPoint template) into editable PPTX, PDF or PNG; `POST /import` turns a `.pptx` or Google Slides deck into HTML slides; `POST /templates/layouts` lists a template's layouts and placeholders. Nothing is stored: each request's project is deleted once its response is ready. Usable as a custom tool in Dify, n8n and others via `GET /openapi.json`.
