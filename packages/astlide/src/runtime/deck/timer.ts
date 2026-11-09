/**
 * The presenter window's timer: start / pause and reset by hand.
 *
 * @module
 */

import type { Mount } from "./mount";

export function setUpTimer(mount: Mount): void {
	const timerEl = document.getElementById("presenter-timer");
	const timerBtn = document.getElementById("timer-btn");
	const timerResetBtn = document.getElementById("timer-reset");
	let timerInterval: ReturnType<typeof setInterval> | null = null;
	let timerRunning = false;
	let timerElapsed = 0;
	let timerStartTime = 0;

	function formatTimer(secs: number): string {
		const m = String(Math.floor(secs / 60)).padStart(2, "0");
		const s = String(secs % 60).padStart(2, "0");
		return `${m}:${s}`;
	}

	if (timerBtn) {
		mount.listen(timerBtn, "click", () => {
			if (timerRunning) {
				timerElapsed += Math.floor((Date.now() - timerStartTime) / 1000);
				if (timerInterval) clearInterval(timerInterval);
				timerInterval = null;
				timerRunning = false;
				timerBtn.textContent = "▶";
				timerBtn.title = "Resume timer";
				timerBtn.setAttribute("aria-label", "Resume timer");
			} else {
				timerStartTime = Date.now();
				timerRunning = true;
				timerInterval = setInterval(() => {
					const elapsed = timerElapsed + Math.floor((Date.now() - timerStartTime) / 1000);
					if (timerEl) timerEl.textContent = formatTimer(elapsed);
				}, 1000);
				timerBtn.textContent = "⏸";
				timerBtn.title = "Pause timer";
				timerBtn.setAttribute("aria-label", "Pause timer");
			}
		});
	}

	if (timerResetBtn) {
		mount.listen(timerResetBtn, "click", () => {
			if (timerInterval) clearInterval(timerInterval);
			timerInterval = null;
			timerRunning = false;
			timerElapsed = 0;
			timerStartTime = 0;
			if (timerEl) timerEl.textContent = "00:00";
			if (timerBtn) {
				timerBtn.textContent = "▶";
				timerBtn.title = "Start timer";
				timerBtn.setAttribute("aria-label", "Start timer");
			}
		});
	}

	mount.onDispose(() => {
		if (timerInterval) clearInterval(timerInterval);
	});
}
