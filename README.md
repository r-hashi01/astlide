# Astlide

A multi-deck slide presentation framework built on Astro.

## Features

- **Multi-deck support** – Manage multiple presentations in one repository
- **MDX slides** – Write slides in Markdown with JSX components
- **Theme system** – Customizable design with CSS variables
- **PDF export** – Generate PDFs with Playwright
- **Keyboard navigation** – Arrow keys, fullscreen, presenter mode
- **Type-safe** – Content Collections with Zod schema

## Quick Start

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/astlide.git
cd astlide

# Install dependencies
npm install

# Start dev server
npm run dev

# Open http://localhost:4321
```

## Creating a Deck

1. Create a new directory in `src/content/decks/`:

```bash
mkdir src/content/decks/my-presentation
```

2. Add a deck configuration `_config.json`:

```json
{
  "title": "My Presentation",
  "author": "Your Name",
  "date": "2024-01-15",
  "theme": "default"
}
```

3. Add slides as MDX files with numeric prefixes:

```
my-presentation/
├── _config.json
├── 01-cover.mdx
├── 02-intro.mdx
├── 03-content.mdx
└── 04-end.mdx
```

## Slide Frontmatter

```yaml
---
layout: default | cover | section | two-column | image-full | code | quote
transition: none | fade | slide-left | slide-right | slide-up | zoom
background: "#hex" | "url(/path/to/image.jpg)"
class: "custom-class"
notes: "Speaker notes"
hidden: false
---
```

## Layouts

### Default
Standard content slide.

### Cover
Centered title slide for opening/closing.

### Two Column
Split layout with `<Left>` and `<Right>` slots:

```mdx
---
layout: two-column
---

# Comparison

<Left>
### Option A
Content for left side
</Left>

<Right>
### Option B
Content for right side
</Right>
```

### Code
Optimized for code blocks with syntax highlighting.

### Quote
Styled blockquote with attribution.

## Themes

Built-in themes: `default`, `dark`, `minimal`, `corporate`

Set in `_config.json`:

```json
{
  "theme": "dark"
}
```

### Custom Themes

Create a CSS file in `src/styles/themes/` and override CSS variables:

```css
[data-theme="my-theme"] {
  --color-background: #fef3c7;
  --color-foreground: #78350f;
  --color-primary: #d97706;
}
```

## PDF Export

```bash
# Export specific deck
npm run export -- --deck my-presentation

# Export all decks
npm run export -- --all

# Custom output path
npm run export -- --deck my-presentation --output ./exports/slides.pdf
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `→` / `Space` | Next slide |
| `←` | Previous slide |
| `f` | Toggle fullscreen |
| `Esc` | Exit fullscreen |

## Project Structure

```
astlide/
├── src/
│   ├── content/
│   │   ├── config.ts         # Slide schema
│   │   └── decks/            # Your presentations
│   ├── components/
│   │   ├── Slide.astro       # Base slide component
│   │   └── layouts/          # Layout components
│   ├── layouts/
│   │   └── DeckLayout.astro  # Deck wrapper
│   ├── pages/
│   │   ├── index.astro       # Deck listing
│   │   └── [deck]/[...slide].astro
│   └── styles/
│       ├── base.css
│       └── themes/
├── scripts/
│   └── export-pdf.ts
└── package.json
```

## License

MIT
