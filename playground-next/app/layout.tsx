import "@astlide/next/styles";
import { AstlideMermaid } from "@astlide/next/mermaid";
import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<head>
				<link
					rel="stylesheet"
					href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;700&display=swap"
				/>
			</head>
			<body>
				<AstlideMermaid />
				{children}
			</body>
		</html>
	);
}
