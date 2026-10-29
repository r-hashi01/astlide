import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { explicitRoots, templateStoreArg } from "../src/mcp/project";
import { createServer, type ServerOptions } from "../src/mcp/server-def";
import { createTemplateStore } from "../src/templates";
import { templateFixture } from "./fixtures/pptx-template";

let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "astlide-mcp-store-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

async function connect(options: ServerOptions) {
	const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
	await createServer(options).connect(serverSide);
	const client = new Client({ name: "test", version: "0" });
	await client.connect(clientSide);
	return client;
}

const text = (r: Awaited<ReturnType<Client["callTool"]>>) =>
	(r.content as { text: string }[])[0]?.text ?? "";

describe("MCP with a template store", () => {
	it("lists stored templates and reads their layouts by name", async () => {
		const store = createTemplateStore(join(dir, "templates"));
		await store.put("acme", await templateFixture(), { ext: ".potx", label: "Acme" });
		await store.put("acme", await templateFixture(), { ext: ".potx" });
		const client = await connect({ allowedRoots: [dir], templateStore: store });

		const { tools, instructions } = {
			tools: (await client.listTools()).tools,
			instructions: client.getInstructions(),
		};
		expect(tools.map((t) => t.name)).toContain("list_templates");
		expect(tools.find((t) => t.name === "list_templates")?.annotations?.readOnlyHint).toBe(true);
		expect(instructions).toMatch(/list_templates/);

		const list = await client.callTool({ name: "list_templates", arguments: {} });
		expect(list.structuredContent).toMatchObject({
			templates: [
				{ name: "acme", label: "Acme", latest: 2, versions: [{ version: 1 }, { version: 2 }] },
			],
		});

		const layouts = await client.callTool({
			name: "template_layouts",
			arguments: { template: "acme", version: 1 },
		});
		expect(layouts.isError).toBeFalsy();
		expect(layouts.structuredContent).toMatchObject({ version: 1 });
		expect(JSON.stringify(layouts.structuredContent)).toContain("title-and-content");

		const missing = await client.callTool({
			name: "template_layouts",
			arguments: { template: "nope" },
		});
		expect(missing.isError).toBe(true);
		expect(text(missing)).toMatch(/no stored template "nope"/);
		const neither = await client.callTool({ name: "template_layouts", arguments: {} });
		expect(text(neither)).toMatch(/templatePath/);
		await client.close();
	});

	it("has no list_templates without a store", async () => {
		const client = await connect({ allowedRoots: [dir] });
		const names = (await client.listTools()).tools.map((t) => t.name);
		expect(names).not.toContain("list_templates");
		await client.close();
	});
});

describe("astlide mcp arguments", () => {
	it("reads --template-store, and keeps it out of the roots", () => {
		const args = ["--root", dir, "--template-store", "s3://bucket/x"];
		expect(templateStoreArg(args)).toBe("s3://bucket/x");
		expect(templateStoreArg(["--template-store=gs://b"])).toBe("gs://b");
		expect(templateStoreArg([])).toBeUndefined();
		expect(() => templateStoreArg(["--template-store"])).toThrow(/needs a location/);
		expect(explicitRoots(args, {})).toEqual([dir]);
	});
});
