/**
 * Templates in Azure Blob Storage, through `@azure/storage-blob` (and
 * `@azure/identity` for Microsoft Entra ID sign-in).
 *
 * @module
 */

import { errorCode, lazySdk, normalizePrefix } from "./sdk";
import {
	createObjectTemplateStore,
	type ObjectStorage,
	type TemplateStore,
	TemplateStoreError,
} from "./store";

export interface AzureBlobStorageOptions {
	container: string;
	/** A blob name prefix, e.g. `astlide/templates`. */
	prefix?: string;
	/** A client of your own; the options below are then ignored. */
	client?: ContainerClientLike;
	/** A storage account connection string (`DefaultEndpointsProtocol=…;AccountName=…;AccountKey=…`). */
	connectionString?: string;
	/** The storage account name, when there is no connection string. */
	account?: string;
	/** The account's access key (Shared Key). */
	accountKey?: string;
	/** A SAS token for the container (`sv=…&sig=…`). */
	sasToken?: string;
	/** Default `https://<account>.blob.core.windows.net`. */
	endpoint?: string;
}

/** What the store uses of a `ContainerClient` (from `@azure/storage-blob`). */
export interface ContainerClientLike {
	getBlockBlobClient(name: string): {
		downloadToBuffer(): Promise<Uint8Array>;
		uploadData(data: Uint8Array): Promise<unknown>;
		deleteIfExists(): Promise<unknown>;
	};
	listBlobsFlat(options: { prefix: string }): AsyncIterable<{ name: string }>;
}

interface ServiceClient {
	getContainerClient(name: string): ContainerClientLike;
}
/** The parts of `@azure/storage-blob` used here (its types aren't needed to type-check this file). */
interface BlobSdk {
	BlobServiceClient: (new (
		url: string,
		credential?: unknown,
	) => ServiceClient) & {
		fromConnectionString(connectionString: string): ServiceClient;
	};
	StorageSharedKeyCredential: new (account: string, key: string) => unknown;
}

const blobSdk = lazySdk<BlobSdk>("@azure/storage-blob");
const identitySdk = lazySdk<{ DefaultAzureCredential: new () => unknown }>("@azure/identity");

/**
 * The container's client. With only `account`, it signs in with
 * `DefaultAzureCredential`: environment variables, workload identity, a
 * managed identity, or the Azure CLI's login.
 */
async function containerClient(o: AzureBlobStorageOptions): Promise<ContainerClientLike> {
	if (o.client) return o.client;
	const { BlobServiceClient, StorageSharedKeyCredential } = await blobSdk();
	if (o.connectionString)
		return BlobServiceClient.fromConnectionString(o.connectionString).getContainerClient(
			o.container,
		);
	if (!o.account)
		throw new TemplateStoreError("Azure Blob Storage needs a connection string or an account name");
	const endpoint = (o.endpoint ?? `https://${o.account}.blob.core.windows.net`).replace(/\/$/, "");
	if (o.accountKey)
		return new BlobServiceClient(
			endpoint,
			new StorageSharedKeyCredential(o.account, o.accountKey),
		).getContainerClient(o.container);
	if (o.sasToken)
		return new BlobServiceClient(`${endpoint}?${o.sasToken.replace(/^\?/, "")}`).getContainerClient(
			o.container,
		);
	const { DefaultAzureCredential } = await identitySdk();
	return new BlobServiceClient(endpoint, new DefaultAzureCredential()).getContainerClient(
		o.container,
	);
}

/** An {@link ObjectStorage} in an Azure Blob Storage container. */
export function azureBlobStorage(options: AzureBlobStorageOptions): ObjectStorage {
	const prefix = normalizePrefix(options.prefix);
	let client: Promise<ContainerClientLike> | undefined;
	const container = () => {
		client ??= containerClient(options).catch((e) => {
			client = undefined;
			throw e;
		});
		return client;
	};
	return {
		async read(key) {
			try {
				return new Uint8Array(
					await (await container()).getBlockBlobClient(prefix + key).downloadToBuffer(),
				);
			} catch (e) {
				// Only a missing blob: a missing container (also a 404) is an error.
				if (errorCode(e) === "BlobNotFound") return undefined;
				throw e;
			}
		},
		async write(key, data) {
			await (await container()).getBlockBlobClient(prefix + key).uploadData(data);
		},
		async delete(key) {
			await (await container()).getBlockBlobClient(prefix + key).deleteIfExists();
		},
		async list(sub) {
			const keys: string[] = [];
			for await (const blob of (await container()).listBlobsFlat({ prefix: prefix + sub }))
				if (blob.name.startsWith(prefix)) keys.push(blob.name.slice(prefix.length));
			return keys;
		},
	};
}

/** A {@link TemplateStore} in an Azure Blob Storage container. */
export function createAzureBlobTemplateStore(options: AzureBlobStorageOptions): TemplateStore {
	return createObjectTemplateStore(azureBlobStorage(options));
}
