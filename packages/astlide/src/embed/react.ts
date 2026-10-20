/**
 * React wrapper for `<astlide-deck>` (`@astlide/core/embed`).
 *
 * ```tsx
 * import { AstlideDeck } from "@astlide/core/embed/react";
 *
 * const deck = useRef<AstlideDeckElement>(null);
 * <AstlideDeck ref={deck} src="https://example.com/talks/my-talk/" controls
 *   onSlideChange={(e) => console.log(e.detail.slide)} />
 * deck.current?.next();
 * ```
 *
 * The ref is the element itself, so `next()`, `prev()`, `goTo(n)` and
 * `requestFullscreen()` are available on it. Requires `react` (an optional
 * peer dependency of `@astlide/core`). Renders on the server too; the element
 * is registered in the browser.
 *
 * @module
 */

import {
	type AstlideDeckElement,
	defineAstlideDeck,
	type SlideChangeDetail,
} from "@astlide/core/embed";
import {
	type CSSProperties,
	createElement,
	type ForwardedRef,
	type ForwardRefExoticComponent,
	forwardRef,
	type ReactElement,
	type RefAttributes,
	useEffect,
	useImperativeHandle,
	useRef,
} from "react";

defineAstlideDeck();

/** Props of {@link AstlideDeck}. */
export interface AstlideDeckProps {
	/** URL of the deck root, e.g. `/my-talk/`. */
	src: string;
	/** Slide shown first (1-based, default 1). */
	start?: number;
	/** Show previous / next, a slide counter and fullscreen below the deck. */
	controls?: boolean;
	/** Accessible name of the frame. */
	label?: string;
	className?: string;
	style?: CSSProperties;
	/** Fired when the slide or step changes, and once the deck has loaded. */
	onSlideChange?: (event: CustomEvent<SlideChangeDetail>) => void;
}

function AstlideDeckImpl(
	{ src, start, controls, label, className, style, onSlideChange }: AstlideDeckProps,
	ref: ForwardedRef<AstlideDeckElement>,
): ReactElement {
	const element = useRef<AstlideDeckElement>(null);
	useImperativeHandle(ref, () => element.current as AstlideDeckElement, []);

	// Read the latest handler without re-subscribing on every render.
	const handler = useRef(onSlideChange);
	handler.current = onSlideChange;
	useEffect(() => {
		const el = element.current;
		if (!el) return;
		const listener = (e: Event) => handler.current?.(e as CustomEvent<SlideChangeDetail>);
		el.addEventListener("slidechange", listener);
		return () => el.removeEventListener("slidechange", listener);
	}, []);

	return createElement("astlide-deck", {
		ref: element,
		src,
		start: start === undefined ? undefined : String(start),
		controls: controls ? "" : undefined,
		label,
		class: className,
		style,
	});
}

/** `<astlide-deck>` as a React component. The ref is the element. */
export const AstlideDeck: ForwardRefExoticComponent<
	AstlideDeckProps & RefAttributes<AstlideDeckElement>
> = forwardRef(AstlideDeckImpl);

export type { AstlideDeckElement, SlideChangeDetail };
