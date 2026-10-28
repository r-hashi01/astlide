---
title: Layouts & Components
description: The built-in slide layouts, and the components you can use in MDX slides without importing them.
---

A layout sets how a slide arranges its content. Components handle the pieces Markdown can't express on its own, such as columns, math or a video.

## Layouts

Set a slide's layout with `slideLayout` in its frontmatter. Without it, the slide uses `default`.

| `slideLayout` | What it looks like |
|---|---|
| `default` | A regular content slide. |
| `cover` | Content centered on the slide, for a title or closing slide. |
| `section` | A divider between parts of the talk. |
| `two-column` | `<Left>` and `<Right>` side by side. |
| `image-full` | An image across the whole slide, with the text at the bottom over a dark gradient. Set the image with `background`. |
| `image-left` | An image on the left half, text on the right. |
| `image-right` | An image on the right half, text on the left. |
| `code` | Less padding, to leave room for code. |
| `quote` | A centered quotation. |
| `statement` | One large sentence in the middle of the slide. |

Plugins and PowerPoint templates can add more layouts. See [Themes & Plugins](/guides/themes-and-plugins/) and [PowerPoint templates](/guides/templates/).

### Two columns

Put each column's content in `<Left>` and `<Right>`. Anything outside them, such as the heading here, spans the full width.

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

### Image and text

Write `<ImageSide>` first, then the text in `<TextPanel>`. Use the same order for `image-right`: the layout moves the image to the right.

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

| `<ImageSide>` prop | Description |
|---|---|
| `src` | The image URL. A path starting with `/` gets Astro's `base` added. Required. |
| `alt` | Alternative text. Default `""`. |
| `width` | The image's share of the slide width. Default `50%`. |

### Full-slide image

`image-full` takes its image from `background`. Add `class: text-light` if the text needs to stay readable on a dark image.

```mdx
---
slideLayout: image-full
background: "/images/aurora.jpg"
class: text-light
---
# Northern lights
```

## Components

In `.mdx` slides, you can use the components below without importing them. `.md` and `.html` slides can't use components. Every component also accepts a `class` prop for extra CSS classes.

### `<Columns>`

Lays out its child elements in columns. Unlike the `two-column` layout, it works on any slide and takes any number of columns.

```mdx
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

Leave a blank line inside each `<div>`, as above, so its content is parsed as Markdown.

| Prop | Description |
|---|---|
| `columns` | The number of columns. If you leave it out, each child becomes a column. |
| `gap` | The space between columns, as a CSS length. Default `2rem`. |
| `align` | Vertical alignment: `start`, `center`, `end` or `stretch`. Default `start`. |
| `widths` | Column widths as a CSS grid template, such as `1fr 2fr 1fr` or `300px 1fr`. Overrides `columns`. |

### `<CodeBlock>`

Wrap a code fence in `<CodeBlock>` to give it a header with a file name and a copy button.

````mdx
<CodeBlock title="src/content.config.ts">
```ts
export const collections = { decks };
```
</CodeBlock>
````

| Prop | Description |
|---|---|
| `title` | The text in the header, usually a file name. Optional. |

To highlight lines, see [Code](/guides/code/).

### `<Math>`

Renders a LaTeX formula with KaTeX. Rendering happens at build time, so the page loads no math library.

```mdx
Inline: <Math formula="\frac{x^2}{2}" />

<Math formula="\sum_{i=1}^n i^2 = \frac{n(n+1)(2n+1)}{6}" display />
```

| Prop | Description |
|---|---|
| `formula` | The LaTeX source. Required. |
| `display` | Shows the formula as a centered block instead of inline with the text. |

### `<YouTube>`

Embeds a YouTube video from `youtube-nocookie.com`, YouTube's privacy-enhanced mode.

```mdx
<YouTube id="dQw4w9WgXcQ" start={42} />
```

| Prop | Description |
|---|---|
| `id` | The video ID, or a full `youtube.com` or `youtu.be` URL. Required. If Astlide can't read a video ID from it, nothing is shown and a warning is logged. |
| `start` | Where playback starts, in seconds. |
| `title` | The iframe's accessible title. Default `"YouTube video"`. |

PDF and PPTX exports can't play the video. In its place they show the video's thumbnail with a play button, linked to the video.

#### Static stand-ins for your own embeds

You can do the same for any embed. Add `data-astlide-static` to an element, and it replaces the live embed when the slide is printed or exported. The rest of the time it is hidden.

Put the stand-in in the same parent element as the `<iframe>`, and position it on top. Give it its own `display`, because Astlide only hides it and doesn't set one.

```html
<div class="map" style="position: relative">
  <iframe src="https://maps.example.com/…"></iframe>
  <a href="https://maps.example.com/…" data-astlide-static style="position: absolute; inset: 0; display: block">
    <img src="/images/map.png" alt="" style="width: 100%; height: 100%; object-fit: cover" />
  </a>
</div>
```

An `<iframe>` without a stand-in is exported based on what it shows:

- A page from your own site (`srcdoc`, or a path in the build) is laid out inside the frame, the same way as slides.
- A page from another site becomes a card with its thumbnail and title, linked to the page. This works for YouTube, Vimeo, Figma, CodePen and any page with oEmbed or Open Graph data. Astlide fetches this information when you export and caches it. If it can't be fetched, for example when you're offline, the card shows only the page's name.

### `<Tweet>`

Shows a post from X (Twitter) as a styled card. You pass in the post's content as props, so the page makes no requests to X. Clicking the card opens the post in a new tab.

```mdx
<Tweet
  url="https://x.com/astrodotbuild/status/1234567890"
  text="Astro 5.0 is here! 🚀"
  author="Astro"
  handle="@astrodotbuild"
  date="Dec 3, 2024"
/>
```

| Prop | Description |
|---|---|
| `url` | The post's URL. Only `http` and `https` links are used. Required. |
| `text` | The post's text. `\n` starts a new line. Required. |
| `author` | The display name. Required. |
| `handle` | The account handle, with or without `@`. Required. |
| `date` | The date to show, as you want it written. Optional. |
| `avatar` | The URL of the profile image. Optional. |

### `<Fragment>`, `<Fragments>`, `<SpeakerNotes>`

`<Fragment>` and `<Fragments>` reveal content step by step. See [Fragments](/guides/fragments/).

`<SpeakerNotes>` holds notes that only you see while presenting. `<Notes>` is an older name for the same component. See [Speaker notes](/guides/decks/#speaker-notes).
