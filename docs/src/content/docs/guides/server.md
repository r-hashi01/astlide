---
title: Render service (HTTP API)
description: Run Astlide as an HTTP service — Markdown in, PowerPoint / PDF / PNG out — with an OpenAPI spec for Dify, n8n and other tools.
---

`@astlide/server` (`packages/server` in the repository) wraps Astlide in a small HTTP API, so tools that can call an API but don't run Node or Astro can make slides: Dify or n8n custom tools, chat bots, internal apps.

- `POST /render` — Markdown slides, with a built-in theme or an uploaded PowerPoint template → editable **PPTX**, **PDF**, or **PNG** (a ZIP, one image per slide)
- `POST /import` — a `.pptx` (or a Google Slides URL) → the slides as HTML, with titles and speaker notes
- `POST /templates/layouts` — a PowerPoint template → its layouts and where their placeholders are
- `GET /openapi.json` — the OpenAPI 3.1 spec · `GET /health` — health check

Nothing is kept: each render builds a throwaway Astro project, and it is deleted as soon as the response is ready. Uploaded files are never written anywhere else.

## Run it with Docker

The image has everything a render needs: Node and Bun, Chromium for PDF / PNG, and Noto CJK fonts so Japanese, Chinese and Korean text renders. Build it from the repository root:

```bash
docker build -f packages/server/Dockerfile -t astlide-server .
docker run --rm -p 8787:8787 astlide-server
```

```bash
curl localhost:8787/health
# {"status":"ok","version":"0.0.0","queue":{"running":0,"waiting":0}}
```

Without Docker, from a clone of the repository (Node 22.12+ and Bun; for PDF / PNG also `bunx playwright install chromium`):

```bash
bun install
bun packages/server/src/cli.ts
```

## Render slides

Send all slides as one Markdown string, separated by lines that are exactly `---`. A slide can start with a frontmatter block — the same keys as in a deck (`slideLayout`, `title`, `notes`, `background`, `hidden` …):

```bash
curl -o review.pptx -H 'content-type: application/json' localhost:8787/render -d '{
  "markdown": "---\nslideLayout: cover\n---\n# Quarterly review\n\nQ3 2026\n---\n# Highlights\n\n- Revenue up 12%\n- Two new regions",
  "theme": "corporate",
  "title": "Quarterly review",
  "format": "pptx"
}'
```

Or send `slides` as an array — Markdown strings, or objects with `markdown` (or `html`) and frontmatter:

```json
{
  "slides": [
    { "markdown": "# Quarterly review\n\nQ3 2026", "slideLayout": "cover" },
    { "markdown": "# Highlights\n\n- Revenue up 12%", "notes": "Mention the new regions" },
    { "markdown": "# Thanks", "frontmatter": { "background": "#0b132b" } }
  ],
  "format": "pdf"
}
```

| Field | |
| --- | --- |
| `markdown` / `slides` | The slides (one of them). |
| `theme` | A built-in theme: `default`, `dark`, `minimal`, `corporate`, `gradient`, `rose`, `forest`. |
| `template` | A PowerPoint template (`.pptx` / `.potx` / `.thmx`) to use as the theme instead — a file field in multipart, or `{ "filename": "brand.pptx", "data": "<base64>" }` in JSON. |
| `format` | `pptx` (default), `pdf`, or `png` (a ZIP of one PNG per slide). |
| `output` | `file` (default): the file itself. `base64`: JSON `{ filename, contentType, size, data }` for clients that only handle JSON. |
| `title`, `author`, `date` | Deck metadata; the title also names the file. |

Slides are Markdown (`.md`), not MDX: components and imports aren't available, which keeps requests from running code on the server. A middle segment made only of `key: value` lines is read as the next slide's frontmatter.

### With a PowerPoint template

Upload the template with the slides (multipart here). The built-in layouts map to the template's (`cover` → its title slide, `default` → title and content …), and every template layout can be picked by its id:

```bash
curl -o q3.pptx localhost:8787/render \
  -F template=@brand.pptx \
  -F 'markdown=---
slideLayout: cover
---
# Q3 review
---
slideLayout: comparison
---
# Before / after'
```

`POST /templates/layouts` lists those ids, with each layout's title / body / slide-number placeholder boxes (px on a 1920×1080 canvas) — handy for an LLM choosing a layout per slide:

```bash
curl -F file=@brand.pptx localhost:8787/templates/layouts
# {"fonts":{…},"aliases":{"cover":"title-slide",…},"layouts":[{"id":"title-slide","name":"Title Slide","title":{"left":72,…},"body":[…]},…]}
```

See [PowerPoint templates](/astlide/guides/templates/) for how content fills the placeholders.

## Import a deck

```bash
curl -F file=@kickoff.pptx localhost:8787/import
curl -H 'content-type: application/json' -d '{"url":"https://docs.google.com/presentation/d/…"}' localhost:8787/import
```

The answer has each slide as an Astlide HTML slide (pictures inlined as `data:` URLs), its title, speaker notes and whether it's hidden. The HTML can be sent back to `/render` as `{ "html": "…" }` slides. Google Slides decks must be shared as "Anyone with the link"; only `docs.google.com/presentation` URLs are fetched.

## Use it from Dify, n8n and others

The service describes itself at `GET /openapi.json` (OpenAPI 3.1, with `servers` set to the URL it was reached at — or `PUBLIC_URL`):

- **Dify** — Tools → Custom → Create Custom Tool → *Import from URL*, and enter `http://<host>:8787/openapi.json`. Each operation (`renderSlides`, `importPresentation`, `listTemplateLayouts`) becomes a tool an agent or workflow can call. Use `output: base64` where a tool must answer JSON. If you set an API key, choose *API Key* → *Bearer* as the authorization.
- **n8n** — an *HTTP Request* node (`POST /render`, response format *File*), or import the spec in tools that read OpenAPI.

## Settings

Environment variables:

| Variable | Default | |
| --- | --- | --- |
| `PORT` / `HOST` | `8787` / `0.0.0.0` | Where the server listens. |
| `ASTLIDE_API_KEY` | — | When set, requests need `Authorization: Bearer <key>` (or `X-API-Key`). `/health` and `/openapi.json` stay open. |
| `PUBLIC_URL` | from the request | The URL put in the OpenAPI spec's `servers`. |
| `MAX_BODY_MB` | `50` | Largest request (413 beyond). |
| `MAX_SLIDES` | `200` | Most slides per render. |
| `RENDER_TIMEOUT_MS` | `180000` | A render taking longer is stopped (504). |
| `CONCURRENCY` / `MAX_QUEUE` | `2` / `16` | Renders at once, and how many may wait; more get 503. |
| `ASTLIDE_WORK_DIR` | `.astlide-work` next to `node_modules` | Where per-request projects are made. It must share a parent directory with the installed packages. |

Errors are JSON `{ "error": "…" }`: 400 for bad input (checked before anything is built — e.g. a frontmatter value the slide schema rejects), 422 when the build or export fails, with the end of its log.

## Limits

- Each render is a full Astro build: a small deck takes about 3–5 seconds (PPTX or PDF), more with many slides.
- Raw HTML in the Markdown is rendered as is, and PDF / PNG load the slides in Chromium. Run the service where its users are trusted (an internal network, or behind `ASTLIDE_API_KEY`).
- PPTX export fetches web fonts and images the slides use, so the server needs outbound internet access for them.
