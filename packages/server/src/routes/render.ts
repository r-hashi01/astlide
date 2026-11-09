/**
 * `POST /render`: Markdown slides (+ theme or template) → PPTX / PDF / PNG (zip).
 *
 * @module
 */

import { extname } from "node:path";
import { THEMES } from "@astlide/core/schema";
import { BadRequest, type DeckSettings, deckFiles, parseSlides } from "../deck";
import { TEMPLATE_EXTS } from "../importer";
import { createProject, removeProject, TEMPLATE_THEME } from "../project";
import { QueueFull } from "../queue";
import { FORMATS, type Format, renderProject } from "../render";
import {
	attachment,
	downloadName,
	HttpError,
	json,
	optionalString,
	parseInput,
	slidesField,
	versionParam,
} from "../request";
import { type RouteContext, storeOff } from "./context";

/** The `/render` handler. */
export function renderRoute({ options, queue, store }: RouteContext) {
	return async function render(req: Request): Promise<Response> {
		// Refuse before reading the body: a full queue shouldn't buffer more uploads.
		if (queue.full) throw new QueueFull();
		const { fields, files } = await parseInput(req, options.maxBodyBytes);
		const format = (optionalString(fields, "format") ?? "pptx") as Format;
		if (!FORMATS.includes(format))
			throw new BadRequest(`"format" must be one of ${FORMATS.join(", ")}`);
		const output = optionalString(fields, "output") ?? "file";
		if (output !== "file" && output !== "base64")
			throw new BadRequest('"output" must be "file" or "base64"');

		const slides = await parseSlides(
			{ markdown: fields.markdown, slides: slidesField(fields.slides) },
			options.maxSlides,
		);

		const settings: DeckSettings = {
			title: optionalString(fields, "title"),
			author: optionalString(fields, "author"),
			date: optionalString(fields, "date"),
		};
		const upload = files.template;
		const stored = optionalString(fields, "template");
		let template: { ext: string; data: Uint8Array } | undefined;
		if (stored !== undefined) {
			if (!store) throw storeOff();
			const version = versionParam(fields.templateVersion, "templateVersion");
			const found = await store.get(stored, version);
			if (!found)
				throw new HttpError(
					404,
					`no template "${stored}"${version ? ` with version ${version}` : ""}`,
				);
			template = { ext: found.version.ext, data: found.data };
			settings.theme = TEMPLATE_THEME;
		} else if (upload) {
			const ext = extname(upload.name).toLowerCase() || ".pptx";
			if (!TEMPLATE_EXTS.includes(ext))
				throw new BadRequest(`"template" must be a ${TEMPLATE_EXTS.join(" / ")} file`);
			template = { ext, data: upload.data };
			settings.theme = TEMPLATE_THEME;
		} else {
			const theme = optionalString(fields, "theme");
			if (theme && !(THEMES as readonly string[]).includes(theme))
				throw new BadRequest(`"theme" must be one of ${THEMES.join(", ")} (or upload a template)`);
			settings.theme = theme;
		}
		const deck = { files: deckFiles(slides, settings), template };

		const started = Date.now();
		const rendered = await queue.run(async () => {
			const root = await createProject(deck, options);
			try {
				return await renderProject(root, format, {
					bun: options.bun,
					timeoutMs: options.renderTimeoutMs,
					allowPrivateNetwork: options.allowPrivateNetwork,
					maxSlides: options.maxSlides,
					maxOutputBytes: options.maxOutputBytes,
					chromiumSandbox: options.chromiumSandbox,
				});
			} finally {
				await removeProject(root);
			}
		});
		const filename = downloadName(settings.title, rendered.ext);
		const timing = { "x-render-time-ms": String(Date.now() - started) };
		if (output === "base64")
			return json(
				{
					filename,
					contentType: rendered.contentType,
					size: rendered.data.length,
					data: rendered.data.toString("base64"),
				},
				200,
				timing,
			);
		return new Response(new Uint8Array(rendered.data), {
			headers: {
				"content-type": rendered.contentType,
				"content-disposition": attachment(filename),
				...timing,
			},
		});
	};
}
