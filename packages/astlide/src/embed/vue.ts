/**
 * Vue wrapper for `<astlide-deck>` (`@astlide/core/embed`).
 *
 * ```vue
 * <script setup>
 * import { AstlideDeck } from "@astlide/core/embed/vue";
 * const deck = ref();
 * </script>
 * <template>
 *   <AstlideDeck ref="deck" src="/my-talk/" controls @slidechange="(d) => console.log(d.slide)" />
 *   <button @click="deck.next()">Next</button>
 * </template>
 * ```
 *
 * `slidechange` is emitted with the event's detail. The component exposes
 * `next()`, `prev()`, `goTo(n)`, `requestFullscreen()` and `element`. Requires
 * `vue` (an optional peer dependency of `@astlide/core`). Renders on the
 * server too; the element is registered in the browser.
 *
 * @module
 */

import {
	type AstlideDeckElement,
	defineAstlideDeck,
	type SlideChangeDetail,
} from "@astlide/core/embed";
import { defineComponent, h, type PropType, ref } from "vue";

defineAstlideDeck();

/** `<astlide-deck>` as a Vue component. */
export const AstlideDeck = defineComponent({
	name: "AstlideDeck",
	props: {
		/** URL of the deck root, e.g. `/my-talk/`. */
		src: { type: String, required: true },
		/** Slide shown first (1-based, default 1). */
		start: { type: Number as PropType<number>, default: undefined },
		/** Show previous / next, a slide counter and fullscreen below the deck. */
		controls: { type: Boolean, default: false },
		/** Accessible name of the frame. */
		label: { type: String, default: undefined },
	},
	emits: {
		slidechange: (_detail: SlideChangeDetail) => true,
	},
	setup(props, { emit, expose }) {
		const element = ref<AstlideDeckElement | null>(null);
		expose({
			element,
			next: () => element.value?.next(),
			prev: () => element.value?.prev(),
			goTo: (n: number) => element.value?.goTo(n),
			requestFullscreen: () => element.value?.requestFullscreen(),
		});
		return () =>
			h("astlide-deck", {
				ref: element,
				// ^attr: set as attributes, not properties (works before the element upgrades).
				"^src": props.src,
				"^start": props.start === undefined ? undefined : String(props.start),
				"^controls": props.controls ? "" : undefined,
				"^label": props.label,
				onSlidechange: (e: CustomEvent<SlideChangeDetail>) => emit("slidechange", e.detail),
			});
	},
});

export type { AstlideDeckElement, SlideChangeDetail };
