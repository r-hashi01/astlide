---
title: Render service (HTTP API)
description: Run Astlide as an HTTP service that turns Markdown into PowerPoint, PDF or PNG. Its OpenAPI spec lets Dify, n8n and similar tools call it.
---

`@astlide/server` (`packages/server` in the repository) runs Astlide behind a small HTTP API. Use it when the thing that needs slides can call an HTTP API but can't run Node or Astro itself, such as a Dify or n8n tool, a chat bot or an internal app.

| Endpoint | What it does |
| --- | --- |
| `POST /render` | Takes Markdown slides and returns an editable **PPTX**, a **PDF**, or **PNG** images (a ZIP with one image per slide). Styling comes from a built-in theme or an uploaded PowerPoint template. |
| `POST /import` | Takes a `.pptx` file or a Google Slides URL and returns each slide as HTML, with its title and speaker notes. |
| `POST /templates/layouts` | Takes a PowerPoint template and returns its layouts and the position of each placeholder. |
| `GET` `POST /templates`<br>`GET` `DELETE /templates/{name}`<br>`GET /templates/{name}/file` | Keep PowerPoint templates on the server by name, so renders can use one without uploading it. Only when template storage is on (see [Keep templates on the server](#keep-templates-on-the-server)). |
| `GET /openapi.json` | The OpenAPI 3.1 spec. |
| `GET /health` | Health check. |

Each render works in a temporary folder that is deleted once the response is ready, and files sent with a render or an import are not written anywhere else. The only data the service keeps is the templates you upload to `/templates`, and only when you turn template storage on.

## Run it with Docker

The Docker image contains everything a render needs: Node, Bun, Chromium for PDF and PNG, and Noto CJK fonts for Japanese, Chinese and Korean text. Build it from the repository root and start it with an API key:

```bash
docker build -f packages/server/Dockerfile -t astlide-server .
export ASTLIDE_API_KEY="$(openssl rand -hex 24)"
docker run --rm -p 8787:8787 -e ASTLIDE_API_KEY \
  --security-opt seccomp=packages/server/chromium-seccomp.json astlide-server
```

The container listens on all interfaces, so it refuses to start without an API key (see [Security](#security)). The seccomp profile is Docker's default profile plus the namespace system calls that Chromium's sandbox needs. Without it, PDF and PNG renders fail; the service never falls back to running Chromium unsandboxed.

Send the key with every request: `-H "Authorization: Bearer $ASTLIDE_API_KEY"`. The examples below leave it out for brevity. `/health` and `/openapi.json` work without it:

```bash
curl localhost:8787/health
# {"status":"ok","version":"0.0.0","queue":{"running":0,"waiting":0}}
```

You can also run the server from a clone of the repository. You need Node 22.12 or later and Bun, and for PDF or PNG output, Chromium (`bunx playwright install chromium`):

```bash
bun install
bun packages/server/src/cli.ts   # listens on 127.0.0.1 only
```

## Render slides

Put all slides in one Markdown string and separate them with lines that contain only `---`. Each slide can start with a frontmatter block. It takes the same keys as a slide in a deck, such as `slideLayout`, `title`, `notes`, `background` and `hidden`:

```bash
curl -o review.pptx -H 'content-type: application/json' localhost:8787/render -d '{
  "markdown": "---\nslideLayout: cover\n---\n# Quarterly review\n\nQ3 2026\n---\n# Highlights\n\n- Revenue up 12%\n- Two new regions",
  "theme": "corporate",
  "title": "Quarterly review",
  "format": "pptx"
}'
```

If you build slides one by one, send them as a `slides` array instead. Each item is either a Markdown string or an object with `markdown` (or `html`) plus frontmatter keys:

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

| Field | Description |
| --- | --- |
| `markdown` / `slides` | The slides. Send one of the two. |
| `theme` | A built-in theme: `default`, `dark`, `minimal`, `corporate`, `gradient`, `rose` or `forest`. |
| `template` | A PowerPoint template (`.pptx`, `.potx` or `.thmx`) to use in place of a theme. In a multipart request, send it as a file field. In JSON, send `{ "filename": "brand.pptx", "data": "<base64>" }`. Or send the name of a [stored template](#keep-templates-on-the-server). |
| `templateVersion` | With a stored template's name: the version to use. The latest version is used when you leave it out. |
| `format` | `pptx` (default), `pdf`, or `png` (a ZIP with one PNG per slide). |
| `output` | `file` (default) returns the file itself. `base64` returns JSON `{ filename, contentType, size, data }`, for clients that can only handle JSON. |
| `title`, `author`, `date` | Deck metadata. The title is also used for the file name. |

Slides are processed as Markdown (`.md`), so components and `import` statements are not available. This keeps a request from running code on the server.

When splitting the Markdown string, a section that contains only `key: value` lines is treated as the frontmatter of the slide that follows it.

### With a PowerPoint template

Upload the template along with the slides. This example uses multipart:

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

Astlide's built-in layout names map to matching template layouts: `cover` uses the template's title slide, `default` uses title and content, and so on. You can also use any of the template's layouts by its id.

To get those ids, send the template to `POST /templates/layouts`. The response also gives the title, body and slide-number placeholder boxes of each layout, in px on a 1920×1080 canvas. This is useful when an LLM picks a layout for each slide:

```bash
curl -F file=@brand.pptx localhost:8787/templates/layouts
# {"fonts":{…},"aliases":{"cover":"title-slide",…},"layouts":[{"id":"title-slide","name":"Title Slide","title":{"left":72,…},"body":[…]},…]}
```

For how slide content fills the placeholders, see [PowerPoint templates](/guides/templates/).

## Keep templates on the server

If your team renders with the same few templates, upload them once and refer to them by name. Turn template storage on with `ASTLIDE_TEMPLATE_STORE`: a directory, or a bucket on Amazon S3 (or R2, MinIO), Google Cloud Storage or Azure Blob Storage. [Template storage](/guides/template-storage/) explains how to set up each one. For a quick start, a Docker volume will do:

```bash
docker run --rm -p 8787:8787 -e ASTLIDE_API_KEY \
  -e ASTLIDE_TEMPLATE_STORE=/data/templates -v astlide-templates:/data/templates \
  --security-opt seccomp=packages/server/chromium-seccomp.json astlide-server
```

Upload a template with a name. Names use lowercase letters, digits and hyphens, and can't be the name of a built-in theme. `label` is an optional display name:

```bash
curl localhost:8787/templates -F name=acme -F label="Acme 2026" -F file=@acme.potx
# {"name":"acme","label":"Acme 2026","latest":1,"versions":[{"version":1,"ext":".potx",…}],…}
```

Then render with the name in place of the file:

```bash
curl -o q3.pptx -H 'content-type: application/json' localhost:8787/render -d '{
  "markdown": "# Q3 review\n---\n# Highlights\n\n- Revenue up 12%",
  "template": "acme"
}'
```

Uploading again under the same name adds a new version, and renders switch to it. Earlier versions stay, so you can go back to one with `"templateVersion": 1` or download it. The service reads each file before storing it: a file that isn't a PowerPoint template is refused, and the layouts are saved alongside it.

| Request | What it does |
| --- | --- |
| `GET /templates` | Lists the stored templates and their versions. |
| `POST /templates` | Stores a template (`name`, `file`, optional `label`), or adds a version to an existing one. Returns 201 for a new template and 200 for a new version. |
| `GET /templates/{name}` | Returns the template's versions, and the layouts of the latest version in the same form as `POST /templates/layouts`. Add `?version=` for another version's layouts. |
| `GET /templates/{name}/file` | Downloads the file as it was uploaded (`?version=` for an earlier one). |
| `DELETE /templates/{name}` | Deletes the template with all its versions, or only one with `?version=`. Deleting the last version deletes the template. |

Version numbers count up and are never reused, so a number always means the same file even after you delete versions.

Several servers can render from one store, but let only one of them add or delete templates (see [How templates are kept](/guides/template-storage/#how-templates-are-kept)).

## Import a deck

Send a `.pptx` file, or the URL of a Google Slides deck:

```bash
curl -F file=@kickoff.pptx localhost:8787/import
curl -H 'content-type: application/json' -d '{"url":"https://docs.google.com/presentation/d/…"}' localhost:8787/import
```

The response has the deck's title, author, size and theme. For each slide it gives the slide as Astlide HTML (images inlined as `data:` URLs), its title, its speaker notes and whether it is hidden. You can send this HTML back to `/render` as `{ "html": "…" }` slides.

The service only fetches `docs.google.com/presentation` URLs. Share the Google Slides deck as "Anyone with the link" first, or the download fails.

## Use it from Dify, n8n and other tools

`GET /openapi.json` returns an OpenAPI 3.1 spec of the service. Its `servers` entry is the URL you used to reach the service, or `PUBLIC_URL` if you set it.

- **Dify**: open Tools → Custom → Create Custom Tool, choose *Import from URL*, and enter `http://<host>:8787/openapi.json`. Each operation (`renderSlides`, `importPresentation`, `listTemplateLayouts`, and the template operations such as `listTemplates`) becomes a tool that agents and workflows can call. If the tool has to return JSON, set `output: base64`. If the server has an API key, choose *API Key* → *Bearer* as the authorization type.
- **n8n**: use an *HTTP Request* node that calls `POST /render`, with the response format set to *File*. Tools that read OpenAPI specs can import the spec directly.

## Settings

Configure the server with environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` / `HOST` | `8787` / `127.0.0.1` (`0.0.0.0` in the Docker image) | The port and address the server listens on. |
| `ASTLIDE_API_KEY` | (none) | When set, requests must send `Authorization: Bearer <key>` or `X-API-Key: <key>`. `/health` and `/openapi.json` stay open. Required when `HOST` is not a loopback address. |
| `ASTLIDE_ALLOW_UNAUTHENTICATED` | `0` | `1` lets the server listen beyond loopback without a key. Use it only when something in front of the server, such as a gateway or a private network, controls who can call it. |
| `ASTLIDE_ALLOW_PRIVATE_NETWORK` | `0` | `1` lets slides load resources from the server's own network (see [Security](#security)). |
| `PUBLIC_URL` | Taken from the request | The URL written to `servers` in the OpenAPI spec. |
| `MAX_BODY_MB` | `50` | The largest request body. Larger requests get 413. This also caps Google Slides downloads. |
| `MAX_SLIDES` | `200` | The most slides in one render. |
| `MAX_OUTPUT_MB` | `200` | The largest output file (PPTX, PDF or PNG ZIP). Larger output gets 422. |
| `RENDER_TIMEOUT_MS` | `180000` | A render, or the reading of an uploaded PowerPoint file, is stopped after this long and gets 504. |
| `CONCURRENCY` / `MAX_QUEUE` | `2` / `16` | How many renders run at once, and how many can wait. Requests beyond that get 503 before their upload is read. |
| `ASTLIDE_CHROMIUM_SANDBOX` | `1` | Chromium's sandbox for PDF and PNG. `0` turns it off. Do this only if you trust every caller (see [Security](#security)). |
| `ASTLIDE_TEMPLATE_STORE` | (none) | Turns template storage on: a directory, `s3://`, `gs://` or `azure://<bucket>/<prefix>`. The cloud credentials go in each provider's usual variables (see [Template storage](/guides/template-storage/)). Without it, the `/templates` routes return 404. |
| `ASTLIDE_WORK_DIR` | `.astlide-work` next to `node_modules` | Where the per-request folders are created, and the shared font cache. |

Errors come back as JSON `{ "error": "…" }`. Invalid input gets 400. Input is checked before anything is built, so a frontmatter value that the slide schema rejects fails at this point. If the build or export fails, the response is 422 and includes the end of the build log.

## Limits

- A render doesn't build an Astro site: the slides go straight to the exporters. A small deck takes about a second as PPTX or PDF, and more slides take longer.
- Slides are Markdown or HTML, so MDX components (and an Astro site's slide decorators) aren't available.
- PPTX export downloads the web fonts and images that the slides use, so the server needs outbound internet access.

## Security

Treat every request as untrusted content. Raw HTML in the Markdown is rendered as is, and for PDF and PNG it is loaded into Chromium on your server. The service protects itself as described below, and you can add your own measures on top.

### Access

- The server needs an API key to listen on anything other than loopback. If `ASTLIDE_API_KEY` is not set, it refuses to start unless `HOST` is `127.0.0.1`, `localhost` or `::1`. If a gateway or network in front of it already controls access, set `ASTLIDE_ALLOW_UNAUTHENTICATED=1` instead.
- Without a valid key, every path except `/`, `/health` and `/openapi.json` returns 401, including paths that don't exist. The key is compared in constant time.
- With template storage on, anyone with the key can add, download and delete templates. If callers shouldn't change the templates, put a gateway in front that only lets `GET /templates…` and `POST /render` through for them.

### Network access during a render

- Slides and the exporter can load only from the deck itself, `data:` and `blob:` URLs, and public internet hosts. Requests to loopback, private ranges (`10/8`, `172.16/12`, `192.168/16`, `fc00::/7` and others), link-local addresses (including the cloud metadata address `169.254.169.254`) and other reserved ranges are refused, and so are redirects to them. WebSockets and service workers are blocked. Set `ASTLIDE_ALLOW_PRIVATE_NETWORK=1` only if you trust every caller and the slides need intranet resources.
- Chromium never connects to other hosts directly. Astlide makes each request on its behalf and passes the response back. The address is checked at the moment of connecting, and the connection goes to that checked address, so a host can't pass the check with one DNS answer and then connect to another (DNS rebinding). Each redirect hop is checked the same way. Any request that doesn't go through Astlide is sent to a proxy that doesn't exist, and WebRTC can't send UDP on its own.
- If the service is open to untrusted callers, also restrict the container's outbound traffic with a firewall or egress policy that allows only the public internet.

### Resource limits

- PDF and PNG renders fetch at most 6 resources at a time, up to 20 MB each and 200 MB in total. The page can't navigate away from the deck, so a refresh or redirect can't replace what is rendered.
- PPTX export has one shared budget for images and embed previews: 6 at a time, 200 MB and 200 distinct URLs in total, with images up to 20 MB and pages up to 2 MB each. Anything past the budget is skipped with a warning.
- Same-site iframes are laid out up to 32 documents per slide, and a page is never laid out inside itself.
- Google Fonts requested by the slides are limited to 12 families per render. The shared font cache is kept under 512 MB.
- Chromium runs at most 4 renderer processes, each with a 512 MB JavaScript heap. On Linux, each render is marked so that the kernel kills it before the server when memory runs out (`oom_score_adj`). Set limits on the container as well:

  ```bash
  docker run --memory 4g --pids-limit 512 … astlide-server
  ```

- A URL path can be at most 2 KB (414), and a request body must arrive within 60 seconds (408).

### Input checks

- Markdown images must use URLs. An image with a file path, such as `![](../x.png)`, is rejected with 400, because the exporter would read that file from the server's disk. Use `https:` or `data:` URLs.
- Each slide is written with its own frontmatter block. A slide body that starts with `---` stays part of the body and can't bypass the frontmatter checks.
- Frontmatter can't use YAML anchors or aliases (`&a`, `*a`), and is limited to 256 KB per slide.
- Uploaded PowerPoint files (`/import`, `/templates/layouts`, `POST /templates`) are read in a child process and go through the same queue as renders. Reading that takes longer than `RENDER_TIMEOUT_MS` is stopped (504), and a result larger than `MAX_OUTPUT_MB` is rejected (422). Neither case can stall the server itself.
- Renders get only the environment variables they need: `PATH`, `HOME`, temp directories, locale settings, `PLAYWRIGHT_BROWSERS_PATH`, and the render settings the server passes in (slide limit, sandbox, network policy). They don't see the server's secrets, `ASTLIDE_API_KEY`, cloud credentials or proxy settings.

### Chromium sandbox

- Chromium runs inside its sandbox, so a bug in its renderer stays contained.
- The sandbox needs user namespaces. In Docker, start the container with `--security-opt seccomp=packages/server/chromium-seccomp.json`. The profile is Docker's default profile plus `clone`, `clone3`, `unshare` and `setns`.
- On a Linux host that restricts user namespaces (such as Ubuntu 24.04), allow them for Playwright's Chromium only, with an AppArmor profile (see [Chromium sandbox on Linux](/guides/export/#chromium-sandbox-on-linux)). Don't lift the restriction for the whole machine.
- If the sandbox can't start, PDF and PNG renders fail. They never run without it. The API client gets a short error, and the details of what to change on the host go to the server log.
- `ASTLIDE_CHROMIUM_SANDBOX=0` turns the sandbox off, and the server prints a warning at startup.
- The seccomp profile applies to the whole container, including the Bun server and each render, so code running there can also create user namespaces. For a stricter setup, run renders in their own container with the profile and the API server in a separate container without it.
