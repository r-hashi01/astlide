/**
 * Stored templates: `GET|POST /templates`, `GET|DELETE /templates/{name}`,
 * `GET /templates/{name}/file`.
 *
 * @module
 */

import { extname } from "node:path";
import {
	type TemplateExtension,
	type TemplateInfo,
	templateNameError,
} from "@astlide/core/templates";
import { BadRequest } from "../deck";
import { isZip, parsePptx, TEMPLATE_EXTS } from "../importer";
import { HttpError, json, optionalString, parseInput, versionParam } from "../request";
import { type RouteContext, storeOff } from "./context";

/** A template as listed: its versions without their metadata. */
const templateSummary = (info: TemplateInfo) => ({
	name: info.name,
	label: info.label ?? null,
	latest: info.latest,
	updatedAt: info.updatedAt,
	versions: info.versions.map(({ meta: _, ...v }) => v),
});

const CONTENT_TYPES: Record<string, string> = {
	".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
	".potx": "application/vnd.openxmlformats-officedocument.presentationml.template",
	".thmx": "application/vnd.ms-officetheme",
};

/** `/templates/{name}` and `/templates/{name}/file`. */
export const TEMPLATE_PATH = /^\/templates\/([^/]+)(\/file)?$/;

/** The stored-template handlers. */
export function templateRoutes({ options, queue, store, parseOptions }: RouteContext) {
	/** `POST /templates`: store a template (a new version when the name exists). */
	async function addTemplate(req: Request): Promise<Response> {
		if (!store) throw storeOff();
		const { fields, files } = await parseInput(req, options.maxBodyBytes);
		const name = optionalString(fields, "name");
		if (!name) throw new BadRequest('send the template\'s "name"');
		const nameError = name === "layouts" ? '"layouts" is reserved' : templateNameError(name);
		if (nameError) throw new BadRequest(nameError);
		const file = files.file ?? files.template;
		if (!file) throw new BadRequest('send the template as "file"');
		const ext = extname(file.name).toLowerCase() || ".pptx";
		if (!TEMPLATE_EXTS.includes(ext))
			throw new BadRequest(`"file" must be a ${TEMPLATE_EXTS.join(" / ")} file`);
		if (!isZip(file.data)) throw new BadRequest(`not a ${TEMPLATE_EXTS.join(" / ")} file`);
		// Read it once now: a file that isn't a template is refused, and its layouts are kept.
		const outline = await queue.run(() => parsePptx("layouts", file.data, parseOptions));
		const info = await store.put(name, file.data, {
			ext: ext as TemplateExtension,
			label: optionalString(fields, "label"),
			meta: { outline },
		});
		return json(templateSummary(info), info.latest === 1 && info.versions.length === 1 ? 201 : 200);
	}

	async function listTemplates(): Promise<Response> {
		if (!store) throw storeOff();
		return json({ templates: (await store.list()).map(templateSummary) });
	}

	/** `GET|DELETE /templates/{name}` and `GET /templates/{name}/file`. */
	async function templateRoute(req: Request, name: string, file: boolean): Promise<Response> {
		if (!store) throw storeOff();
		const url = new URL(req.url);
		const version = versionParam(url.searchParams.get("version"), "version");
		const missing = () =>
			new HttpError(404, `no template "${name}"${version ? ` with version ${version}` : ""}`);
		const method = req.method === "HEAD" ? "GET" : req.method;
		if (file) {
			if (method !== "GET") throw new HttpError(405, "use GET");
			const found = await store.get(name, version);
			if (!found) throw missing();
			return new Response(new Uint8Array(found.data), {
				headers: {
					"content-type": CONTENT_TYPES[found.version.ext] ?? "application/octet-stream",
					"content-disposition": `attachment; filename="${name}-v${found.version.version}${found.version.ext}"`,
				},
			});
		}
		if (method === "DELETE") {
			if (!(await store.remove(name, version))) throw missing();
			return new Response(null, { status: 204 });
		}
		if (method !== "GET") throw new HttpError(405, "use GET / DELETE");
		const info = await store.info(name);
		const chosen = info?.versions.find((v) => v.version === (version ?? info.latest));
		if (!info || !chosen) throw missing();
		// Added elsewhere (the CLI, your own code): read the layouts from the file, in the worker.
		let outline = chosen.meta?.outline;
		if (outline === undefined) {
			const stored = await store.get(name, chosen.version);
			if (!stored) throw missing();
			outline = await queue.run(() => parsePptx("layouts", stored.data, parseOptions));
		}
		return json({ ...templateSummary(info), version: chosen.version, outline });
	}

	return { addTemplate, listTemplates, templateRoute };
}
