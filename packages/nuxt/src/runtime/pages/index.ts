/** The list of decks. */

import { defineComponent, h } from "vue";
import { useHead } from "#app";
import { decks, options } from "../shared";

export default defineComponent({
	name: "AstlideDeckIndex",
	setup() {
		useHead({ title: "Decks" });
		return () =>
			h("main", { class: "astlide-deck-index" }, [
				h("h1", "Decks"),
				h(
					"ul",
					decks.map((d) =>
						h("li", { key: d.name }, [
							h(
								"a",
								{ href: `${options.basePath}/${encodeURIComponent(d.name)}/1` },
								d.config.title ?? d.name,
							),
							d.config.author ? ` — ${d.config.author}` : "",
						]),
					),
				),
			]);
	},
});
