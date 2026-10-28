---
title: Export
description: Export decks to PDF, PNG or PowerPoint.
---

Use `astlide export` when you need a deck as a file: a PDF to send around, a PNG image of each slide, or a PowerPoint file someone can edit.

## Run the export

```bash
bunx astlide export my-talk                 # → exports/my-talk.pdf
bunx astlide export my-talk --pptx          # → exports/my-talk.pptx (editable PowerPoint)
bunx astlide export my-talk --png           # → exports/my-talk-slides/*.png
bunx astlide export --all --pdf --pptx      # every deck, both formats
```

`my-talk` is the deck's folder name under `src/content/decks/`. Without a format flag you get a PDF. PNG files are named `slide-001.png`, `slide-002.png` and so on.

Projects created with `bun create astlide` have the same command as a script: `bun run export my-talk --pptx`.

You can run the command from any folder inside the project. You can also pass the deck as a path, such as `src/content/decks/my-talk` or `dist/my-talk`, and Astlide finds the project from that path.

## PDF and PNG

PDF and PNG are rendered in a headless Chromium through [Playwright](https://playwright.dev). Install it once:

```bash
bunx playwright install chromium
```

You don't need to start a server. `astlide export` builds the site, serves it on a free port while it renders, and stops it afterwards. Astro's [`base`](/guides/deploy/) is applied for you.

Each slide is captured in its final state, with every fragment and code step shown. Mermaid diagrams finish rendering before the capture.

Chromium runs with its sandbox on. On Linux the sandbox needs unprivileged user namespaces, which Ubuntu 24.04 and many containers restrict. When that happens, the export stops and tells you how to allow them for Chromium only. See [Chromium sandbox on Linux](#chromium-sandbox-on-linux).

## PowerPoint (PPTX)

PPTX export doesn't use a browser, so it works without Playwright. Astlide lays out the built slides with its own CSS layout engine and writes them as PowerPoint shapes and text boxes you can edit.

What ends up in the file:

- Text becomes editable text boxes, and tables become PowerPoint tables.
- Boxes, text from CSS `::before` / `::after`, and simple inline SVG (rectangles, circles, lines and arrows, paths, text) become editable shapes.
- Mermaid diagrams are rendered with the project's own `mermaid` package and placed as pictures. SVG that uses anything more, such as gradients or arcs, is placed as a picture too.
- PNG and SVG images are included.
- An `<iframe>` is exported according to what it shows. See [static stand-ins](/guides/layouts-and-components/#static-stand-ins-for-your-own-embeds).
- Speaker notes go into PowerPoint's notes pane.

The fonts your theme loads are embedded in the file, so the slides keep their fonts on a computer that doesn't have them installed. A font whose license forbids embedding is left out, and the export prints a warning. For Japanese and other East Asian text, see [Japanese text in PowerPoint](#japanese-text-in-powerpoint).

## Speaker notes and `dist/`

Every export starts with a build of its own in `node_modules/.astro/astlide-export`. Your `dist/` isn't touched, so exporting never changes what you deploy.

The export build always includes speaker notes, whatever the [`notes` option](/guides/decks/#speaker-notes) says, so they can go into the PPTX. A normal `astro build` leaves them out unless you set `notes: "public"`.

## Options

| Option | |
|---|---|
| `--pdf` `--pptx` `--png` | Formats to export. Combine them as you like. Default: `--pdf` |
| `-a, --all` | Export every deck |
| `--out-dir <dir>` | Folder for the exports. Default: `exports/` |
| `-o, --output <path>` | Exact output path. Only for one deck in one format. For PNG this is a folder |
| `--no-build` | Skip the build and reuse the last export build. Without one, `dist/` is used, which has speaker notes only if it was built with `notes: "public"` |
| `--base-url <url>` | PDF / PNG: render from a dev or preview server you already run. Include the `base`, for example `http://localhost:4321/my-repo` |
| `--width` / `--height` | PDF / PNG: slide size in pixels. Default: 1920×1080 |
| `--cwd <dir>` | Project root, when you run the command from outside the project |

If `astro dev` is already running for the project, pass `--base-url`. Otherwise a PDF or PNG export runs a second build alongside it.

## Japanese text in PowerPoint

When a slide contains Japanese (or other East Asian) text, the PPTX export decides two things:

- **The font PowerPoint shows.** The text is given an East Asian font: the first CJK font your CSS names, such as Noto Sans JP. If the CSS names none, it uses Yu Gothic, which comes with Office.
- **Where lines break.** Text is measured with a Japanese font: the CJK font from your CSS if it was loaded, otherwise Noto Sans JP from Google Fonts. Lines then wrap close to where they do in the browser.

To make the browser, the PDF and the PPTX look the same, load a Japanese web font with the `font` option and add it to your [custom theme](/guides/themes-and-plugins/#custom-theme):

```js
// astro.config.mjs
astlide({
  font: "https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Noto+Sans+JP:wght@400;700&family=JetBrains+Mono&display=swap",
});
```

```css
/* themes/my-theme.css */
[data-theme="my-theme"] {
  --font-body: "Inter", "Noto Sans JP", sans-serif;
  --font-heading: "Inter", "Noto Sans JP", sans-serif;
}
```

Because the theme loads the font, it is embedded in the PPTX. PowerPoint shows it even where Noto Sans JP isn't installed.

## Chromium sandbox on Linux

PDF and PNG export keep Chromium's sandbox on. On Linux the sandbox needs unprivileged user namespaces. Ubuntu 23.10 and later, and other distributions that turn on AppArmor's restriction, only allow them for programs whose AppArmor profile says so.

Don't lift the restriction for the whole machine. Give Playwright's Chromium its own profile instead, the same way Ubuntu does for Google Chrome:

```text title="/etc/apparmor.d/astlide-chromium"
abi <abi/4.0>,
include <tunables/global>

profile astlide-chromium @{HOME}/.cache/ms-playwright/chromium-*/chrome-linux*/chrome flags=(unconfined) {
  userns,

  include if exists <local/astlide-chromium>
}
```

```bash
sudo apparmor_parser -r /etc/apparmor.d/astlide-chromium
```

The path is where `bunx playwright install chromium` puts Chromium. If you set `PLAYWRIGHT_BROWSERS_PATH`, use that folder instead. The profile lets only this one binary create user namespaces, which is all its sandbox needs. Nothing else on the system changes.

In Docker, use the render service's seccomp profile (see [Render service](/guides/server/#security)).

You can also turn the sandbox off with `ASTLIDE_CHROMIUM_SANDBOX=0`. Only do this for decks whose content you trust.

## In-browser PDF (experimental)

Add `"download"` to the [toolbar](/guides/presenting/#toolbar) to get a button that saves the current deck as a PDF. It needs the optional [`@astlide/crispdf`](https://www.npmjs.com/package/@astlide/crispdf) package:

```bash
bun add -D @astlide/crispdf
```

The package hasn't reached 1.0 yet, and its output may change. For stable results, use the CLI.
