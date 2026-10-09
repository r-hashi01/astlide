/**
 * Measure rendered slides in the browser — the input of the render-based PPTX
 * export. Runs inside the page (Playwright `page.evaluate`), so
 * {@link measureSlides} must stay self-contained: no imports, no closures.
 *
 * Text is measured where the browser actually laid it out: every text node is
 * split into line fragments (one per visual line) with its position and font,
 * so the PPTX can place each fragment exactly. Everything else (backgrounds,
 * boxes, code blocks, SVG diagrams, images) is captured as a raster by the
 * exporter, with the measured text made transparent.
 *
 * @module
 */

/** One line of one text node, in slide coordinates (CSS px). */
export interface MeasuredRun {
	text: string;
	x: number;
	y: number;
	w: number;
	h: number;
	fontFamily: string;
	/** CSS px. */
	fontSize: number;
	fontWeight: number;
	italic: boolean;
	/** `#rrggbb`. */
	color: string;
	/** 0–1. */
	opacity: number;
	/** CSS px. */
	letterSpacing: number;
	underline: boolean;
	strike: boolean;
}

export interface MeasuredSlide {
	/** CSS px. */
	width: number;
	height: number;
	/** `#rrggbb` of the slide background color (images / gradients are in the raster). */
	background: string;
	runs: MeasuredRun[];
}

/**
 * Measure every `body > .slide` of the print view. Marks measured text with
 * `data-astlide-measured` so the exporter can hide exactly that text before
 * taking the background raster.
 */
export function measureSlides(): MeasuredSlide[] {
	function toHex(css: string): { hex: string; alpha: number } {
		const m = css.match(/rgba?\(([^)]+)\)/);
		if (!m) return { hex: "#000000", alpha: 1 };
		const parts = (m[1] ?? "").split(/[\s,/]+/).filter(Boolean);
		const [r, g, b] = parts.slice(0, 3).map((v) => Math.round(Number.parseFloat(v)));
		const a = parts[3] === undefined ? 1 : Number.parseFloat(parts[3]);
		const h = (n: number | undefined) =>
			Math.max(0, Math.min(255, n ?? 0))
				.toString(16)
				.padStart(2, "0");
		return { hex: `#${h(r)}${h(g)}${h(b)}`, alpha: Number.isNaN(a) ? 1 : a };
	}

	function firstFamily(list: string): string {
		return (list.split(",")[0] ?? "").trim().replace(/^["']|["']$/g, "");
	}

	/** Combined opacity of an element and its ancestors up to (and including) `stop`. */
	function opacityOf(el: Element, stop: Element): number {
		let o = 1;
		for (let cur: Element | null = el; cur; cur = cur.parentElement) {
			o *= Number.parseFloat(getComputedStyle(cur).opacity) || 0;
			if (cur === stop) break;
		}
		return o;
	}

	const slides = Array.from(document.querySelectorAll<HTMLElement>("body > .slide"));
	return slides.map((slide) => {
		const box = slide.getBoundingClientRect();
		const runs: MeasuredRun[] = [];
		const walker = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT);
		const range = document.createRange();

		for (
			let node = walker.nextNode() as Text | null;
			node;
			node = walker.nextNode() as Text | null
		) {
			const el = node.parentElement;
			if (!el || el.closest("svg, script, style, [data-slide-notes], [aria-hidden='true']"))
				continue;
			if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
			const opacity = opacityOf(el, slide);
			if (opacity < 0.01) continue;
			const cs = getComputedStyle(el);
			const color = toHex(cs.color);
			if (color.alpha < 0.01) continue;
			const decoration = cs.textDecorationLine;
			const style = {
				fontFamily: firstFamily(cs.fontFamily),
				fontSize: Number.parseFloat(cs.fontSize),
				fontWeight: Number.parseInt(cs.fontWeight, 10) || 400,
				italic: cs.fontStyle === "italic" || cs.fontStyle.startsWith("oblique"),
				color: color.hex,
				opacity: opacity * color.alpha,
				letterSpacing: cs.letterSpacing === "normal" ? 0 : Number.parseFloat(cs.letterSpacing) || 0,
				underline: decoration.includes("underline"),
				strike: decoration.includes("line-through"),
			};
			const preserve = /^(pre|pre-wrap|break-spaces)$/.test(cs.whiteSpace);
			const text = node.data;

			// A line fragment; `ink*` bound its non-space characters, which is
			// where the text box goes (spaces at either end are dropped).
			type Fragment = MeasuredRun & { top: number; inkLeft: number | null; inkRight: number };
			let cur: Fragment | null = null;
			const before = runs.length;
			const flush = () => {
				const f = cur as Fragment | null;
				if (f && f.inkLeft !== null) {
					const text = preserve ? f.text.replace(/\s+$/, "") : f.text.trim();
					const { top: _t, inkLeft, inkRight, ...run } = f;
					// Preserved leading spaces (code indentation) stay in the text.
					const left = preserve ? run.x : inkLeft - box.left;
					runs.push({ ...run, text, x: left, w: inkRight - box.left - left });
				}
				cur = null;
			};

			for (let i = 0; i < text.length; ) {
				const cp = text.codePointAt(i) ?? 0;
				const len = cp > 0xffff ? 2 : 1;
				range.setStart(node, i);
				range.setEnd(node, i + len);
				const r = range.getBoundingClientRect();
				let ch = text.slice(i, i + len);
				i += len;
				// Collapsed whitespace has no box; source newlines render as spaces.
				if (r.width === 0 && r.height === 0) continue;
				if (!preserve && /\s/.test(ch)) ch = " ";
				const ink = ch.trim() !== "";
				const c = cur as Fragment | null;
				if (c && Math.abs(r.top - c.top) < 1 && r.left >= c.inkRight - 1 - r.width) {
					c.text += ch;
					c.h = Math.max(c.h, r.height);
					if (ink) {
						if (c.inkLeft === null) c.inkLeft = r.left;
						c.inkRight = r.right;
					}
				} else {
					flush();
					cur = {
						...style,
						text: ch,
						x: r.left - box.left,
						y: r.top - box.top,
						w: r.width,
						h: r.height,
						top: r.top,
						inkLeft: ink ? r.left : null,
						inkRight: r.right,
					};
				}
			}
			flush();
			// Mark only elements whose text was recorded: the raster hides exactly that.
			if (runs.length > before) {
				el.setAttribute("data-astlide-measured", "");
				// List markers inherit `color`: keep their own (themes may set one).
				el.style.setProperty("--astlide-measured-color", getComputedStyle(el, "::marker").color);
			}
		}

		// Unmeasured elements inside measured ones (SVG / diagram labels, pseudo-
		// content hosts) would inherit the transparent color: pin their own.
		for (const inner of Array.from(
			slide.querySelectorAll<HTMLElement>("[data-astlide-measured] *"),
		)) {
			if (inner.hasAttribute("data-astlide-measured")) continue;
			inner.style.setProperty("color", getComputedStyle(inner).color, "important");
		}

		return {
			width: box.width,
			height: box.height,
			background: toHex(getComputedStyle(slide).backgroundColor).hex,
			runs,
		};
	});
}
