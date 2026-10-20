import type { APIRoute } from "astro";
import { pageGroups, pageUrl, plainMarkdown, SUMMARY } from "../llms";

/** `/llms-full.txt`: every docs page as Markdown, in sidebar order. */
export const GET: APIRoute = async () => {
	const parts = [`# Astlide documentation\n\n> ${SUMMARY}`];
	for (const group of await pageGroups()) {
		for (const page of group.pages) {
			const d = page.data.description;
			parts.push(
				[
					`# ${page.data.title}`,
					"",
					`Source: ${pageUrl(page.id)}`,
					...(d ? ["", `> ${d}`] : []),
					"",
					plainMarkdown(page),
				].join("\n"),
			);
		}
	}
	return new Response(`${parts.join("\n\n---\n\n")}\n`, {
		headers: { "Content-Type": "text/plain; charset=utf-8" },
	});
};
