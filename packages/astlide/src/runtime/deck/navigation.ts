/**
 * Leaving the slide: through the host's router, Astro's ClientRouter, or a
 * full page load.
 *
 * @module
 */

import type { DeckRuntimeOptions } from "../types";
import type { Mount } from "./mount";

export interface Navigation {
	/** Go to `url`, unless this mount is already leaving its slide. */
	navTo(url: string): void;
	/** Whether this mount has asked to leave its slide (and takes no more navigation). */
	readonly leaving: boolean;
}

export function createNavigation(
	mount: Mount,
	navigate: DeckRuntimeOptions["navigate"],
): Navigation {
	const { isEmbedded } = mount;
	// Once this mount has asked to leave its slide, it takes no more navigation:
	// a framework router (Nuxt, Next) changes the URL before the next slide's
	// page has replaced this one, and a key pressed in between would move from
	// this (old) slide. A navigation that hasn't replaced it in a while is taken
	// to have been cancelled.
	let leaving = false;
	let leavingTimer: ReturnType<typeof setTimeout> | undefined;
	mount.onDispose(() => clearTimeout(leavingTimer));
	return {
		get leaving() {
			return leaving;
		},
		navTo(url) {
			if (leaving) return;
			leaving = true;
			leavingTimer = setTimeout(() => {
				leaving = false;
			}, 2000);
			if (navigate) {
				navigate(url, { replace: isEmbedded && !!window.__astlide_embed_host });
				return;
			}
			if (window.__astlide_navigate) {
				// Embedded by <astlide-deck>: replace the history entry, so moving
				// through slides doesn't fill the host page's back button.
				window.__astlide_navigate(
					url,
					isEmbedded && window.__astlide_embed_host ? { history: "replace" } : undefined,
				);
			} else {
				window.location.href = url;
			}
		},
	};
}
