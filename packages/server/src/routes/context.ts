/**
 * What the routes share: the server's options, the render queue, the
 * template store, and how uploaded PowerPoint files are read.
 *
 * @module
 */

import type { ServerOptions } from "../config";
import type { Queue } from "../queue";
import { HttpError } from "../request";

export interface RouteContext {
	options: ServerOptions;
	queue: Queue;
	/** Stored templates, when `ASTLIDE_TEMPLATE_STORE` is set. */
	store: ServerOptions["templates"];
	/** Uploaded PowerPoint files are read in a child process, through the render queue. */
	parseOptions: { bun: string; timeoutMs: number; maxOutputBytes: number };
}

/** The context for a server's routes. */
export function routeContext(options: ServerOptions, queue: Queue): RouteContext {
	return {
		options,
		queue,
		store: options.templates,
		parseOptions: {
			bun: options.bun,
			timeoutMs: options.renderTimeoutMs,
			maxOutputBytes: options.maxOutputBytes,
		},
	};
}

/** The answer when a template route is used without a store. */
export const storeOff = () =>
	new HttpError(404, "template storage is off: start the server with ASTLIDE_TEMPLATE_STORE set");
