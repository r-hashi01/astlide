---
"@astlide/core": minor
---

Add `@astlide/core/templates`: a store that keeps PowerPoint templates by name, with every uploaded version, in a folder (`createTemplateStore`), in S3 or any S3-compatible storage such as R2 or MinIO (`createS3TemplateStore`, no AWS SDK needed), or in any storage you plug in through `ObjectStorage`. `openTemplateStore("s3://bucket/prefix")` reads the usual AWS variables. The render service uses it for its new `/templates` routes.
