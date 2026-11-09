/**
 * The API key check: `Authorization: Bearer <key>` or `X-API-Key`.
 *
 * @module
 */

import { timingSafeEqual } from "node:crypto";

/** Whether a request carries the key (always true without one). */
export function apiKeyCheck(apiKey: string | undefined): (req: Request) => boolean {
	const key = apiKey ? Buffer.from(apiKey) : undefined;
	return function authorized(req: Request): boolean {
		if (!key) return true;
		const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
		const sent = bearer ?? req.headers.get("x-api-key");
		if (sent == null) return false;
		const got = Buffer.from(sent);
		// Constant time over the key's bytes (only a wrong length is told apart, and keys are random).
		if (got.length !== key.length) return !timingSafeEqual(key, key);
		return timingSafeEqual(got, key);
	};
}
