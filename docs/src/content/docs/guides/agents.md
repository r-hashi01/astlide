---
title: Coding agents
description: Set up Claude Code, Codex or Gemini CLI to write Astlide decks, check them for text that doesn't fit, and export them, using the MCP server, the agent skill and llms.txt.
---

Slides in Astlide are plain files, so a coding agent can write them. Three things help it do the job well:

- The **MCP server** gives the agent tools to read PowerPoint templates, import `.pptx` files, find text that doesn't fit on a slide, and export decks.
- The **agent skill** teaches the agent the slide syntax, the layouts, and the loop of writing, checking, fixing and exporting.
- The **docs as plain text** at [`/llms.txt`](https://astlide.dev/llms.txt) and [`/llms-full.txt`](https://astlide.dev/llms-full.txt) give it the full reference.

## MCP server

The server ships with `@astlide/core`, so any project that uses Astlide already has it. `astlide mcp` starts it and talks to the client over stdio. It runs on [Bun](https://bun.sh).

Every tool call names the Astlide project to work on.

### Add it to Claude Code

```bash
claude mcp add astlide -- bunx astlide mcp
```

To share the setup with your team, add `--scope project`. Claude Code then writes it to `.mcp.json`.

### Add it to Codex

```toml
# ~/.codex/config.toml
[mcp_servers.astlide]
command = "bunx"
args = ["astlide", "mcp", "--root", "/path/to/your/slides"]
```

### Add it to Gemini CLI

```json
// ~/.gemini/settings.json (or .gemini/settings.json in the project)
{
  "mcpServers": {
    "astlide": {
      "command": "bunx",
      "args": ["astlide", "mcp", "--root", "/path/to/your/slides"]
    }
  }
}
```

### Other clients

Other MCP clients, such as Claude Desktop, use the same command: `bunx astlide mcp --root /path/to/your/slides`. Pass the project folder, or a folder that holds your projects, as `--root`. If the client sends MCP roots, you can leave `--root` out. [What the server may touch](#what-the-server-may-touch) explains how these folders are used.

If your team keeps its PowerPoint templates in a [template store](/guides/template-storage/), add `--template-store <location>` (or set `ASTLIDE_TEMPLATE_STORE`), and agents can list the stored templates and read their layouts by name.

### Tools

| Tool | Arguments | Returns |
|---|---|---|
| `list_templates` | none (only with a template store) | The stored templates: name (use it as the deck's `theme`), label, latest version and versions |
| `template_layouts` | `templatePath` (`.pptx` / `.potx` / `.thmx`), or with a template store `template` (a stored template's name) and optional `version` | The template's layouts: the id to use as `slideLayout`, PowerPoint name and type, title / body / slide-number placeholders, and which built-in layouts (`cover`, `section`, `default`, `two-column`, `code`) are drawn with each; theme colors and fonts |
| `import_pptx` | `path`, optional `projectRoot`, `deck`, `force`, `includeHtml` | Each slide's title, speaker notes and text as Markdown. With `projectRoot`, also writes an editable deck, like [`astlide import`](/guides/import/) |
| `check_deck` | `projectRoot`, `deck`, optional `build` | Text and boxes that don't fit, per slide (below) |
| `render_deck` | `projectRoot`, `deck`, `formats` (`pptx`, `pdf`), optional `outDir` (inside the project), `build` | The exported files' paths, as [`astlide export`](/guides/export/) writes them |

You don't need a dev server running. `check_deck` and `render_deck` build the site themselves:

- `check_deck` builds only when `dist/` is missing or older than the deck's files or the Astro config. Pass `build: true` to always build, or `build: false` to never build.
- `render_deck` builds every time. With `build: false` it reuses the last export build, or `dist/` if there is none.

`render_deck` writes to `exports/` in the project unless you set `outDir`. PDF export needs Playwright's Chromium (`bunx playwright install chromium`).

### What the server may touch

Building and exporting run the project's own code: its Astro config and integrations, its MDX slides, any `bunfig.toml` preload, and the `@astlide/core` installed in the project. `import_pptx` with `projectRoot` runs the project's `astlide` CLI. Because of this, the server limits what it does.

**Approve calls one by one.** Only `template_layouts` and `list_templates` are marked read-only. `check_deck` and `render_deck` are not, even though `check_deck` with `build: false` only reads. `import_pptx` is marked destructive, because `force` deletes an existing deck folder of the same name. Set your client to ask before each call of `check_deck`, `render_deck`, and `import_pptx` with a project, instead of approving them automatically.

**Projects must be in an allowed folder.** The server picks the allowed folders like this:

1. Folders you name with `--root <dir>` (repeatable) or `ASTLIDE_MCP_ROOTS` (separated like `PATH`) set the outer limit.
2. If the client sends MCP roots, the server uses those. Claude Code sends them, so there is nothing to set up. If you also named folders, only client roots inside them count.
3. With neither, the server uses the folder it was started in. It refuses that folder if it is the filesystem root, your home folder, a shared folder (`/tmp`, `/Users/Shared`, `C:\Users\Public` …), or a folder above one of these, because clients often start servers there. Then no project is allowed until you name a folder.

A project has to be one of the allowed folders or sit directly inside one. With `--root ~/slides`, `~/slides/q3-review` works, but `~/slides/clones/someone-else` does not; give it its own `--root`. This stops one broad folder from opening up every repository somewhere below it.

A few more rules apply:

- Client roots that are too broad (as in step 3) are skipped one at a time, with a note on stderr. The filesystem root never counts, even if you name it.
- The project path is resolved once, and the work happens at that resolved path. Swapping a symlink afterwards has no effect.
- The files `template_layouts` and `import_pptx` read must also be inside the allowed folders, at any depth, with symlinks resolved. They must be regular files with the right extension and no larger than 256 MB.
- `import_pptx` picks the deck name itself, from the file name unless you pass `deck`, and checks the name before writing anything. If the project's `@astlide/core` is older than 2.8.0, the server writes the deck with its own `astlide` CLI.
- Deck names must be plain folder names. `outDir` must stay inside the project, after symlinks are followed.
- Builds and exports get only the environment variables they need (`PATH`, `HOME`, locale, proxy settings, `ASTLIDE_*` …). Tokens and keys are not passed on.

To lift the folder restriction entirely, set `ASTLIDE_MCP_ANY_PROJECT=1` in the server's environment.

## Checking a deck

`check_deck` lays out the deck with the same engine as the [PowerPoint export](/guides/export/). It works at 1920×1080 with the theme's fonts and doesn't need a browser. For each slide it reports these problems:

| Kind | Meaning |
|---|---|
| `text-clipped` | Text cut off by the slide or by a box with `overflow: hidden`, so part of it can't be seen |
| `text-overflow` | Text spilling out of its box (a fixed-height card, a column, the slide's content area) |
| `box-clipped` / `box-overflow` | The same for pictures, tables and embeds |
| `off-slide` | Outside the slide, where nothing clips it |

Each issue gives the slide number and title, the text, the element and what it overflows, and how many pixels it sticks out on which side:

```text
2 problem(s) in 2 of 12 slides:
- Slide 4 "Results": 5 text blocks, "Churn fell to 2%" to "Next: EMEA", are cut off by the slide (186px bottom)
- Slide 9 "Pricing": text "Enterprise plans include single sign-on, audit logs and…" (p) is cut off by div.card (48px bottom)
```

From this, the agent can shorten the text, split the slide or switch layouts, and then run the check again.

The check reads the built deck, which leaves out [hidden slides](/guides/decks/#hidden-slides). Slide numbers in the report count only the slides that are shown.

Text is measured with the fonts the deck loads (its `@font-face` rules and Google Fonts). If a font can't be found, the result says so and the widths are approximate. Two things are not checked: Mermaid diagrams, which the browser lays out, and pages of a `.pptx` file shown as they are.

## Agent skill

[`skills/astlide/SKILL.md`](https://github.com/r-hashi01/astlide/tree/main/skills/astlide) is an [Agent Skill](https://agentskills.io). It covers deck structure, frontmatter, layouts, components, PowerPoint templates, export, the check loop, and common mistakes such as writing `layout` where `slideLayout` belongs.

- **Claude Code**: copy the folder to `.claude/skills/astlide/` in your project, or to `~/.claude/skills/astlide/` to use it in every project.

  ```bash
  mkdir -p .claude/skills && cp -r /path/to/astlide/skills/astlide .claude/skills/
  ```

- **Other agents**: if the agent supports Agent Skills, put the same folder in its skills directory. If it doesn't, point to the file from the agent's instructions (`AGENTS.md`, `GEMINI.md`).

## llms.txt

The docs are also published as plain text for language models:

- [`https://astlide.dev/llms.txt`](https://astlide.dev/llms.txt) lists every page with a one-line summary, in the [llms.txt format](https://llmstxt.org).
- [`https://astlide.dev/llms-full.txt`](https://astlide.dev/llms-full.txt) has every page as Markdown in one file.

When an agent needs to know all of Astlide at once, give it `llms-full.txt`.
