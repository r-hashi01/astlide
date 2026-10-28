---
title: Creating a Deck
description: Set up a deck folder with _config.json, write slides in .mdx, .md or .html, and use frontmatter, speaker notes, the in-browser editor and hidden slides.
---

A deck is a folder under `src/content/decks/`. It holds a `_config.json` file and one file per slide. The folder name becomes the deck's URL: the deck in `src/content/decks/my-talk/` is served at `/my-talk/`.

## Scaffold with the CLI

Run this in your project's root folder:

```bash
bunx create-astlide deck my-talk --theme dark --format mdx   # or md | html
```

It creates `src/content/decks/my-talk/` with a `_config.json` and three starter slides. If you leave out `--format`, it asks which format to use.

## Create it by hand

1. Add `src/content/decks/my-talk/_config.json`:

   ```json
   {
     "title": "My Talk",
     "author": "Your Name",
     "date": "2025-01-15",
     "theme": "default"
   }
   ```

   Every field is optional. Without `title`, the folder name is used. `theme` defaults to `default`; see [Themes & Plugins](/guides/themes-and-plugins/) for the others.

2. Add slides as numbered files. You can mix `.mdx`, `.md` and `.html` in one deck:

   ```
   src/content/decks/my-talk/
   ├── _config.json
   ├── 01-cover.mdx
   ├── 02-intro.md
   └── 03-demo.html
   ```

Slides are sorted by file name, and the slide number in the URL (`/my-talk/2`) follows that order. Names are compared as text, so pad the numbers to the same width: `02` sorts before `10`, but `2` would sort after it.

A deck folder can also hold a `.pptx` file, which is shown as slides as it is. See [Import PowerPoint & Google Slides](/guides/import/).

## Slide formats

- **`.mdx`**: Markdown with components such as `<Fragment>`, `<Columns>` and `<SpeakerNotes>`. You can use Astlide's components without importing them.
- **`.md`**: plain Markdown. Code highlighting and diagrams work here too.
- **`.html`**: one slide written in HTML. Astlide renders the body as it is, including inline `<style>` and any markup, and trusts it as much as an MDX slide. This is useful for pasting in HTML you wrote by hand or got from an AI tool.

An `.html` slide takes the same frontmatter as the other formats:

```html
---
slideLayout: cover
background: "#0b132b"
---
<style>.hero { font-size: 3rem; }</style>
<h1 class="hero">Everything in one HTML file</h1>
```

## Frontmatter

Set per-slide options at the top of the file:

```yaml
---
slideLayout: default
transition: fade
title: "Optional — used by the go-to-slide dialog"
background: "#1e293b"
class: "text-light"
notes: "Speaker notes shown in presenter / notes mode"
hidden: false
---
```

:::caution
Write **`slideLayout`** to pick a layout. Astro's MDX pipeline reserves the `layout` key, so it won't work.
:::

The [frontmatter reference](/reference/frontmatter/) lists every field. [Layouts](/guides/layouts-and-components/) lists the built-in values for `slideLayout`.

## Speaker notes

The audience never sees speaker notes. You see them in the presenter window (`p`) and the notes overlay (`n`). There are three ways to write them:

- **`<SpeakerNotes>`** in an `.mdx` slide. You can use any Markdown inside:

  ```mdx
  # My Slide

  Content here.

  <SpeakerNotes>
  Key points to mention:
  - **First** important thing
  - Second point with `code`
  </SpeakerNotes>
  ```

- **An HTML comment at the end of the slide**, as in Slidev and Marp. This works in `.md`, `.mdx` and `.html` slides, and the comment can contain Markdown:

  ```md
  # My Slide

  Content here.

  <!--
  Key points to mention:
  - **First** important thing
  -->
  ```

  Only the comment that *ends* the slide becomes notes. Comments anywhere else stay ordinary comments. In `.mdx`, that last comment is the only HTML comment allowed; write other comments as `{/* … */}`.

- **`notes: "…"` in the frontmatter**, for a single short line.

If a slide has notes in more than one place, Astlide uses `<SpeakerNotes>` first, then the frontmatter `notes`, then the trailing comment. The older name `<Notes>` still works the same as `<SpeakerNotes>`.

