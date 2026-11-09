/**
 * Full reloads after an editor write (or a slide file added or removed)
 * replaced by the editor's own HMR events.
 *
 * @module
 */

/** How long after a write (or file add/remove) a full reload is considered its echo. */
export const RELOAD_ECHO_MS = 3000;

type HotPayload = { type?: string; event?: string; path?: string; data?: unknown };

export type Sender = (payload: HotPayload, ...rest: unknown[]) => void;

/** A change whose reload echo should become `event` instead. */
export interface PendingChange {
	event: string;
	path: string;
	removed?: boolean;
}

/**
 * Wrap a hot channel's `send` so that, shortly after an editor write or a slide
 * file being added / removed, every `full-reload` becomes the pending change's
 * event instead. Astro may send several per change (one per changed module, and
 * a later one once the content store has synced); the client coalesces them, so
 * the last refresh is guaranteed to see the settled page. The content store's
 * reload (`path: "*"`) is flagged `committed`: the new content is in place.
 */
export function interceptReloads(
	channel: { send: Sender } | undefined,
	pending: () => PendingChange | null,
): void {
	if (!channel || (channel.send as Sender & { __astlide?: true }).__astlide) return;
	const original = channel.send.bind(channel) as Sender;
	const wrapped: Sender & { __astlide?: true } = (payload, ...rest) => {
		const change = pending();
		if (change && payload && typeof payload === "object" && payload.type === "full-reload") {
			const { event, ...data } = change;
			const committed = payload.path === "*" ? { committed: true } : {};
			original({ type: "custom", event, data: { ...data, ...committed } });
			return;
		}
		original(payload, ...rest);
	};
	wrapped.__astlide = true;
	channel.send = wrapped;
}
