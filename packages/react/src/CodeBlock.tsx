"use client";

/**
 * A code block with a title and a copy button — the markup of the Astro
 * `<CodeBlock>`. A client component (the button copies).
 *
 * @module
 */

import { type ReactNode, useId, useState } from "react";

export interface CodeBlockProps {
	title?: string;
	children?: ReactNode;
	className?: string;
	class?: string;
}

export function CodeBlock({ title, children, ...props }: CodeBlockProps) {
	const id = `cb-${useId().replace(/[^\w-]/g, "")}`;
	const [label, setLabel] = useState<"Copy" | "✓ Copied!" | "Failed">("Copy");
	const copy = async () => {
		const pre = document.getElementById(id)?.querySelector("pre");
		if (!pre) return;
		try {
			await navigator.clipboard.writeText(pre.textContent ?? "");
			setLabel("✓ Copied!");
		} catch {
			// Clipboard API unavailable.
			setLabel("Failed");
		}
		setTimeout(() => setLabel("Copy"), 2000);
	};
	const className = ["code-block", props.className ?? props.class].filter(Boolean).join(" ");
	return (
		<div className={className} id={id} data-astlide-c="">
			<div className="code-block-header">
				{title && <span className="code-block-title">{title}</span>}
				<button
					className="code-block-copy"
					data-cb={id}
					data-copied={label === "✓ Copied!" ? "" : undefined}
					type="button"
					aria-label="Copy code to clipboard"
					onClick={copy}
				>
					{label}
				</button>
			</div>
			<div className="code-block-content">{children}</div>
		</div>
	);
}
