/**
 * The presenter window's timer: start / pause and reset by hand. It keeps
 * counting across slides (its state is on `window`).
 *
 * @module
 */

import "../globals";
import type { Mount } from "./mount";

export function setUpTimer(mount: Mount): void {
	const timerEl = document.getElementById("presenter-timer");
	const timerBtn = document.getElementById("timer-btn");
	const timerResetBtn = document.getElementById("timer-reset");
	if (!timerEl && !timerBtn) return;
	window.__astlide_timer ??= { elapsed: 0, startedAt: null };
	const state = window.__astlide_timer;
	let timerInterval: ReturnType<typeof setInterval> | null = null;

	function formatTimer(secs: number): string {
		const m = String(Math.floor(secs / 60)).padStart(2, "0");
		const s = String(secs % 60).padStart(2, "0");
		return `${m}:${s}`;
	}

	function seconds(): number {
		const running = state.startedAt === null ? 0 : Date.now() - state.startedAt;
		return state.elapsed + Math.floor(running / 1000);
	}

	/** Show the state: the time, the button, and the interval while it runs. */
	function render(): void {
		if (timerEl) timerEl.textContent = formatTimer(seconds());
		if (timerBtn) {
			const label =
				state.startedAt !== null
					? "Pause timer"
					: state.elapsed > 0
						? "Resume timer"
						: "Start timer";
			timerBtn.textContent = state.startedAt !== null ? "⏸" : "▶";
			timerBtn.title = label;
			timerBtn.setAttribute("aria-label", label);
		}
		if (state.startedAt !== null && !timerInterval) {
			timerInterval = setInterval(() => {
				if (timerEl) timerEl.textContent = formatTimer(seconds());
			}, 1000);
		} else if (state.startedAt === null && timerInterval) {
			clearInterval(timerInterval);
			timerInterval = null;
		}
	}

	if (timerBtn) {
		mount.listen(timerBtn, "click", () => {
			if (state.startedAt !== null) {
				state.elapsed = seconds();
				state.startedAt = null;
			} else {
				state.startedAt = Date.now();
			}
			render();
		});
	}

	if (timerResetBtn) {
		mount.listen(timerResetBtn, "click", () => {
			state.elapsed = 0;
			state.startedAt = null;
			render();
		});
	}

	render();
	mount.onDispose(() => {
		if (timerInterval) clearInterval(timerInterval);
	});
}
