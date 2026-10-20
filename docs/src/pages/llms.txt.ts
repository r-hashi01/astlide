import type { APIRoute } from "astro";
import { base, site } from "../../site.mjs";
import { pageGroups, pageUrl, SUMMARY } from "../llms";

/** `/llms.txt`: the docs pages, each with its one-line description (https://llmstxt.org). */
export const GET: APIRoute = async () => {
	const lines = [
		"# Astlide",
		"",
		`> ${SUMMARY}`,
		"",
		"Slides use `slideLayout` (not `layout`) in their frontmatter. Agents can also use the Astlide MCP server and agent skill — see the Agents guide below.",
		"",
	];
	for (const group of await pageGroups()) {
		lines.push(`## ${group.label}`, "");
		for (const page of group.pages) {
			const d = page.data.description;
			lines.push(`- [${page.data.title}](${pageUrl(page.id)})${d ? `: ${d}` : ""}`);
		}
		lines.push("");
	}
	lines.push(
		"## Optional",
		"",
		`- [All docs in one file](${site}${base}/llms-full.txt): every page above as Markdown`,
		`- [API reference](${site}${base}/api/): TypeDoc for @astlide/core`,
		`- [Live demo](${site}${base}/demo/tour/1/): the feature tour deck`,
		"- [Source](https://github.com/r-hashi01/astlide)",
		"",
	);
	return new Response(lines.join("\n"), {
		headers: { "Content-Type": "text/plain; charset=utf-8" },
	});
};
