---
title: Template storage
description: Keep the render service's PowerPoint templates in a directory, Amazon S3 (or R2, MinIO), Google Cloud Storage or Azure Blob Storage, and set up access for each.
---

The [render service](/guides/server/) can keep PowerPoint templates by name, so callers render with `"template": "acme"` instead of uploading the file every time. This page covers where those templates live and how to give the service access. The same store also works from your own code through `@astlide/core/templates`.

## Choose where templates live

Set `ASTLIDE_TEMPLATE_STORE` to one of these. The prefix after the bucket is optional; use it to keep the templates in one part of a bucket you share with other things.

| `ASTLIDE_TEMPLATE_STORE` | Storage |
| --- | --- |
| `/data/templates` | A directory on the server |
| `s3://<bucket>/<prefix>` | Amazon S3, or a service with an S3-compatible API such as Cloudflare R2 or MinIO |
| `gs://<bucket>/<prefix>` | Google Cloud Storage |
| `azure://<container>/<prefix>` | Azure Blob Storage |

A directory is the simplest choice for a single server. Pick a bucket when the service runs in containers that come and go, or when several servers render with the same templates.

Create the bucket or container first; Astlide doesn't create one. When the server starts, it lists the store once. If it can't reach the store or isn't allowed in, it stops with the error, so a wrong setting shows up at deploy time rather than on the first upload.

Astlide talks to each cloud through the provider's official SDK, so it finds credentials the same way the provider's own tools do: an IAM role, an attached service account or a managed identity works without any key in your configuration. The variables involved are never passed to the build and browser processes that render slides.

