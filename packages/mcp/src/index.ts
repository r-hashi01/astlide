/**
 * @astlide/mcp — an MCP server that lets coding agents work on Astlide
 * decks: read a PowerPoint template's layouts, import a .pptx, find text
 * that doesn't fit, and export to PowerPoint / PDF.
 *
 * The tools' functions are exported for use without MCP.
 *
 * @module
 */

export {
	type CheckDeckOptions,
	type CheckDeckResult,
	type CheckOptions,
	checkDeck,
	checkLayouts,
	checkSlide,
	type IssueKind,
	type LayoutIssue,
	type Overflow,
} from "./check";
export {
	type ImportedSlideText,
	type ImportOptions,
	type ImportResult,
	importPptx,
	readPptx,
	slideMarkdown,
} from "./import";
export { type RenderFormat, type RenderOptions, type RenderResult, renderDeck } from "./render";
export { createServer } from "./server-def";
export {
	type TemplateLayoutInfo,
	type TemplateLayoutsResult,
	templateLayouts,
	templateLayoutsFromFile,
} from "./template";
