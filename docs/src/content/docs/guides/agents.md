---
title: Coding agents
description: Let Claude Code, Codex or Gemini CLI write, check and export decks — the MCP server, the agent skill and llms.txt.
---

Coding agents can write Astlide decks like any other files. Three things help them do it well:

- the **MCP server**, whose tools read PowerPoint templates, import `.pptx` files, find text that doesn't fit and export decks;
- the **agent skill**, which teaches the slide syntax, layouts and the write → check → fix → export loop;
- the **docs as plain text**, at [`/llms.txt`](https://astlide.dev/llms.txt) and [`/llms-full.txt`](https://astlide.dev/llms-full.txt).

## MCP server

The server comes with `@astlide/core`: `astlide mcp` runs it over stdio, with [Bun](https://bun.sh). Nothing else to install — any project with Astlide has it.

Each call names the Astlide project to work on, and uses that project's own `@astlide/core`.

### Tools

| Tool | Arguments | Returns |
|---|---|---|
| `template_layouts` | `templatePath` (`.pptx` / `.potx` / `.thmx`) | The template's layouts: the id to use as `slideLayout`, PowerPoint name and type, title / body / slide-number placeholders, and which built-in layouts (`cover`, `section`, `default`, `two-column`, `code`) are drawn with each; theme colors and fonts |
| `import_pptx` | `path`, optional `projectRoot`, `deck`, `force`, `includeHtml` | Each slide's title, speaker notes and text as Markdown. With `projectRoot`, also writes an editable deck, like [`astlide import`](/guides/import/) |
| `check_deck` | `projectRoot`, `deck`, optional `build` | Text and boxes that don't fit, per slide (below) |
| `render_deck` | `projectRoot`, `deck`, `formats` (`pptx`, `pdf`), optional `outDir` (inside the project), `build` | The exported files' paths, as [`astlide export`](/guides/export/) writes them |

`check_deck` and `render_deck` build the site themselves (`check_deck` only when `dist/` is older than the deck), so no dev server is needed. Building runs the project's Astro config, so neither tool is marked read-only; `check_deck` with `build: false` only reads. PDF export needs Playwright's Chromium (`bunx playwright install chromium`).

### Claude Code

```bash
claude mcp add astlide -- bunx astlide mcp
```

Add `--scope project` to share it with your team through `.mcp.json`.

### Codex

```toml
# ~/.codex/config.toml
[mcp_servers.astlide]
command = "bunx"
args = ["astlide", "mcp"]
```

### Gemini CLI

```json
// ~/.gemini/settings.json (or .gemini/settings.json in the project)
{
  "mcpServers": {
    "astlide": {
      "command": "bunx",
      "args": ["astlide", "mcp"]
    }
  }
}
```

Other MCP clients take the same command: `bunx astlide mcp`, started in the project folder.

## Checking a deck

`check_deck` lays the deck out with the engine behind the [PowerPoint export](/guides/export/) — at 1920×1080, with the theme's fonts, without a browser — and reports, per slide:

| Kind | Meaning |
|---|---|
| `text-clipped` | Text cut off by the slide or a box with `overflow: hidden` — part of it can't be seen |
| `text-overflow` | Text spilling out of its box (a fixed-height card, a column, the slide's content area) |
| `box-clipped` / `box-overflow` | The same for pictures, tables and embeds |
| `off-slide` | Outside the slide, where nothing clips it |

Each issue has the slide number and title, the text, the element and what it overflows, and how far in px on which side:

```text
2 problem(s) in 2 of 12 slides:
- Slide 4 "Results": 5 text blocks, "Churn fell to 2%" to "Next: EMEA", are cut off by the slide (186px bottom)
- Slide 9 "Pricing": text "Enterprise plans include single sign-on, audit logs and…" (p) is cut off by div.card (48px bottom)
```

so the agent can shorten the text, split the slide or pick another layout, and check again.

Text is measured with the fonts the deck loads (its `@font-face` rules and Google Fonts); when one can't be found, the result says so and widths are approximate. Not checked: Mermaid diagrams (laid out by the browser) and pages of `.pptx` files shown as they are.

## Agent skill

[`skills/astlide/SKILL.md`](https://github.com/r-hashi01/astlide/tree/main/skills/astlide) is an [Agent Skill](https://agentskills.io): deck structure, frontmatter, layouts, components, PowerPoint templates, export, the check loop and the usual mistakes (such as `slideLayout`, not `layout`).

- **Claude Code**: copy the folder to `.claude/skills/astlide/` in your project (or `~/.claude/skills/astlide/` for every project).

  ```bash
  mkdir -p .claude/skills && cp -r /path/to/astlide/skills/astlide .claude/skills/
  ```

- **Other agents** that read Agent Skills load the same folder from their skills directory; for the rest, point the agent at the file from its instructions (`AGENTS.md`, `GEMINI.md`).

## llms.txt

The docs are published for language models as well:

- [`https://astlide.dev/llms.txt`](https://astlide.dev/llms.txt) — every page with a one-line summary ([llms.txt format](https://llmstxt.org));
- [`https://astlide.dev/llms-full.txt`](https://astlide.dev/llms-full.txt) — all pages as Markdown in one file.

Give an agent the second one when it should know all of Astlide at once.
