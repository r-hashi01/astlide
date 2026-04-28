# Astlide

[![CI](https://github.com/r-hashi01/astlide/actions/workflows/ci.yml/badge.svg)](https://github.com/r-hashi01/astlide/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@astlide/core.svg)](https://www.npmjs.com/package/@astlide/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/runtime-Bun-fbf0df.svg)](https://bun.sh)

An Astro-based slide presentation framework — like Slidev, but for the Astro ecosystem.

## Features

- **MDX slides** — write in Markdown with JSX components
- **Viewport scaling** — slides auto-scale to any screen/window size (1920×1080)
- **7 built-in themes** — default, dark, minimal, corporate, gradient, rose, forest
- **Fragment reveals** — step-by-step content with `<Fragment>`
- **Presenter mode** — speaker notes + timer in a separate window, synced via BroadcastChannel
- **Overview mode** — press `o` to see all slides in a grid
- **PDF / PNG export** — Playwright + pdf-lib with CLI options
- **Type-safe** — Content Collections with Zod schema
- **Touch / swipe** — navigate on mobile

## Quick Start

```bash
# Scaffold a new project
bun create astlide my-slides
cd my-slides
bun install
bun run dev
```

Or add to an existing Astro project:

```bash
bun add @astlide/core
```

Then configure:

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import astlide from '@astlide/core';

export default defineConfig({
  integrations: [astlide()],
});
```

```ts
// src/content.config.ts
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { slideSchema } from '@astlide/core/schema';

const decks = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: 'src/content/decks' }),
  schema: slideSchema,
});

export const collections = { decks };
```

## Creating a Deck

1. Create `src/content/decks/my-talk/_config.json`:

```json
{
  "title": "My Talk",
  "author": "Your Name",
  "date": "2025-01-15",
  "theme": "default"
}
```

2. Add slides as numbered MDX files:

```
src/content/decks/my-talk/
├── _config.json
├── 01-cover.mdx
├── 02-intro.mdx
└── 03-end.mdx
```

## Slide Frontmatter

> **Important:** Use `slideLayout` (not `layout`) — Astro MDX reserves the `layout` key.

```yaml
---
slideLayout: default
transition: fade
background: "#1e293b"
class: "text-light"
notes: "Speaker notes shown in presenter/notes mode"
hidden: false
---
```

## Layouts

| `slideLayout` | Description |
|---|---|
| `default` | Standard content slide |
| `cover` | Centred title / closing slide |
| `section` | Chapter divider |
| `two-column` | Side-by-side with `<Left>` / `<Right>` |
| `image-full` | Background image with text overlay |
| `image-left` | Image on left, text on right |
| `image-right` | Image on right, text on left |
| `code` | Optimised padding for code blocks |
| `quote` | Centred blockquote |
| `statement` | Single large sentence |

### Two-column example

```mdx
---
slideLayout: two-column
---
# Comparison
<Left>
### Before
Old approach
</Left>
<Right>
### After
New approach
</Right>
```

### Multi-column example

```mdx
---
slideLayout: default
---
# Comparison

<Columns columns={3} gap="1.5rem">
<div>

### Option A
First option details.

</div>
<div>

### Option B
Second option details.

</div>
<div>

### Option C
Third option details.

</div>
</Columns>
```

Props: `columns` (number) | `gap` (CSS value) | `align` ("start" | "center" | "end" | "stretch") | `widths` (e.g., "1fr 2fr 1fr")

### Image-left example

```mdx
---
slideLayout: image-left
---
<ImageSide src="/photo.jpg" alt="Photo" />
<TextPanel>
## Caption
Description text here.
</TextPanel>
```

## Fragments

Use `<Fragment>` for step-by-step reveals:

```mdx
<Fragment index={1}>First point</Fragment>
<Fragment index={2}>Second point</Fragment>
<Fragment index={3} effect="zoom">Third — zoom effect</Fragment>
<Fragment index={4} effect="highlight">Fourth — highlighted</Fragment>
```

Effects: `fade` (default) | `slide-up` | `zoom` | `highlight`

## Speaker Notes

Use the `<Notes>` component for rich presenter notes with full Markdown support:

```mdx
---
slideLayout: default
---
# My Slide

Content here.

