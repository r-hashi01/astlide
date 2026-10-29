"use client";

/**
 * The client side of Astlide's Next.js pages: `<DeckPage>` driven by Next's
 * router, and the print view's setup. Rendered by `createDeckRoutes`.
 *
 * @module
 */

import { applyPageFlags } from "@astlide/core/runtime";
import { DeckPage, type DeckPageProps } from "@astlide/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

/** `mermaid`, when the app renders `<AstlideMermaid />` (see `@astlide/next/mermaid`). */
const loadMermaid = () =>
	typeof window !== "undefined" && window.__astlide_load_mermaid
		? (window.__astlide_load_mermaid() as never)
		: (Promise.reject(new Error("no mermaid")) as never);
const hasMermaid = () => typeof window !== "undefined" && !!window.__astlide_load_mermaid;

/** A slide page: `<DeckPage>` with Next's router, the presenter window from the URL. */
export function NextDeckPage({
	theme,
	...props
}: Omit<DeckPageProps, "navigate" | "presenter"> & { theme: string }) {
	const router = useRouter();
	const navigate = useCallback(
		(url: string, { replace }: { replace: boolean }) =>
			replace ? router.replace(url) : router.push(url),
		[router],
	);
	// The presenter window is `?presenter` (or the popup): known on the client only.
	const [presenter, setPresenter] = useState(false);
	useEffect(() => {
		setPresenter(
			new URLSearchParams(location.search).has("presenter") || window.name === "astlide-presenter",
		);
	}, []);
	// The deck's theme on <html> (the page's script set it on the first load; this
	// keeps it right after client-side navigation to another deck).
	useEffect(() => {
		document.documentElement.dataset.theme = theme;
	}, [theme]);
	return (
		<DeckPage
			{...props}
			navigate={navigate}
			presenter={presenter}
			loadMermaid={hasMermaid() ? loadMermaid : null}
		/>
	);
}

/** The print view's setup: page flags and diagrams (exporters wait for `data-diagrams-ready`). */
export function PrintViewSetup() {
	useEffect(() => {
		applyPageFlags();
		document.documentElement.setAttribute("data-print", "");
		document.documentElement.setAttribute("data-astlide-all", "");
		void import("@astlide/core/internal/diagrams").then((m) =>
			m.renderDiagramsWith(hasMermaid() ? loadMermaid : null),
		);
	}, []);
	return null;
}
