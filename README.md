# Astlide

A multi-deck slide presentation framework built on Astro.

## Features

- **Viewport scaling** — slides auto-scale to any screen/window size
- **MDX slides** — write in Markdown with JSX components
- **Fragment reveals** — step-by-step content with `<Fragment>`
- **Overview mode** — press `o` to see all slides in a grid
- **Presenter mode** — press `p` to open speaker notes in a separate window
- **Notes overlay** — press `n` to show notes in the main window
- **Touch / swipe** — swipe to navigate on mobile
- **Theme system** — 6 built-in themes + full CSS variable control
- **PDF / PNG export** — Playwright + pdf-lib, proper multi-page merging
- **Type-safe** — Content Collections with Zod schema

## Quick Start

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/astlide.git
cd astlide
npm install
npm run dev
# Open http://localhost:4321
```

## Creating a Deck

1. Create a directory in `src/content/decks/my-presentation/`

2. Add `_config.json`:

```json
{
  "title": "My Presentation",
  "author": "Your Name",
  "date": "2024-01-15",
  "theme": "default"
}
```

3. Add slides as numbered MDX files:

```
my-presentation/
├── _config.json
├── 01-cover.mdx
├── 02-intro.mdx
└── 03-end.mdx
```

## Slide Frontmatter

> **Important:** Use `slideLayout` (not `layout`) — Astro MDX reserves the `layout` key.

```yaml
---
slideLayout: default   # see Layouts below
transition: fade       # none | fade | slide-left | slide-right | slide-up | zoom
background: "#1e293b"  # hex, gradient string, or image URL
class: "text-light"    # extra CSS classes on the slide element
notes: "Speaker notes shown in presenter/notes mode"
hidden: false          # set true to skip slide in production builds
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
| `image-left` | Image on left, text on right via `<ImageSide>` / `<TextPanel>` |
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

## Fragments (Step-by-Step Reveals)

Use `<Fragment>` to reveal content one step at a time:

```mdx
<Fragment index={1}>First point appears</Fragment>

<Fragment index={2}>Second point appears</Fragment>

<Fragment index={3} effect="zoom">Third — zoom effect</Fragment>

<Fragment index={4} effect="highlight">Fourth — highlighted</Fragment>
```

Effects: `fade` (default) | `slide-up` | `zoom` | `highlight`

## Themes

Built-in: `default`, `dark`, `minimal`, `corporate`, `gradient`, `rose`, `forest`

Set in `_config.json`:

```json
{ "theme": "dark" }
```

### Custom Theme

Add a selector in `src/styles/themes/default.css`:

```css
[data-theme="my-theme"] {
  --color-background: #fef3c7;
  --color-foreground: #78350f;
  --color-primary: #d97706;
}
```

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

Make sure the dev/preview server is running, then:

```bash
# Export a deck to PDF
npm run export -- --deck my-presentation

# Export all decks
npm run export -- --all

# Export as PNG images
npm run export -- --deck my-presentation --format png

# Custom output path
npm run export -- --deck my-presentation --output ./exports/slides.pdf

# Point at a custom server
npm run export -- --deck my-presentation --base-url http://localhost:4321
```

## Project Structure

```
astlide/
├── src/
│   ├── content/
│   │   ├── config.ts              # Slide schema (Zod)
│   │   └── decks/                 # Your presentations
│   │       └── my-deck/
│   │           ├── _config.json
│   │           └── 01-slide.mdx
│   ├── components/
│   │   ├── Slide.astro            # Base slide
│   │   ├── Fragment.astro         # Step-by-step reveals
│   │   └── layouts/
│   │       ├── Left.astro
│   │       ├── Right.astro
│   │       ├── ImageSide.astro
│   │       └── TextPanel.astro
│   ├── layouts/
│   │   └── DeckLayout.astro       # Viewport scaling, nav, overlays
│   ├── pages/
│   │   ├── index.astro            # Deck listing
│   │   └── [deck]/[...slide].astro
│   └── styles/
│       ├── base.css
│       └── themes/default.css
├── scripts/
│   └── export-pdf.ts
└── package.json
```

## License

MIT