<Notes>
Key points to mention:
- **First** important thing
- Second point with `code`
</Notes>
```

Notes are displayed in presenter mode (`p`) and the notes overlay (`n`). If both frontmatter `notes` and the `<Notes>` component exist, the component takes priority.

## Themes

Built-in: `default`, `dark`, `minimal`, `corporate`, `gradient`, `rose`, `forest`

Set in `_config.json`:

```json
{ "theme": "gradient" }
```

### Custom Theme

Create a CSS file with `[data-theme="my-theme"]` selector targeting the CSS custom properties:

```css
/* my-theme.css */
[data-theme="my-theme"] {
  --color-background: #fef3c7;
  --color-foreground: #78350f;
  --color-primary: #d97706;
  --color-secondary: #92400e;
  --color-accent: #fbbf24;
  --color-muted: #fde68a;
  --code-background: #451a03;
}
```

Register it through the Plugin API (next section), then set `"theme": "my-theme"` in your deck's `_config.json`.

## Plugin API

Plugins extend Astlide with custom themes, layout names, transition names, and Shiki languages/themes.

```ts
// astro.config.mjs
import { defineConfig } from 'astro/config';
import astlide from '@astlide/core';
import { defineAstlidePlugin } from '@astlide/core/plugin';

const myPlugin = defineAstlidePlugin({
  name: 'astlide-plugin-midnight',
  themes: [
    { name: 'midnight', cssEntrypoint: './themes/midnight.css' },
  ],
  layouts: [{ name: 'split-quote' }],
  transitions: [{ name: 'iris' }],
  shiki: {
    langs: [/* additional Shiki langs */],
    themes: [{ name: 'neon-night', /* shiki theme JSON */ }],
  },
});

export default defineConfig({
  integrations: [astlide({ plugins: [myPlugin] })],
});
```

`cssEntrypoint` is resolved as a Vite import — use any module specifier that resolves to a CSS file (relative path, npm package, etc.). Built-in themes are registered as a synthetic plugin so the resolution path is unified.

### Distributing a plugin on npm

Convention for community plugins:

| Field | Value |
|---|---|
| Package name | `astlide-plugin-*` or `@scope/astlide-plugin-*` |
| `keywords` | must include `"astlide-plugin"` |
| `peerDependencies` | `{ "@astlide/core": "^x.y" }` |
| Default export | `defineAstlidePlugin({ ... })` |

Layout / transition contributions in v1 register the **name** only. The class is applied on the slide element so any plugin-shipped CSS can target it (e.g. `.slide.slide-split-quote { ... }`, `[data-slide-transition="iris"] { ... }`). Component-driven layouts and JS-driven transitions are deferred to v2.

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `→` / `Space` | Next slide (or next fragment) |
| `←` | Previous slide (or previous fragment) |
| `Home` / `↑` | First slide |
| `End` / `↓` | Last slide |
| `o` | Overview mode |
| `p` | Open presenter window |
| `n` | Toggle notes overlay |
| `f` | Toggle fullscreen |
| `Esc` | Exit fullscreen / close overlays |

## PDF / PNG Export

Requires `playwright` and `pdf-lib` (optional dependencies). Start the dev server, then:

```bash
# Export a deck to PDF
bun run astlide-export --deck my-talk

# Export all decks
bun run astlide-export --all

# Export as PNG images
bun run astlide-export --deck my-talk --format png

# Custom viewport size
bun run astlide-export --deck my-talk --width 1280 --height 720

# Custom server URL
bun run astlide-export --deck my-talk --base-url http://localhost:3000
```

## Project Structure

```
packages/
├── astlide/              # @astlide/core — Astro Integration
│   ├── src/
│   │   ├── index.ts      # Integration entry (injectRoute, config)
│   │   ├── schema.ts     # Zod schema (slideSchema)
│   │   ├── components/   # Slide, Fragment, Notes, Columns, Left, Right, ImageSide, TextPanel
│   │   ├── internal/     # DeckLayout, injected pages
│   │   ├── styles/       # base.css + themes/
│   │   └── cli/          # export-pdf.ts
│   └── package.json
└── create-astlide/       # CLI scaffolder (bun create astlide)
    ├── src/index.ts
    └── template/
```

## Development

```bash
bun install        # Install all workspace dependencies
bun run dev        # Start playground dev server
bun run build      # Build playground
bun run lint       # Run Biome linter
bun run lint:fix   # Auto-fix lint issues
bun run format     # Format with Biome
```

## License

MIT
