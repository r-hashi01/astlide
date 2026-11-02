/**
 * A slide page for Vue: the toolbar, progress bar, presenter panel and
 * overlays of an Astlide site around one slide (the slot), driven by
 * Astlide's deck runtime. The markup matches `@astlide/core/runtime/chrome`;
 * load `@astlide/core/styles/deck.css`. Give the router as `navigate`.
 *
 * @module
 */

import type { DeckContext } from "@astlide/core/context";
import type { DeckRuntimeConfig, OutlineEntry } from "@astlide/core/runtime";
import { TOOLBAR_ACTIONS } from "@astlide/core/runtime/chrome";
import { mountDeckPage, setUpDeckPageTools } from "@astlide/core/runtime/deck-page";
import type { MermaidLoader } from "@astlide/core/runtime/diagrams";
import { noNotesText, slideNeighbours, slideUrl } from "@astlide/core/runtime/page";
import {
	computed,
	defineComponent,
	h,
	onBeforeUnmount,
	onMounted,
	type PropType,
	type VNode,
	watch,
} from "vue";

export const DeckPage = defineComponent({
	name: "DeckPage",
	props: {
		deck: { type: String, required: true },
		slideNumber: { type: Number, required: true },
		totalSlides: { type: Number, required: true },
		prevSlide: { type: Number as PropType<number | null>, default: undefined },
		nextSlide: { type: Number as PropType<number | null>, default: undefined },
		firstSlide: Number,
		lastSlide: Number,
		outline: Array as PropType<OutlineEntry[]>,
		basePath: { type: String, default: "" },
		trailingSlash: Boolean,
		toolbar: {
			type: Array as PropType<readonly string[]>,
			default: () => ["prev", "counter", "next"],
		},
		/** The slide's speaker notes as sanitized HTML. */
		notesHtml: String,
		notesPublished: { type: Boolean, default: true },
		persistDrawings: Boolean,
		deckContext: Object as PropType<DeckContext>,
		/** Render as the presenter window: the slide goes in the presenter panel. */
		presenter: Boolean,
		navigate: Function as PropType<(url: string, options: { replace: boolean }) => void>,
		loadMermaid: Function as PropType<NonNullable<MermaidLoader>>,
		loadPdfExport: Function as PropType<
			() => Promise<typeof import("@astlide/core/runtime/pdf-export")>
		>,
	},
	setup(props, { slots }) {
		const n = computed(() => props.slideNumber);
		const total = computed(() => props.totalSlides);
		const neighbours = computed(() => slideNeighbours(n.value, total.value, props));
		const prevSlide = computed(() => neighbours.value.prevSlide);
		const nextSlide = computed(() => neighbours.value.nextSlide);
		const slideHref = (s: number, query = "") =>
			slideUrl(
				props.deck,
				s,
				{ basePath: props.basePath, trailingSlash: props.trailingSlash },
				query,
			);
		const config = computed<DeckRuntimeConfig>(() => ({
			deck: props.deck,
			currentSlide: n.value,
			totalSlides: total.value,
			prevSlide: prevSlide.value,
			nextSlide: nextSlide.value,
			firstSlide: neighbours.value.firstSlide,
			lastSlide: neighbours.value.lastSlide,
			trailingSlash: props.trailingSlash,
			basePath: props.basePath,
			outline: props.outline ?? [],
			deckContext: props.deckContext ?? null,
			persistDrawings: props.persistDrawings,
		}));

		let unmount: (() => void) | undefined;
		const mount = () => {
			unmount?.();
			unmount = mountDeckPage(config.value, {
				navigate: props.navigate,
				loadMermaid: props.loadMermaid,
			});
		};
		onMounted(() => {
			// Camera, recording and the toolbar's PDF download, set up once per page.
			setUpDeckPageTools({ deck: props.deck, loadPdfExport: props.loadPdfExport });
			mount();
		});
		// Again for each slide, when the slide moves to / from the presenter panel (a new
		// element), and when the Mermaid loader arrives (Nuxt sets it once mounted), as in React.
		watch([config, () => props.presenter, () => props.loadMermaid], () => mount(), {
			flush: "post",
		});
		onBeforeUnmount(() => unmount?.());

		const noNotes = () => noNotesText(props.notesPublished);
		const notes = (className: string) =>
			props.notesHtml
				? h("div", { class: className, innerHTML: props.notesHtml })
				: h("p", { class: "no-notes" }, noNotes());
		const navLink = (
			href: string | null,
			className: string,
			label: string | undefined,
			text: string,
			icon?: string,
		) =>
			href === null
				? h(
						"button",
						{
							type: "button",
							class: `${className} disabled`,
							"data-icon": icon,
							"aria-label": label,
							disabled: true,
						},
						text,
					)
				: h("a", { href, class: className, "data-icon": icon, "aria-label": label }, text);

		return () => {
			const scaler = h("div", { class: "slide-scaler", id: "slide-scaler", tabindex: "-1" }, [
				slots.default?.(),
				h("canvas", { class: "draw-layer", id: "draw-layer", "aria-hidden": "true" }),
				h("div", { class: "laser-dot", id: "laser-dot", "aria-hidden": "true", hidden: "" }),
			]);
			const prev = prevSlide.value;
			const next = nextSlide.value;
			const toolbar: (VNode | null)[] = props.toolbar.map((item) => {
				if (item === "home")
					return h("a", {
						href: `${props.basePath}/`,
						class: "nav-btn nav-action",
						"data-icon": "home",
						"aria-label": "Back to deck index",
						title: "Back to deck index",
					});
				if (item === "prev")
					return navLink(
						prev === null ? null : slideHref(prev),
						"nav-btn",
						"Previous slide",
						"",
						"prev",
					);
				if (item === "next")
					return navLink(
						next === null ? null : slideHref(next),
						"nav-btn",
						"Next slide",
						"",
						"next",
					);
				if (item === "counter")
					return h("span", { class: "nav-indicator" }, `${n.value} / ${total.value}`);
				if (item === "spacer") return h("span", { class: "nav-spacer", "aria-hidden": "true" });
				const action = TOOLBAR_ACTIONS[item];
				if (!action) return null;
				const [label, title, pressed] = action;
				return h("button", {
					type: "button",
					class: "nav-btn nav-action",
					"data-icon": item,
					"data-action": item,
					"aria-label": label,
					"aria-pressed": pressed ? "false" : undefined,
					title,
				});
			});
			return [
				h("a", { href: "#slide-scaler", class: "skip-link" }, "Skip to slide content"),
				h(
					"div",
					{ class: "sr-only", "aria-live": "polite", "aria-atomic": "true", id: "slide-announcer" },
					`Slide ${n.value} of ${total.value}`,
				),
				h("div", {
					class: "progress-bar",
					style: `width: ${(n.value / total.value) * 100}%`,
					role: "progressbar",
					"aria-valuenow": n.value,
					"aria-valuemin": 1,
					"aria-valuemax": total.value,
					"aria-label": `Slide progress: ${n.value} of ${total.value}`,
				}),
				h("div", { class: "presenter-layout" }, [
					h("div", { class: "presenter-slide-area" }, [
						h("div", { class: "presenter-current" }, props.presenter ? [scaler] : []),
					]),
					h("aside", { class: "presenter-panel", "aria-label": "Presenter controls" }, [
						h("div", { class: "presenter-info" }, [
							h("span", { class: "presenter-counter" }, `${n.value} / ${total.value}`),
							h("div", { class: "timer-wrapper" }, [
								h("span", { class: "presenter-timer", id: "presenter-timer" }, "00:00"),
								h(
									"button",
									{
										class: "timer-btn",
										id: "timer-btn",
										type: "button",
										"aria-label": "Start timer",
										title: "Start timer",
									},
									"▶",
								),
								h(
									"button",
									{
										class: "timer-reset-btn",
										id: "timer-reset",
										type: "button",
										"aria-label": "Reset timer",
										title: "Reset timer",
									},
									"↺",
								),
							]),
						]),
						h("section", { class: "presenter-next", "aria-label": "Next slide" }, [
							h("div", { class: "presenter-section-header" }, [
								h("h3", "Next"),
								h("span", {
									class: "presenter-steps-left",
									id: "presenter-steps-left",
									hidden: "",
								}),
							]),
							next !== null
								? h("div", { class: "presenter-next-frame" })
								: h("p", { class: "presenter-next-end" }, "End of deck"),
						]),
						h("div", { class: "presenter-notes" }, [
							h("div", { class: "presenter-notes-header" }, [
								h("h3", "Notes"),
								h(
									"fieldset",
									{ class: "notes-font-controls", "aria-label": "Adjust notes font size" },
									[
										h(
											"button",
											{
												type: "button",
												class: "notes-font-btn",
												"data-notes-font": "dec",
												"aria-label": "Decrease notes font size",
												title: "Smaller (Shift+,)",
											},
											"A−",
										),
										h(
											"button",
											{
												type: "button",
												class: "notes-font-btn",
												"data-notes-font": "reset",
												"aria-label": "Reset notes font size",
												title: "Reset",
											},
											"A",
										),
										h(
											"button",
											{
												type: "button",
												class: "notes-font-btn",
												"data-notes-font": "inc",
												"aria-label": "Increase notes font size",
												title: "Larger (Shift+.)",
											},
											"A+",
										),
									],
								),
							]),
							notes("notes-content"),
						]),
						h("div", { class: "presenter-nav" }, [
							navLink(
								prev === null ? null : slideHref(prev, "?presenter"),
								"pnav-btn",
								undefined,
								"← Prev",
							),
							navLink(
								next === null ? null : slideHref(next, "?presenter"),
								"pnav-btn",
								undefined,
								"Next →",
							),
						]),
					]),
				]),
				h(
					"main",
					{ class: "presentation", "aria-label": "Slide presentation" },
					props.presenter ? [] : [scaler],
				),
				h("div", { id: "astlide-camera", class: "camera-bubble", hidden: "" }, [
					h("video", { "aria-label": "Camera", autoplay: "", muted: "", playsinline: "" }),
				]),
				h("div", { class: "recording-indicator", role: "status", "aria-label": "Recording" }, [
					h("span", { class: "recording-dot", "aria-hidden": "true" }),
					h("span", { id: "astlide-recording-time" }, "0:00"),
				]),
				h("nav", { class: "slide-nav", "aria-label": "Slide navigation" }, toolbar),
				h(
					"aside",
					{
						class: "notes-overlay",
						id: "notes-overlay",
						"aria-label": "Speaker notes",
						"aria-hidden": "true",
						inert: "",
					},
					[
						h("div", { class: "notes-overlay-content" }, [
							h("div", { class: "notes-overlay-header" }, [
								h("span", "Speaker Notes"),
								h(
									"button",
									{
										type: "button",
										class: "notes-close",
										id: "notes-close",
										"aria-label": "Close speaker notes",
									},
									"✕",
								),
							]),
							props.notesHtml
								? notes("notes-body")
								: h("div", { class: "notes-body" }, [notes("")]),
						]),
					],
				),
				h(
					"div",
					{
						class: "pdf-overlay",
						id: "pdf-overlay",
						role: "dialog",
						"aria-label": "Generating PDF",
						"aria-hidden": "true",
					},
					[
						h("div", { class: "pdf-overlay-card" }, [
							h("div", { class: "pdf-overlay-title" }, "Generating PDF"),
							h("div", { class: "pdf-overlay-progress" }, [
								h("div", { class: "pdf-overlay-bar", id: "pdf-overlay-bar", style: "width: 0%" }),
							]),
							h("div", { class: "pdf-overlay-status", id: "pdf-overlay-status" }, "Preparing…"),
						]),
					],
				),
				h(
					"div",
					{
						class: "overview",
						id: "overview",
						role: "dialog",
						"aria-modal": "true",
						"aria-label": "Slide overview",
						"aria-hidden": "true",
					},
					[
						h("div", { class: "overview-header" }, [
							"Overview — press ",
							h("kbd", "o"),
							" or ",
							h("kbd", "Esc"),
							" to close",
						]),
						h("ul", { class: "overview-grid", id: "overview-grid" }),
					],
				),
				h(
					"div",
					{
						class: "goto",
						id: "goto",
						role: "dialog",
						"aria-modal": "true",
						"aria-label": "Go to slide",
						"aria-hidden": "true",
					},
					[
						h("div", { class: "goto-card" }, [
							h("input", {
								class: "goto-input",
								id: "goto-input",
								type: "text",
								autocomplete: "off",
								spellcheck: "false",
								placeholder: "Go to slide — number or title",
								role: "combobox",
								"aria-expanded": "true",
								"aria-controls": "goto-list",
								"aria-autocomplete": "list",
							}),
							h("ul", {
								class: "goto-list",
								id: "goto-list",
								role: "listbox",
								"aria-label": "Slides",
							}),
						]),
					],
				),
			];
		};
	},
});
