declare module "svgdom" {
	interface SvgdomConfig {
		setFontDir(dir: string): SvgdomConfig;
		setFontFamilyMappings(map: Record<string, string>): SvgdomConfig;
		preloadFonts(): SvgdomConfig;
	}
	export const config: SvgdomConfig;
	export function createHTMLWindow(): unknown;
}
