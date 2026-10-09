// Types for the virtual modules served by `internal/virtual-plugins.ts`.

declare module "virtual:astlide/mermaid" {
	/**
	 * The slice of the `mermaid` API Astlide uses. Declared structurally so type
	 * checking works whether or not the optional `mermaid` package is installed.
	 */
	interface MermaidModule {
		default: {
			initialize(config: Record<string, unknown>): void;
			render(
				id: string,
				text: string,
				container?: Element,
			): Promise<{ svg: string; bindFunctions?: (element: Element) => void }>;
		};
	}

	/** Lazy loader for the optional `mermaid` package, or `null` when it isn't installed. */
	export const loadMermaid: (() => Promise<MermaidModule>) | null;
}
