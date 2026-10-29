// `.astro` components as plain `tsc` sees them (in an Astro project, Astro's
// language server types them): the factory the Container API renders.
declare module "*.astro" {
	import type { AstroComponentFactory } from "astro/runtime/server/index.js";

	const Component: AstroComponentFactory;
	export default Component;
}
