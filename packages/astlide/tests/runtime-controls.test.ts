import { describe, expect, it, vi } from "vitest";
import { TOOLBAR_ACTIONS } from "../src/runtime/chrome";
import { type ActionName, createActions } from "../src/runtime/deck/controls";
import type { Mount } from "../src/runtime/deck/mount";

/** The actions over stubs: what each one calls. */
function actions() {
	const calls: string[] = [];
	const call = (name: string) => () => {
		calls.push(name);
	};
	const mount = {
		config: { currentSlide: 3, firstSlide: 1, lastSlide: 9 },
		slideUrl: (n: number) => `/talk/${n}`,
	} as unknown as Mount;
	const table = createActions(mount, {
		moves: { next: call("next"), prev: call("prev"), to: (n: number) => calls.push(`to ${n}`) },
		navigation: { navTo: (url: string) => calls.push(`navTo ${url}`), leaving: false },
		dialogs: {
			openOverview: call("overview"),
			closeOverview: call("close overview"),
			overviewOpen: false,
			openGoto: call("goto"),
		},
		drawing: {
			setTool: (tool: string) => calls.push(`tool ${tool}`),
			tool: null,
			clear: call("clear"),
			clearDeck: call("clear deck"),
			receive: vi.fn(),
		},
		notes: {
			toggle: call("notes"),
			open: false,
			adjustFontSize: (d: number) => calls.push(`font ${d}`),
		},
		downloadPdf: call("download"),
	});
	return { table, calls };
}

describe("deck actions", () => {
	it("has an action for every toolbar button", () => {
		const { table } = actions();
		for (const name of Object.keys(TOOLBAR_ACTIONS))
			expect(typeof table[name as ActionName], name).toBe("function");
	});

	it("runs what the keys and buttons name", () => {
		const { table, calls } = actions();
		for (const name of [
			"next",
			"prev",
			"first",
			"last",
			"notes",
			"notes-larger",
			"notes-smaller",
			"overview",
			"goto",
			"draw",
			"laser",
			"clear",
			"download",
		] as const)
			table[name]();
		expect(calls).toEqual([
			"next",
			"prev",
			"to 1",
			"to 9",
			"notes",
			"font 0.1",
			"font -0.1",
			"overview",
			"goto",
			"tool draw",
			"tool laser",
			// No pen in hand: nothing to clear.
			"download",
		]);
	});
});
