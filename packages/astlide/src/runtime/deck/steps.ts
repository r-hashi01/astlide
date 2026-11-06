/**
 * Steps: `<Fragment>` reveals and code highlight steps, revealed one press of
 * → at a time.
 *
 * Everything that changes on → is collected as an *event* with run()/undo().
 * Events are ordered by step number (data-fragment-index; unindexed = 0),
 * ties keep document order. Consecutive events with the same explicit
 * index form one step, so fragments sharing an index reveal together.
 *
 * @module
 */

import type { Mount } from "./mount";

/** A reveal: what it does when reached and when stepped back over. */
interface StepEvent {
	order: number;
	group: number | null;
	seq: number;
	run: () => void;
	undo: () => void;
}

/** One press of → : events sharing an index happen together. */
interface Step {
	group: number | null;
	events: StepEvent[];
}

export interface Steps {
	/** Reveal the next step; false at the last one. */
	next(): boolean;
	/** Step back; false before the first one. */
	prev(): boolean;
	/** Jump to a step (-1: none revealed), e.g. to mirror the other window. */
	goTo(target: number): void;
	/** The step revealed last (-1: none). */
	readonly current: number;
	/** How many steps the slide has. */
	readonly count: number;
}

function readIndex(el: Element, attr: string): number | null {
	const raw = el.getAttribute(attr);
	if (raw === null || raw === "") return null;
	const i = parseInt(raw, 10);
	return Number.isNaN(i) ? null : i;
}

// Code fences with `{2|3-5|all}` carry data-code-steps="2|3,4,5|*" (see
// utils/code-highlight.ts). Segment 0 is the initial state rendered at build
// time; each later segment becomes one event.
function applyCodeSegment(pre: Element, segment: string | undefined): void {
	const lines = segment === "*" ? null : new Set((segment ?? "").split(",").filter(Boolean));
	for (const line of pre.querySelectorAll(".line[data-line]")) {
		line.classList.toggle("highlighted", !lines || lines.has(line.getAttribute("data-line") ?? ""));
	}
}

function setFragmentVisible(el: Element, visible: boolean): void {
	if (visible) el.setAttribute("data-fragment-visible", "true");
	else el.removeAttribute("data-fragment-visible");
	el.setAttribute("aria-hidden", visible ? "false" : "true");
}

export function createSteps(mount: Mount): Steps {
	let events: StepEvent[] = [];
	let steps: Step[] = [];

	// Collect steps from the DOM, every fragment / code block in its initial
	// state. Re-run by the dev editor after it patches slide content in place.
	function buildSteps() {
		// <Fragments>: every first-level list item (or direct child) becomes an
		// unindexed fragment with the group's effect.
		for (const group of document.querySelectorAll("[data-fragment-group]")) {
			const listItems = group.querySelectorAll(":scope > ul > li, :scope > ol > li");
			const items = listItems.length > 0 ? listItems : group.children;
			for (const item of items) {
				item.setAttribute("data-fragment", "");
				item.setAttribute(
					"data-fragment-effect",
					group.getAttribute("data-fragment-group") || "fade",
				);
			}
			group.setAttribute("data-fragment-group-ready", "");
		}

		events = [];
		let eventSeq = 0;
		function addEvent(index: number | null, run: () => void, undo: () => void): void {
			events.push({
				order: index ?? 0,
				group: index === null ? null : index,
				seq: eventSeq++,
				run,
				undo,
			});
		}

		for (const el of document.querySelectorAll("[data-fragment], pre[data-code-steps]")) {
			const index = readIndex(el, "data-fragment-index");
			if (el.hasAttribute("data-fragment")) {
				// Fragment.astro omits static aria-hidden so screen readers can access
				// content when JS is unavailable (CSS hides it visually). With JS running,
				// we manage aria-hidden here to match the visual reveal state.
				if (el.hasAttribute("data-fragment-hide")) {
					setFragmentVisible(el, true);
					addEvent(
						index,
						() => setFragmentVisible(el, false),
						() => setFragmentVisible(el, true),
					);
				} else {
					setFragmentVisible(el, false);
					addEvent(
						index,
						() => setFragmentVisible(el, true),
						() => setFragmentVisible(el, false),
					);
					const until = readIndex(el, "data-fragment-until");
					if (until !== null) {
						addEvent(
							until,
							() => setFragmentVisible(el, false),
							() => setFragmentVisible(el, true),
						);
					}
				}
			} else {
				const segments = (el.getAttribute("data-code-steps") ?? "").split("|");
				applyCodeSegment(el, segments[0]);
				for (let i = 1; i < segments.length; i++) {
					addEvent(
						index,
						() => applyCodeSegment(el, segments[i]),
						() => applyCodeSegment(el, segments[i - 1]),
					);
				}
			}
		}
		events.sort((a, b) => a.order - b.order || a.seq - b.seq);

		steps = [];
		for (const event of events) {
			const last = steps[steps.length - 1];
			if (last && event.group !== null && last.group === event.group) last.events.push(event);
			else steps.push({ group: event.group, events: [event] });
		}
	}
	buildSteps();

	let currentStep = -1;

	// Presenter panel: "+N steps" next to the next-slide preview, so the speaker
	// knows whether → reveals more on this slide or moves on.
	const stepsLeftEl = document.getElementById("presenter-steps-left");
	function updateStepsLeft() {
		// Exposed so the dev editor can keep the step across live refreshes.
		window.__astlide_step = { slide: mount.config.currentSlide, step: currentStep };
		if (!stepsLeftEl) return;
		const left = steps.length - 1 - currentStep;
		stepsLeftEl.hidden = left <= 0;
		stepsLeftEl.textContent = `+${left}${left === 1 ? " step" : " steps"}`;
	}
	updateStepsLeft();

	function showNextStep() {
		if (currentStep < steps.length - 1) {
			currentStep++;
			for (const event of steps[currentStep].events) event.run();
			updateStepsLeft();
			return true;
		}
		return false;
	}

	function showPrevStep() {
		if (currentStep >= 0) {
			const { events: stepEvents } = steps[currentStep];
			for (let i = stepEvents.length - 1; i >= 0; i--) stepEvents[i].undo();
			currentStep--;
			updateStepsLeft();
			return true;
		}
		return false;
	}

	// Jump to a given step (used to mirror the other window's position).
	function goToStep(target: number): void {
		const clamped = Math.max(-1, Math.min(target, steps.length - 1));
		while (currentStep < clamped) showNextStep();
		while (currentStep > clamped) showPrevStep();
	}

	// Dev editor: after slide content is patched in place, rebuild the steps
	// from the new DOM and return to the same step.
	const resyncSteps = () => {
		const target = currentStep;
		buildSteps();
		currentStep = -1;
		goToStep(target);
		updateStepsLeft();
	};
	window.__astlide_resync_steps = resyncSteps;
	mount.onDispose(() => {
		if (window.__astlide_resync_steps === resyncSteps) window.__astlide_resync_steps = undefined;
	});

	return {
		next: showNextStep,
		prev: showPrevStep,
		goTo: goToStep,
		get current() {
			return currentStep;
		},
		get count() {
			return steps.length;
		},
	};
}