The Docker image and `@astlide/server` include the SDKs. When you use the store from your own code, install the one you need (see [Use the store from your own code](#use-the-store-from-your-own-code)).

## A directory

Point `ASTLIDE_TEMPLATE_STORE` at a directory. The server creates it if it's missing. In Docker, mount a volume there, or the templates disappear with the container. The image has `/data/templates` ready for this:

```bash
docker run --rm -p 8787:8787 -e ASTLIDE_API_KEY \
  -e ASTLIDE_TEMPLATE_STORE=/data/templates -v astlide-templates:/data/templates \
  --security-opt seccomp=packages/server/chromium-seccomp.json astlide-server
```

## Amazon S3

```bash
-e ASTLIDE_TEMPLATE_STORE=s3://acme-assets/astlide/templates -e AWS_REGION=ap-northeast-1
```

Credentials come from the AWS SDK's default chain. On AWS, give the service a role and set no keys at all: an ECS task role, an EC2 instance profile, or an EKS service account (IRSA or Pod Identity). Elsewhere, set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` (and `AWS_SESSION_TOKEN` for temporary credentials), or mount a shared config file and choose a profile with `AWS_PROFILE`.

The role or user needs to list the prefix and to read, write and delete the objects under it:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::acme-assets",
      "Condition": { "StringLike": { "s3:prefix": "astlide/templates/*" } }
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::acme-assets/astlide/templates/*"
    }
  ]
}
```

### Cloudflare R2, MinIO and other S3-compatible services

Use an `s3://` store and set the service's URL in `AWS_ENDPOINT_URL_S3`. With an endpoint set, Astlide puts the bucket in the URL path, which these services expect, and uses `us-east-1` unless you set a region.

```bash
# Cloudflare R2: an API token with Object Read & Write on the bucket
-e ASTLIDE_TEMPLATE_STORE=s3://astlide-templates \
-e AWS_ENDPOINT_URL_S3=https://<account-id>.r2.cloudflarestorage.com -e AWS_REGION=auto \
-e AWS_ACCESS_KEY_ID=<access key id> -e AWS_SECRET_ACCESS_KEY=<secret access key>

# MinIO
-e ASTLIDE_TEMPLATE_STORE=s3://astlide-templates \
-e AWS_ENDPOINT_URL_S3=http://minio:9000 \
-e AWS_ACCESS_KEY_ID=<access key> -e AWS_SECRET_ACCESS_KEY=<secret key>
```

## Google Cloud Storage

```bash
-e ASTLIDE_TEMPLATE_STORE=gs://acme-assets/astlide/templates
```

Credentials come from Application Default Credentials. On Cloud Run, GKE (with Workload Identity) and Compute Engine, the service account attached to the service is used, and nothing else needs setting. Elsewhere, create a key for a service account, mount the JSON file and point `GOOGLE_APPLICATION_CREDENTIALS` at it:

```bash
docker run … \
  -e ASTLIDE_TEMPLATE_STORE=gs://acme-assets/astlide/templates \
  -e GOOGLE_APPLICATION_CREDENTIALS=/secrets/astlide-sa.json \
  -v "$PWD/astlide-sa.json:/secrets/astlide-sa.json:ro" astlide-server
```

On your own machine, `gcloud auth application-default login` is enough.

Give the service account the Storage Object User role on the bucket. It covers reading, writing, deleting and listing objects:

```bash
gcloud storage buckets add-iam-policy-binding gs://acme-assets \
  --member=serviceAccount:astlide@<project>.iam.gserviceaccount.com \
  --role=roles/storage.objectUser
```

To try things against an emulator such as fake-gcs-server, set `STORAGE_EMULATOR_HOST` to its URL.

## Azure Blob Storage

```bash
-e ASTLIDE_TEMPLATE_STORE=azure://templates/astlide -e AZURE_STORAGE_ACCOUNT=acmeassets
```

The first part after `azure://` is the container. Astlide signs in with the first of these that is set:

| Set | Sign-in |
| --- | --- |
| `AZURE_STORAGE_CONNECTION_STRING` | The account's connection string (from the portal's Access keys page). `AZURE_STORAGE_ACCOUNT` isn't needed. |
| `AZURE_STORAGE_ACCOUNT` and `AZURE_STORAGE_KEY` | The account name and one of its access keys. |
| `AZURE_STORAGE_ACCOUNT` and `AZURE_STORAGE_SAS_TOKEN` | A SAS token for the container, with read, create, write, delete and list permissions (`rcwdl`). |
| `AZURE_STORAGE_ACCOUNT` only | Microsoft Entra ID, through `DefaultAzureCredential`. |

Entra ID avoids keys altogether. On Azure Container Apps, App Service, AKS (with workload identity) and virtual machines, the managed identity is used. Elsewhere, set a service principal in `AZURE_TENANT_ID`, `AZURE_CLIENT_ID` and `AZURE_CLIENT_SECRET`, or sign in with `az login` on your own machine. Give the identity the Storage Blob Data Contributor role on the container:

```bash
az role assignment create --assignee <identity's client id> \
  --role "Storage Blob Data Contributor" \
  --scope /subscriptions/<sub>/resourceGroups/<group>/providers/Microsoft.Storage/storageAccounts/acmeassets/blobServices/default/containers/templates
```

For Azurite or a sovereign cloud, set the blob endpoint in `AZURE_STORAGE_BLOB_ENDPOINT` (for Azurite, `http://127.0.0.1:10000/devstoreaccount1`).

## Use the store from your own code

`@astlide/core/templates` is the store the render service uses. `openTemplateStore()` takes the same values as `ASTLIDE_TEMPLATE_STORE`:

```ts
import { openTemplateStore } from "@astlide/core/templates";

const store = openTemplateStore("gs://acme-assets/astlide/templates");
await store.put("acme", await readFile("acme.potx"), { ext: ".potx", label: "Acme 2026" });
await store.list();          // every template, with its versions
await store.get("acme");     // the latest version and its file
await store.get("acme", 1);  // version 1
await store.remove("acme");  // all versions
```

Install the SDK for the storage you use: `bun add @aws-sdk/client-s3`, `bun add @google-cloud/storage`, or `bun add @azure/storage-blob` (plus `@azure/identity` to sign in with Entra ID). If it's missing, the store says which package to add.

To pass your own client, for example one with a custom retry policy, create the store directly:

```ts
import { S3Client } from "@aws-sdk/client-s3";
import { createS3TemplateStore } from "@astlide/core/templates";

const store = createS3TemplateStore({
  bucket: "acme-assets",
  prefix: "astlide/templates",
  client: new S3Client({ region: "ap-northeast-1", maxAttempts: 5 }),
});
```

`createGcsTemplateStore({ bucket, prefix, storage })` and `createAzureBlobTemplateStore({ container, prefix, client })` work the same way.

For another storage service, implement `ObjectStorage`. It reads, writes, deletes and lists objects by key, and `createObjectTemplateStore()` builds the versioning on top:

```ts
import { createObjectTemplateStore, type ObjectStorage } from "@astlide/core/templates";

const storage: ObjectStorage = {
  read: async (key) => /* the object's bytes, or undefined if it doesn't exist */,
  write: async (key, data) => { /* store the whole object at once */ },
  delete: async (key) => { /* remove it; a missing object is fine */ },
  list: async (prefix) => /* every key starting with prefix */,
};
const store = createObjectTemplateStore(storage);
```

## How templates are kept

Under the prefix, each template has a key prefix of its own name, holding `manifest.json` (its label and versions) and one file per version as uploaded:

```
astlide/templates/
├── acme/
│   ├── manifest.json
│   ├── v1.potx
│   └── v3.potx
└── brand/
    ├── manifest.json
    └── v1.pptx
```

To back the templates up or move them to another storage, copy everything under the prefix. Change templates through the API rather than by editing these files.

Any number of servers can render from one store. Let only one of them add or delete templates, though: a store has no lock across servers, and two uploads to the same template at the same moment can overwrite each other's manifest.
