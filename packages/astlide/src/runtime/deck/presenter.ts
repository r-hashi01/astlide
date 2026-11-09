/**
 * The presenter window's panels: the slide moved into the current-slide panel,
 * and the next-slide preview.
 *
 * @module
 */

import type { Mount } from "./mount";

/** Move the slide into the presenter panel, unless the host rendered it there (React). */
export function placeSlideInPanel(mount: Mount, placeSlide: boolean): void {
	const { scaler } = mount;
	if (mount.isPresenter && scaler && placeSlide) {
		const presenterCurrent = document.querySelector(".presenter-current");
		if (presenterCurrent && scaler.parentElement !== presenterCurrent)
			presenterCurrent.appendChild(scaler);
	}
}

/**
 * Next-slide preview: only the presenter window loads the iframe, so the
 * audience view never fetches an extra page. The embedded page scales itself
 * to the iframe's viewport.
 */
export function showNextSlidePreview(mount: Mount): void {
	const { nextSlide } = mount.config;
	if (!mount.isPresenter || mount.isEmbedded) return;
	const nextFrame = document.querySelector(".presenter-next-frame");
	// The URL comes from the config, not from the page's markup.
	// React and Vue keep the frame across slides: point it at the new next slide.
	const shown = nextFrame?.querySelector("iframe");
	if (shown && nextSlide !== null && shown.getAttribute("src") !== mount.slideUrl(nextSlide))
		shown.src = mount.slideUrl(nextSlide);
	if (nextFrame && nextSlide !== null && !shown) {
		const iframe = document.createElement("iframe");
		iframe.src = mount.slideUrl(nextSlide);
		iframe.title = "Next slide preview";
		iframe.setAttribute("scrolling", "no");
		iframe.tabIndex = -1;
		nextFrame.appendChild(iframe);
	}
}
