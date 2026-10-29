"use client";

/**
 * ```mermaid diagrams in a Next.js app: install `mermaid`, then render
 * `<AstlideMermaid />` once (e.g. in the root layout). Without it, diagrams
 * show as their source — and apps without `mermaid` don't bundle it.
 *
 * @module
 */

declare global {
	interface Window {
		__astlide_load_mermaid?: () => Promise<unknown>;
	}
}

if (typeof window !== "undefined") window.__astlide_load_mermaid = () => import("mermaid");

export function AstlideMermaid() {
	return null;
}
