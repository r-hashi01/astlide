/**
 * `POST /import` (a .pptx or Google Slides URL → slides as HTML) and
 * `POST /templates/layouts` (a template's layouts and placeholders).
 *
 * @module
 */

import { BadRequest } from "../deck";
import { fetchGoogleSlides, parsePptx } from "../importer";
import { json, optionalString, parseInput } from "../request";
import type { RouteContext } from "./context";

/** The `/import` and `/templates/layouts` handlers. */
export function importRoutes({ options, queue, parseOptions }: RouteContext) {
	async function importRoute(req: Request): Promise<Response> {
		const { fields, files } = await parseInput(req, options.maxBodyBytes);
		const url = optionalString(fields, "url");
		const data =
			files.file?.data ?? (url ? await fetchGoogleSlides(url, options.maxBodyBytes) : undefined);
		if (!data) throw new BadRequest('send a .pptx as "file", or a Google Slides "url"');
		return json(await queue.run(() => parsePptx("deck", data, parseOptions)));
	}

	async function layoutsRoute(req: Request): Promise<Response> {
		const { files } = await parseInput(req, options.maxBodyBytes);
		const file = files.file ?? files.template;
		if (!file) throw new BadRequest('send the template as "file"');
		return json(await queue.run(() => parsePptx("layouts", file.data, parseOptions)));
	}

	return { importRoute, layoutsRoute };
}
