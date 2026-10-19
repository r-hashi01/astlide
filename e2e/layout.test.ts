/**
 * Layout in a real browser: properties every deck must keep, checked on the
 * print view (all slides of a deck on one page) — not pixel snapshots, so
 * changing a deck's content or a font doesn't need new baselines, and a
 * failure names the slide and element.
 */

import type { Page } from "playwright";
import { describe, expect, it } from "vitest";
import { open, useBrowser } from "./helpers/browser";

const DECKS = ["example-deck", "tour", "from-powerpoint", "from-template"];
const THEMES = ["default", "dark", "minimal", "corporate", "gradient", "rose", "forest"];

const browser = useBrowser();

async function printView(deck: string): Promise<Page> {
	const page = await open(browser(), `/${deck}/all/`);
	// Diagrams render client-side; the print view marks when they're done.
	await page.waitForSelector("html[data-diagrams-ready]", { timeout: 15_000 }).catch(() => {});
	return page;
}

describe.each(DECKS)("%s", (deck) => {
	it("every slide is 1920×1080 and nothing spills out of it", async () => {
		const page = await printView(deck);
		const problems = await page.evaluate(() => {
			const out: string[] = [];
			const slides = Array.from(document.querySelectorAll<HTMLElement>("body > .slide"));
			slides.forEach((slide, i) => {
				const s = slide.getBoundingClientRect();
				if (Math.round(s.width) !== 1920 || Math.round(s.height) !== 1080)
					out.push(`slide ${i + 1}: ${s.width}×${s.height}`);
				for (const el of Array.from(slide.querySelectorAll<HTMLElement>("*"))) {
					if (el.closest("[aria-hidden='true'], [data-slide-notes], template")) continue;
					const style = getComputedStyle(el);
					if (
						style.display === "none" ||
						style.visibility === "hidden" ||
						style.position === "fixed"
					)
						continue;
					// Content an ancestor clips (overflow) can't spill out.
					let clipped = false;
					for (let a = el.parentElement; a && a !== slide; a = a.parentElement) {
						const o = getComputedStyle(a);
						if (o.overflowX !== "visible" || o.overflowY !== "visible") {
							clipped = true;
							break;
						}
					}
					if (clipped) continue;
					const b = el.getBoundingClientRect();
					if (b.width === 0 || b.height === 0) continue;
					if (
						b.left < s.left - 1 ||
						b.top < s.top - 1 ||
						b.right > s.right + 1 ||
						b.bottom > s.bottom + 1
					) {
						const name = `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(/\s+/).join(".")}` : ""}`;
						out.push(
							`slide ${i + 1}: ${name} spills out (${Math.round(b.right - s.left)}×${Math.round(b.bottom - s.top)})`,
						);
					}
				}
			});
			return [...new Set(out)];
		});
		expect(problems).toEqual([]);
	});

	it("layouts place their parts", async () => {
		const page = await printView(deck);
		const problems = await page.evaluate(() => {
			const out: string[] = [];
			const near = (a: number, b: number, tol = 2) => Math.abs(a - b) <= tol;
			const slides = Array.from(document.querySelectorAll<HTMLElement>("body > .slide"));
			slides.forEach((slide, i) => {
				const s = slide.getBoundingClientRect();
				const at = `slide ${i + 1}`;
				// two-column: <Left> and <Right> side by side, sharing the width.
				const left = slide.querySelector(":scope .column-left")?.getBoundingClientRect();
				const right = slide.querySelector(":scope .column-right")?.getBoundingClientRect();
				if (left && right) {
					if (left.right > right.left + 1) out.push(`${at}: <Left> overlaps <Right>`);
					if (!near(left.top, right.top))
						out.push(`${at}: <Left> and <Right> start at different heights`);
					if (Math.abs(left.width - right.width) > Math.max(left.width, right.width) * 0.1)
						out.push(
							`${at}: <Left> ${Math.round(left.width)}px vs <Right> ${Math.round(right.width)}px`,
						);
				}
				// <Columns>: one row of equal, non-overlapping columns.
				for (const columns of Array.from(slide.querySelectorAll<HTMLElement>(".columns"))) {
					const cols = Array.from(columns.children).map((c) => c.getBoundingClientRect());
					cols.forEach((c, j) => {
						const first = cols[0];
						if (!first) return;
						if (!near(c.top, first.top))
							out.push(`${at}: <Columns> column ${j + 1} not in the row`);
						if (!near(c.width, first.width))
							out.push(
								`${at}: <Columns> column ${j + 1} width ${Math.round(c.width)} ≠ ${Math.round(first.width)}`,
							);
						const prev = cols[j - 1];
						if (prev && c.left < prev.right - 1)
							out.push(`${at}: <Columns> columns ${j} and ${j + 1} overlap`);
					});
				}
				// image-left / image-right: the image beside the text, on its side.
				const image = slide.querySelector(".image-side")?.getBoundingClientRect();
				const text = slide.querySelector(".text-panel")?.getBoundingClientRect();
				if (
					image &&
					text &&
					slide.classList.contains("slide-image-left") &&
					image.right > text.left + 1
				)
					out.push(`${at}: image-left image isn't left of the text`);
				if (
					image &&
					text &&
					slide.classList.contains("slide-image-right") &&
					image.left < text.right - 1
				)
					out.push(`${at}: image-right image isn't right of the text`);
				if (image && (image.width < s.width * 0.25 || image.height < s.height * 0.5))
					out.push(`${at}: image ${Math.round(image.width)}×${Math.round(image.height)} too small`);
				// cover / section: the title is centered (a PowerPoint template's goes
				// where its placeholder is).
				if (slide.matches(".slide-cover, .slide-section") && !slide.matches(".astlide-tpl")) {
					const h = slide.querySelector("h1, h2")?.getBoundingClientRect();
					if (h && !near(h.left + h.width / 2, s.left + s.width / 2, 4))
						out.push(`${at}: title not centered`);
				}
				// Template layouts: the title in its placeholder, clear of the body text.
				const title = slide.querySelector(
					":scope.astlide-tpl > .slide-content > :is(h1, h2):first-child",
				);
				const body = title?.nextElementSibling?.getBoundingClientRect();
				const t = title?.getBoundingClientRect();
				if (t && (t.left < s.left || t.right > s.right || t.top < s.top))
					out.push(`${at}: template title outside the slide`);
				if (t && body && body.top < t.bottom - 1 && body.left < t.right && body.right > t.left)
					out.push(`${at}: template title overlaps the body`);
			});
			return out;
		});
		expect(problems).toEqual([]);
	});
});

describe("themes", () => {
	it.each(THEMES)("%s styles the slides", async (theme) => {
		const page = await printView("example-deck");
		const result = await page.evaluate((name) => {
			document.documentElement.setAttribute("data-theme", name);
			const root = getComputedStyle(document.documentElement);
			const probe = document.createElement("div");
			probe.style.background = root.getPropertyValue("--color-background").trim();
			probe.style.color = root.getPropertyValue("--color-foreground").trim();
			document.body.append(probe);
			const want = getComputedStyle(probe);
			const slide = getComputedStyle(document.querySelector("body > .slide") as HTMLElement);
			return {
				background: root.getPropertyValue("--color-background").trim(),
				slide: { bg: slide.backgroundColor, color: slide.color },
				want: { bg: want.backgroundColor, color: want.color },
			};
		}, theme);
		expect(result.background, "theme defines --color-background").not.toBe("");
		expect(result.slide).toEqual(result.want);
	});
});
