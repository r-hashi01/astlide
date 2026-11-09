/**
 * The embedding protocol (`<astlide-deck>`, `@astlide/core/embed`): only in a
 * frame, and only for messages from the parent window. The parent's `hello`
 * names the origin we report to; commands only move within this deck.
 * Overview thumbnails and the presenter preview are framed too, but their
 * parent never says hello, so nothing changes there.
 *
 * @module
 */

import { isEditing } from "./editable";
import type { Mount } from "./mount";
import type { Navigation } from "./navigation";
import type { Steps } from "./steps";

export function setUpEmbedBridge(
	mount: Mount,
	{
		steps,
		navigation,
		goNext,
		goPrev,
	}: { steps: Steps; navigation: Navigation; goNext(): void; goPrev(): void },
): void {
	if (!mount.isEmbedded) return;
	const { deck, currentSlide, totalSlides, firstSlide, lastSlide } = mount.config;
	const { slideUrl } = mount;
	const { navTo } = navigation;
	function embedState() {
		return {
			source: "astlide-deck",
			type: "slidechange",
			deck,
			slide: currentSlide,
			total: totalSlides,
			step: steps.current + 1,
			steps: steps.count,
		};
	}

	function postToHost() {
		const host = window.__astlide_embed_host;
		if (!host) return;
		// A "null" host (a file: page, a sandboxed frame) can't be named as the
		// target; the message still only goes to window.parent, and says no
		// more than any page that frames the deck can learn.
		try {
			window.parent.postMessage(embedState(), host === "null" ? "*" : host);
		} catch (_) {
			/* ignore */
		}
	}

	function embedCommand(type: string, slide?: number): void {
		const before = steps.current;
		if (type === "next") goNext();
		else if (type === "prev") goPrev();
		else if (type === "first" && firstSlide !== currentSlide) navTo(slideUrl(firstSlide));
		else if (type === "last" && lastSlide !== currentSlide) navTo(slideUrl(lastSlide));
		else if (
			type === "goto" &&
			slide !== undefined &&
			Number.isInteger(slide) &&
			slide >= 1 &&
			slide <= totalSlides &&
			slide !== currentSlide
		) {
			navTo(slideUrl(slide));
		}
		// A new slide reports itself once loaded; a step change is reported here.
		if (steps.current !== before) postToHost();
	}

	function handleEmbedMessage(e: MessageEvent): void {
		if (e.source !== window.parent) return;
		const data = e.data;
		if (!data || typeof data !== "object" || data.source !== "astlide-embed") return;
		if (data.type === "hello") {
			window.__astlide_embed_host = e.origin;
			postToHost();
			return;
		}
		if (e.origin !== window.__astlide_embed_host) return;
		embedCommand(data.type, data.slide);
	}

	// Keys pressed inside the embedded deck (once a host page has said hello).
	function handleEmbedKeydown(e: KeyboardEvent): void {
		if (!window.__astlide_embed_host || e.altKey || e.ctrlKey || e.metaKey) return;
		if (isEditing(e.target)) return;
		const type = (
			{
				ArrowRight: "next",
				" ": "next",
				PageDown: "next",
				ArrowLeft: "prev",
				PageUp: "prev",
				Home: "first",
				End: "last",
			} as Record<string, string>
		)[e.key];
		if (!type) return;
		e.preventDefault();
		embedCommand(type);
	}

	mount.listen(window, "message", handleEmbedMessage);
	mount.listen(document, "keydown", handleEmbedKeydown);
	// After a navigation inside the frame, tell the host where we are.
	postToHost();
}
