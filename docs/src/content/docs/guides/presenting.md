---
title: Presenting
description: Keyboard shortcuts, the presenter window, overview, go-to-slide, pen and laser pointer, and the toolbar.
---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `→` / `Space` | Next step or slide |
| `←` | Previous step or slide |
| `Home` / `↑` | First slide |
| `End` / `↓` | Last slide |
| `o` | Overview — all slides in a grid |
| `g` | Go to slide — type a number or part of a title, `↑`/`↓` to pick, `Enter` to jump |
| `d` | Pen — draw on the slide; `c` clears the current slide's drawing |
| `l` | Laser pointer |
| `v` | Camera bubble |
| `r` | Start / stop recording |
| `p` | Open the presenter window |
| `n` | Notes overlay |
| `s` | Share mode — hide all chrome for screen sharing |
| `f` | Fullscreen |
| `Esc` | Exit pen / laser, fullscreen, close overlays |

On touch devices, swipe left / right to navigate.

## Presenter window

Press `p` to open the presenter window. It shows:

- the current slide, a **live preview of the next slide** and how many **steps remain** on this one;
- speaker notes (font size adjustable with `A−` / `A+` or `Shift+,` / `Shift+.`);
- a timer.

The two windows stay in sync over `BroadcastChannel`: slide changes, [fragment and code steps](/astlide/guides/fragments/), pen strokes and the laser pointer. Drive the talk from the presenter window; the audience window follows.

## Go to slide

`g` opens a dialog listing every slide by number and title. Type a number or part of a title to filter. Titles come from frontmatter `title`, else the slide's first heading.

## Pen & laser pointer

- `d` toggles the **pen**. Strokes are kept per slide while you navigate and come back when you return; `c` clears the current slide.
- `l` toggles the **laser pointer**.
- Both are drawn in slide coordinates, so they line up in every window even when the slides render at different sizes — annotate in the presenter window and it shows on the audience screen.
- Colors: `--astlide-pen-color`, `--astlide-laser-color`.

## Camera & recording

- `v` shows your **webcam** in a round bubble over the slides. Drag it anywhere — the position is remembered — and it keeps playing as you change slides. Resize it with `--astlide-camera-size` (default `220px`).
- `r` **records the talk**: the browser asks which screen, window or tab to capture (it suggests the current tab), the microphone is mixed in, and a red indicator with the elapsed time appears. Press `r` again — or stop sharing from the browser — to download `<deck>-<date>.webm`. Recording continues while you move through the deck.

Turn the camera on first if you want it in the recording. Both need a secure context (`https://` or `localhost`) and your permission; recording relies on the browser's screen-capture support (Chromium-based browsers and Firefox; Safari's support is more limited).

## Toolbar

Compose the floating bottom toolbar from an ordered list of actions. It reveals on hover and keyboard focus, and stays visible on touch devices.

```js
astlide({
  toolbar: ["home", "prev", "counter", "next", "spacer", "notes", "overview", "goto", "draw", "laser", "presenter", "fullscreen", "download"],
});
```

| Action | |
|---|---|
| `home` | Back to the deck index |
| `prev` / `next` / `counter` | Navigation and `n / total` |
| `notes` | Notes overlay |
| `overview` | Overview grid |
| `goto` | Go-to-slide dialog |
| `draw` / `laser` | Pen / laser pointer |
| `camera` / `record` | Camera bubble / recording |
| `presenter` | Open the presenter window |
| `fullscreen` | Toggle fullscreen |
| `print` / `share` | Print mode / share mode |
| `download` | In-browser PDF ([experimental](/astlide/guides/export/)) |
| `spacer` | Flexible gap |

Default: `["prev", "counter", "next"]`.

The toolbar, progress bar and presenter panel read CSS custom properties (`--astlide-nav-bg`, `--astlide-nav-fg`, `--astlide-nav-btn-bg`, `--astlide-progress-color`, `--astlide-presenter-bg`, `--astlide-presenter-fg`, `--astlide-presenter-accent`, …) so themes can restyle them without `!important`.