:::note[Notes are left out of the deployed site]
With the default setting, `notes: "dev"`, notes are included in two places: pages served by `astro dev`, and the build that `astlide export` makes. That keeps them in your PowerPoint exports. Pages you build with `astro build` and deploy don't include them, and the deployed presenter window says the notes aren't published. `astlide export` builds into its own folder (`node_modules/.astro/astlide-export`), so its notes never end up in `dist/`.

If you want to present from the deployed site with your notes, include them in every page:

```ts
astlide({ notes: "public" })
```

Anyone who can open the deck can then read the notes, through `n`, `?presenter` or the page source.
:::

## Editing in the browser

While `astro dev` is running, you can edit a slide's source file next to the slide.

### Turn on editing in your browser

You need to do this once per browser. When `astro dev` starts, it prints a link:

```
[astlide] Slide editor: open http://localhost:4321/__astlide/editor?code=… in your browser to enable editing (works once, for 30 minutes)
```

Open the link in the browser you'll edit in. The code in it works once and expires after 30 minutes, and each start of `astro dev` prints a new one. Don't share this link.

After that, the browser stays enabled for this project and port, even when you restart the dev server. The browser keeps a cookie derived from a secret stored in `node_modules/.astro/astlide-editor-secret`. To turn editing off in every browser, delete that file. A browser that isn't enabled yet shows that editing is off in the panel.

### Edit a slide

Press <kbd>e</kbd> on a slide. A panel opens next to it with the slide's source file, and you can start typing.

- Changes are saved shortly after you stop typing. Press <kbd>Cmd</kbd>/<kbd>Ctrl</kbd>+<kbd>S</kbd> to save right away.
- The slide updates without reloading the page. Only the parts you changed are replaced, so nothing flickers. Your cursor, the current [fragment](/guides/fragments/) step, rendered diagrams, the camera and a running recording all stay as they are.
- Speaker notes update the same way, whether they're in frontmatter `notes` or `<Notes>`. The notes overlay and every other window on the same slide, such as the presenter window, update in place.
- The panel stays open when you move to another slide and switches to that slide's file.
- <kbd>Esc</kbd> or ✕ saves and closes the panel.

Adding, removing or renaming slide files also shows up right away. Every window on the deck updates its slide count and outline, and stays on the same slide and step, although the slide's number may change. If the file of the slide on screen was removed, the window shows whichever slide now has that number.

### Limits

- The editor exists only on the dev server. Production builds don't include it or its endpoint.
- It edits slide files that already exist in `src/content/decks/` (`.mdx`, `.md`, `.html`). It can't create files or edit anything else.
- It only works on the machine running the dev server, with the deck opened at `localhost` or `127.0.0.1`. With `astro dev --host`, or through a tunnel or reverse proxy such as ngrok, cloudflared or port forwarding, others can still view the slides, but the editor won't load or save there.
- Saving also requires a browser enabled through the printed link, which only appears in your terminal. A raw port forward (`ssh -R`) looks like a local browser to the dev server, but it still can't save anything without that link.
- Scripts in Markdown, HTML and PowerPoint slides (`<script>`, attributes like `onclick`, `javascript:` links) are removed when the slide is rendered, in `astro dev` too. A slide someone else wrote can't control the editor, or anything else, in your browser. MDX slides keep their scripts. Set [`slideScripts: true`](/reference/configuration/) only for decks whose content you fully trust.
- Edits are written to disk as you type. To roll back, use undo in the panel or your version control.

## Hidden slides

Add `hidden: true` to a slide's frontmatter to drop it from the deployed deck while keeping the file.

- In `astro dev`, the slide is shown as usual.
- In a production build, it is skipped everywhere you navigate: <kbd>←</kbd> / <kbd>→</kbd>, <kbd>Home</kbd> / <kbd>End</kbd>, the toolbar, the next-slide preview in the presenter window, the overview and the go-to dialog. A direct link to it redirects to the next visible slide.
- The print view (`/<deck>/all`) and PDF / PowerPoint exports always leave it out, in development too.
