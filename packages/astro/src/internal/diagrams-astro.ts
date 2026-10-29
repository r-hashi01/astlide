/**
 * Diagrams on Astro pages: {@link renderDiagramsWith} with the `mermaid`
 * the integration found (`virtual:astlide/mermaid`).
 *
 * @module
 */

import { loadMermaid } from "virtual:astlide/mermaid";
import { renderDiagramsWith } from "@astlide/core/internal/diagrams";

export function renderDiagrams(): Promise<void> {
	return renderDiagramsWith(loadMermaid as never);
}
