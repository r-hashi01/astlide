declare global {
	interface Window {
		/** `import("mermaid")`, set by the module's `mermaid` plugin. */
		__astlide_load_mermaid?: () => Promise<unknown>;
	}
}

export {};
