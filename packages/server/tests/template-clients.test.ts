/**
 * The SDKs' own clients fit the template stores' client options. Checked by
 * `tsc -p packages/server` (the server has every SDK installed); core types
 * these options without the SDKs, so projects without them still type-check.
 */

import {
	type ContainerClientLike,
	createAzureBlobTemplateStore,
	createGcsTemplateStore,
	createS3TemplateStore,
	type GcsClientLike,
	type S3ClientLike,
} from "@astlide/core/templates";
import { S3Client } from "@aws-sdk/client-s3";
import { ContainerClient } from "@azure/storage-blob";
import { Storage } from "@google-cloud/storage";
import { describe, expect, it } from "vitest";

describe("cloud SDK clients", () => {
	it("can be passed to the template stores", () => {
		const s3: S3ClientLike = new S3Client({ region: "us-east-1" });
		const gcs: GcsClientLike = new Storage({ projectId: "test" });
		const azure: ContainerClientLike = new ContainerClient("https://acct.blob.core.windows.net/c");
		expect(createS3TemplateStore({ bucket: "b", client: s3 })).toHaveProperty("put");
		expect(createGcsTemplateStore({ bucket: "b", storage: gcs })).toHaveProperty("put");
		expect(createAzureBlobTemplateStore({ container: "c", client: azure })).toHaveProperty("put");
	});
});
