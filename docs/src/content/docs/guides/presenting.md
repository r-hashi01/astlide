---
title: Presenting
description: Keyboard shortcuts, the presenter window, overview, go-to-slide, pen and laser pointer, and the toolbar.
---

Everything on this page works the same in `astro dev` and on a deployed deck, except where noted.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `→` / `Space` | Next step or slide |
| `←` | Previous step or slide |
| `Home` / `↑` | First slide |
| `End` / `↓` | Last slide |
| `o` | Overview: all slides in a grid |
| `g` | Go to slide: type a number or part of a title, pick with `↑`/`↓`, jump with `Enter` |
| `d` | Pen: draw on the slide. While it's on, `c` clears the current slide and `Shift+C` the whole deck |
| `l` | Laser pointer |
| `v` | Camera bubble |
| `r` | Start / stop recording |
| `p` | Open the presenter window |
| `n` | Notes overlay |
| `s` | Share mode: hides the toolbar, progress bar and notes so only the slide shows when you share your screen |
| `f` | Fullscreen |
| `Esc` | Turn off the pen or laser, leave fullscreen, close an overlay |
| `e` | Edit the slide's source in the browser (`astro dev` only, see [Creating a Deck](/guides/decks/#editing-in-the-browser)) |

`o`, `p`, `n`, `s`, `f` and `e` work in the audience window only. The other keys work in both windows.

On a touch device, swipe left or right to change slides.

## Presenter window

Press `p` to open the presenter window. Run the talk from there: the audience window follows every slide change, [fragment and code step](/guides/fragments/), pen stroke and laser movement. The two windows talk over `BroadcastChannel`, so they must be in the same browser.

The presenter window shows:

- the current slide;
- a live preview of the next slide, with the number of steps left on the current one;
- your speaker notes. Change their font size with the `A−` / `A+` buttons or `Shift+,` / `Shift+.`;
- a timer. Click ▶ to start or pause it and ↺ to reset it.

Speaker notes are left out of `astro build` by default, so a deployed deck has none. To present from the deployed site with notes, set `astlide({ notes: "public" })`. Anyone with the URL can then read them. See [Speaker notes](/guides/decks/#speaker-notes).

## Go to slide

Press `g` to open a list of every slide with its number and title. Type a number or part of a title to filter it. A slide's title is its frontmatter `title`, or its first heading when there is none.

## Pen & laser pointer

- `d` turns the **pen** on and off. Each slide keeps its own drawing, so it's still there when you come back. With the pen on, `c` clears the current slide and `Shift+C` clears every slide in the deck.
- `l` turns the **laser pointer** on and off.
- Both are positioned in slide coordinates. They line up in every window even when the slide is drawn at a different size, so you can draw in the presenter window and the audience sees it in the same place.
- Set their colors with `--astlide-pen-color` and `--astlide-laser-color`.

### Keeping drawings

By default, drawings stay until you reload the page or close the tab. To keep them across reloads, and for the next time you open the deck in the same browser, turn on persistence:

```js
astlide({ drawings: { persist: true } });
```

Drawings are then saved per deck in `localStorage`. To delete them, turn the pen on and press `Shift+C`.

## Camera & recording

- `v` shows your **webcam** in a round bubble over the slides. Drag it wherever you like and it stays there next time. It keeps playing when you change slides. Set its size with `--astlide-camera-size` (default `220px`).
- `r` **records the talk**. The browser asks which screen, window or tab to capture and suggests the current tab. Your microphone is recorded too, and a red dot with the elapsed time shows while recording. Changing slides doesn't stop it. Press `r` again, or stop sharing in the browser, to download `<deck>-<date>.webm`.

If you want your camera in the recording, turn it on before you start recording. Both features ask for permission and only work over `https://` or on `localhost`. Recording uses the browser's screen capture: it works in Chromium-based browsers and Firefox, and support in Safari is limited.

## Toolbar

The toolbar floats at the bottom of the slide. List the buttons you want, in order:

```js
astlide({
  toolbar: ["home", "prev", "counter", "next", "spacer", "notes", "overview", "goto", "draw", "laser", "presenter", "fullscreen", "download"],
});
```

| Action | |
|---|---|
| `home` | Back to the deck index |
| `prev` / `next` / `counter` | Previous / next slide, and the `n / total` counter |
| `notes` | Notes overlay |
| `overview` | Overview grid |
| `goto` | Go-to-slide dialog |
| `draw` / `laser` | Pen / laser pointer |
| `camera` / `record` | Camera bubble / recording |
| `presenter` | Open the presenter window |
| `fullscreen` | Toggle fullscreen |
| `print` / `share` | Print mode / share mode |
| `download` | In-browser PDF ([experimental](/guides/export/)) |
| `spacer` | Flexible gap that pushes the following buttons to the right |

The default is `["prev", "counter", "next"]`. The toolbar appears when you hover over it or move keyboard focus to it. On touch devices it's always visible.

The toolbar, progress bar and presenter window take their colors from CSS custom properties such as `--astlide-nav-bg`, `--astlide-nav-fg`, `--astlide-nav-btn-bg`, `--astlide-progress-color`, `--astlide-presenter-bg`, `--astlide-presenter-fg` and `--astlide-presenter-accent`. A theme can set these without `!important`.
