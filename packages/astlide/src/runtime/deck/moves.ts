/**
 * Moving through the deck: → / ← reveal or hide steps before changing slide,
 * and every move is told to the other window.
 *
 * @module
 */

import type { Mount } from "./mount";
import type { Navigation } from "./navigation";
import type { Steps } from "./steps";
import type { Sync } from "./sync";

export interface Moves {
	/** The next step, else the next slide. */
	next(): void;
	/** The previous step, else the previous slide. */
	prev(): void;
	/** Slide `n`, in this window's mode. */
	to(n: number): void;
}

export function createMoves(
	mount: Mount,
	{ navigation, steps, sync }: { navigation: Navigation; steps: Steps; sync: Sync },
): Moves {
	// nextSlide / prevSlide skip hidden slides in production.
	const { nextSlide, prevSlide } = mount.config;
	const to = (n: number): void => {
		sync.slide(n);
		navigation.navTo(mount.modeUrl(n));
	};
	return {
		next() {
			if (navigation.leaving) return;
			if (steps.next()) {
				sync.step(steps.current);
				return;
			}
			if (nextSlide) to(nextSlide);
		},
		prev() {
			if (navigation.leaving) return;
			if (steps.prev()) {
				sync.step(steps.current);
				return;
			}
			if (prevSlide) to(prevSlide);
		},
		to,
	};
}
