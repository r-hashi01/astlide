/**
 * The slide scaled to the window (or the presenter panel), and focus moved to
 * it on load.
 *
 * @module
 */

import type { Mount } from "./mount";

export function setUpScaling(mount: Mount): void {
	const { scaler, isPresenter, isEmbedded } = mount;
	const slideEl = scaler ? scaler.querySelector(".slide") : null;

	function updateScale() {
		if (!slideEl || !scaler) return;
		const rootStyle = getComputedStyle(document.documentElement);
		const rawW = rootStyle.getPropertyValue("--slide-width").trim();
		const rawH = rootStyle.getPropertyValue("--slide-height").trim();
		const slideW = parseFloat(rawW) || 1920;
		const slideH = parseFloat(rawH) || 1080;

		let availW: number;
		let availH: number;
		if (isPresenter) {
			const area = document.querySelector(".presenter-current");
			availW = area ? area.clientWidth : window.innerWidth * 0.65;
			availH = area ? area.clientHeight : window.innerHeight;
		} else {
			// The dev editor (e) docks on the right and reserves its width here.
			const reserved = document.documentElement.hasAttribute("data-editor")
				? document.querySelector(".astlide-editor")?.getBoundingClientRect().width || 0
				: 0;
			availW = window.innerWidth - reserved;
			availH = window.innerHeight;
		}

		const scale = Math.min(availW / slideW, availH / slideH);
		scaler.style.width = `${slideW}px`;
		scaler.style.height = `${slideH}px`;
		scaler.style.transform = `scale(${scale})`;
	}

	updateScale();
	mount.listen(window, "resize", updateScale);

	// Focus management: move focus to slide content on page load
	// Not while the dev editor is open: a live refresh must leave focus (and the
	// caret) in the editor.
	if (
		scaler &&
		!isPresenter &&
		!isEmbedded &&
		!document.documentElement.hasAttribute("data-editor")
	) {
		scaler.focus({ preventScroll: true });
	}
}
