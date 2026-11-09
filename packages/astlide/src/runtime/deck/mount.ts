/**
 * What every feature of a mounted slide page shares: the page's config and
 * mode, slide URLs, and one place to add listeners and cleanups, so a feature
 * can't outlive its mount (React and Vue mount again on the same elements for
 * each slide).
 *
 * @module
 */

import { slideUrl as pageSlideUrl } from "../page";
import type { DeckRuntimeConfig } from "../types";

export interface Mount {
	config: DeckRuntimeConfig;
	/** The presenter window (`data-presenter`). */
	isPresenter: boolean;
	/**
	 * Inside an iframe (overview thumbnail, presenter next-slide preview,
	 * `<astlide-deck>`): the page only renders, without focus grab, keyboard /
	 * touch navigation or presenter sync.
	 */
	isEmbedded: boolean;
	/** The element the slide is scaled in (`#slide-scaler`). */
	scaler: HTMLElement | null;
	/** A slide's URL, with the site's base path and trailing-slash convention. */
	slideUrl(n: number, query?: string): string;
	/** A slide's URL in this window's mode (`?presenter` in the presenter window, `?share` in share mode). */
	modeUrl(n: number): string;
	/** Add a listener, removed when the mount is disposed. */
	listen<E extends Event>(
		target: EventTarget,
		type: string,
		handler: (e: E) => void,
		options?: boolean | AddEventListenerOptions,
	): void;
	/** Run `fn` when the mount is disposed (in the order added). */
	onDispose(fn: () => void): void;
}

/** A mount for `config`, and the function that disposes of it. */
export function createMount(config: DeckRuntimeConfig): { mount: Mount; dispose(): void } {
	const { deck, basePath, trailingSlash } = config;
	const root = document.documentElement;
	const isPresenter = root.hasAttribute("data-presenter");
	const disposers: (() => void)[] = [];
	const slideUrl = (n: number, query?: string): string =>
		pageSlideUrl(deck, n, { basePath, trailingSlash }, query);
	const mount: Mount = {
		config,
		isPresenter,
		isEmbedded: root.hasAttribute("data-embed"),
		scaler: document.getElementById("slide-scaler"),
		slideUrl,
		modeUrl: (n) => {
			const flags = [isPresenter && "presenter", root.hasAttribute("data-share") && "share"];
			const query = flags.filter(Boolean).join("&");
			return slideUrl(n, query ? `?${query}` : "");
		},
		listen(target, type, handler, options) {
			const fn = handler as EventListener;
			target.addEventListener(type, fn, options);
			disposers.push(() => target.removeEventListener(type, fn, options));
		},
		onDispose(fn) {
			disposers.push(fn);
		},
	};
	return {
		mount,
		dispose() {
			for (const fn of disposers.splice(0)) fn();
		},
	};
}
