/**
 * Client-side diagram rendering for slides and the print view.
 *
 * Renders every `<pre class="astlide-mermaid">` (emitted at build time by the
 * `astlideMermaid` Shiki transformer) with the optional `mermaid` package, then
 * marks `<html data-diagrams-ready>` so the PDF exporters know rendering is done.
 * Pages without diagrams are marked ready immediately and never load mermaid.
 */

import { loadMermaid } from "virtual:astlide/mermaid";
import { MERMAID_CLASS, mermaidThemeFor } from "@astlide/core/utils/mermaid";

let warnedMissing = false;

/** Mermaid lays text out at 16px; scale diagrams so labels match the slide's body text. */
const MERMAID_FONT_SIZE = 16;

/**
 * Enlarge a rendered diagram uniformly so its labels read at the slide's body
 * size (Mermaid's 16px is tiny on a 1920×1080 slide). Scaling the SVG — rather
 * than raising Mermaid's `fontSize` — keeps its own text measurements valid, so
 * labels don't overflow their boxes. Still capped at the container width.
 */
function scaleToSlideText(node: HTMLElement): void {
	const svg = node.querySelector("svg");
	const naturalWidth = svg ? Number.parseFloat(svg.style.maxWidth) : Number.NaN;
	if (!svg || Number.isNaN(naturalWidth)) return;
	const slide = node.closest(".slide") ?? document.body;
	const factor = Number.parseFloat(getComputedStyle(slide).fontSize) / MERMAID_FONT_SIZE;
	if (factor > 0) svg.style.maxWidth = `${naturalWidth * factor}px`;
}

let renderSeq = 0;

/**
 * Render one diagram off-screen, then move the SVG into place.
 *
 * Slides sit inside `#slide-scaler`, which is CSS-transformed to fit the
 * viewport. Mermaid sizes boxes from `getBoundingClientRect()`, which includes
 * that transform, so rendering in place produces boxes too small for their
 * labels once shown at slide scale. An untransformed off-screen container
 * gives Mermaid true measurements.
 *
 * On a syntax error the source stays visible (styled as code) and the error is
 * logged, instead of breaking the slide.
 */
async function renderOne(
	mermaid: { render: (id: string, text: string, container?: Element) => Promise<RenderResult> },
	node: HTMLElement,
): Promise<void> {
	const sandbox = document.createElement("div");
	sandbox.setAttribute("aria-hidden", "true");
	sandbox.style.cssText = "position:absolute; left:-100000px; top:0; width:1920px;";
	document.body.append(sandbox);
	try {
		const { svg, bindFunctions } = await mermaid.render(
			`astlide-mermaid-${++renderSeq}`,
			node.textContent ?? "",
			sandbox,
		);
		node.innerHTML = svg;
		bindFunctions?.(node);
		node.setAttribute("data-processed", "true");
		scaleToSlideText(node);
	} catch (error) {
		console.error("[astlide] Invalid mermaid diagram", error);
	} finally {
		sandbox.remove();
	}
}

interface RenderResult {
	svg: string;
	bindFunctions?: (element: Element) => void;
}

export async function renderDiagrams(): Promise<void> {
	const root = document.documentElement;
	try {
		const nodes = Array.from(
			document.querySelectorAll<HTMLElement>(`pre.${MERMAID_CLASS}:not([data-processed])`),
		);
		if (nodes.length === 0) return;
		if (!loadMermaid) {
			if (!warnedMissing) {
				console.warn(
					"[astlide] ```mermaid blocks found but the `mermaid` package is not installed — showing their source. Install it to render diagrams: bun add mermaid",
				);
				warnedMissing = true;
			}
			return;
		}
		const { default: mermaid } = await loadMermaid();
		mermaid.initialize({
			startOnLoad: false,
			securityLevel: "strict",
			theme: mermaidThemeFor(root.dataset.theme),
		});
		for (const node of nodes) await renderOne(mermaid, node);
	} catch (error) {
		console.error("[astlide] Failed to render diagrams", error);
	} finally {
		root.setAttribute("data-diagrams-ready", "");
	}
}
