---
"@astlide/core": minor
---

Use a template store everywhere, not only in the render service:

- `astlide({ templates: "s3://bucket/prefix" })` (or a folder, `gs://`, `azure://`, or a `TemplateStore`): every stored template becomes a theme of its name, in its latest version. In dev, a folder store is watched and the server restarts when a template changes.
- `astlide template list | add | show | download | remove`, on `--store <location>` or `ASTLIDE_TEMPLATE_STORE`.
- `astlide mcp --template-store <location>`: a read-only `list_templates` tool, and `template_layouts` takes a stored template's name.

`@astlide/core/templates` no longer needs the cloud SDKs' types to type-check: client options take structural types (`S3ClientLike`, `GcsClientLike`, `ContainerClientLike`), which the SDKs' own clients satisfy.
