/** ```mermaid diagrams: `mermaid`, loaded when a slide has one. Added when the app has `mermaid`. */

import { defineNuxtPlugin } from "#app";

export default defineNuxtPlugin(() => {
	window.__astlide_load_mermaid = () => import("mermaid");
});
