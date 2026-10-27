# Security Policy

## Supported versions

Only the latest minor release of `@astlide/core` (and the latest `create-astlide` / `astlide`) receives fixes.

| Package | Supported |
|---|---|
| `@astlide/core` latest minor | ✅ |
| Older versions | ❌ |

## Reporting an issue

Please report any potential issue privately rather than opening a public GitHub issue.

Use one of the following channels:

- **GitHub private advisories** — preferred. Open a draft advisory at:
  <https://github.com/r-hashi01/astlide/security/advisories/new>
- **Email** — [hello@astlide.dev](mailto:hello@astlide.dev)

Please include:

- Affected package and version
- A minimal reproduction (MDX + config snippet, or the `.pptx` / request that triggers it)
- Impact assessment (what an attacker can achieve)
- Any proof-of-concept you have

## What to expect

- Acknowledgement within 5 business days.
- Status update within 14 days.
- A coordinated fix and advisory once a patch is ready. Reporters are credited unless they request otherwise.

## Scope

In scope:

- `@astlide/core` integration code, schema, components, and utilities (e.g. `sanitizeHTML`, `sanitizeBackground`, `sanitizeKaTeXOutput`)
- PowerPoint import and templates (`@astlide/core/pptx`): parsing untrusted `.pptx` / `.potx` / `.thmx` files
- The `astlide` CLI (`export`, `import`, `mcp`) and the MCP server (`@astlide/core/mcp`)
- The layout engine (`@astlide/core/engine`; formerly `@astlide/engine`): layout of built pages for PPTX export and `check_deck`
- The `astlide` package (the `astlide` command for use without a project install)
- The embed element (`@astlide/core/embed`) and its `postMessage` protocol
- `create-astlide` CLI
- The injected slide / index pages and their CSP defaults
- The HTTP render service (`packages/server`) as shipped in the repository

Out of scope:

- Issues caused solely by user-supplied unsafe HTML deliberately injected via `set:html` outside the documented APIs
- Vulnerabilities in upstream Astro / Vite / MDX — please report those upstream
- The `playground/` directory (development-only)

## Hardening already in place

- **Built pages:** a default CSP whose `script-src` allows inline scripts by hash only (no `'unsafe-inline'`); inline scripts, event handlers and `javascript:` URLs in Markdown / HTML / PowerPoint slides are removed — parsed as browsers parse them — unless `slideScripts: true`
- **Speaker notes:** left out of production builds by default (`notes: "dev"`); allowlist sanitisation where they are shown
- **Untrusted PowerPoint files:** bounded ZIP / XML reading, sanitised font names and colors, SVG pictures inlined (never served from the site), assets checked by their content
- **Dev slide editor:** local requests only, enabled per browser through a one-time link printed by `astro dev`, edits existing slide files only
- **Exports and the render service:** remote fetches checked against private / loopback / metadata addresses at connect time; Chromium sandboxed; size, count and time limits
- **MCP server:** works only on projects inside the folders the client or `--root` allows; child processes get no secrets
- **Releases:** published from CI only, with npm provenance, after a maintainer's approval
- `noindex, nofollow` injected by default (opt out via `astlide({ indexable: true })`); CSS pattern blocklist on `background` frontmatter; KaTeX output sanitisation
