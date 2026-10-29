---
"@astlide/core": minor
---

Add `@astlide/core/templates`: a store that keeps PowerPoint templates by name, with every uploaded version. Keep them in a folder, in Amazon S3 or an S3-compatible service (R2, MinIO …), Google Cloud Storage or Azure Blob Storage, or in any storage you plug in through `ObjectStorage`. `openTemplateStore("gs://bucket/prefix")` picks the storage from a location; the cloud SDKs are optional peer dependencies, and credentials come from each SDK's usual chain (IAM roles, service accounts, managed identities). The render service uses it for its new `/templates` routes.
