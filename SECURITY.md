# Security Policy

## Supported versions

Astlide is pre-1.0. Only the latest minor release of `@astlide/core` receives fixes.

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
- `@astlide/engine` (layout of built pages for PPTX export)
- The embed element (`@astlide/core/embed`) and its `postMessage` protocol
- `create-astlide` CLI
- The injected slide / index pages and their CSP defaults
- The HTTP render service (`packages/server`) as shipped in the repository

Out of scope:

- Issues caused solely by user-supplied unsafe HTML deliberately injected via `set:html` outside the documented APIs
- Vulnerabilities in upstream Astro / Vite / MDX — please report those upstream
- The `playground/` directory (development-only)

## Hardening already in place

- Default CSP meta tag (`default-src 'self'`, `frame-src` restricted to `youtube-nocookie.com`)
- `noindex, nofollow` injected by default (opt out via `astlide({ indexable: true })`)
- HTML allowlist sanitisation for speaker notes (server + client)
- CSS pattern blocklist on `background` frontmatter (`expression()`, `javascript:` / `vbscript:` URLs, `data:image/svg+xml`, `@import`, `behavior:`)
- KaTeX output sanitisation that preserves SVG/inline-style while stripping scripts and event handlers
