# @astlide/vue

## 3.1.0

### Patch Changes

- [#325](https://github.com/r-hashi01/astlide/pull/325) [`a790f15`](https://github.com/r-hashi01/astlide/commit/a790f1540852d8f8a769637ff5cff894fda932d2) Thanks [@r-hashi01](https://github.com/r-hashi01)! - `@astlide/core/runtime/page` exports `slideUrl()`, `slideNeighbours()` and `noNotesText()`: a slide page's URL, its previous / next / first / last slides and the "no notes" text, computed one way for Astro, React, Vue, Next, Nuxt and the runtime. Astro slide pages now encode the deck name in their toolbar and presenter links, as the runtime already did.

- [#381](https://github.com/r-hashi01/astlide/pull/381) [`ac07bef`](https://github.com/r-hashi01/astlide/commit/ac07beff592926113a0f4b2d791f6cd46c669219) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Next.js and Nuxt: the toolbar's PDF download works, and with a base path or trailing slashes it captures the right print view. In Next.js, a deck whose name has a `%` no longer breaks the build. Nuxt has a `trailingSlash` option.

- [#326](https://github.com/r-hashi01/astlide/pull/326) [`90645a8`](https://github.com/r-hashi01/astlide/commit/90645a845801d98d2566fadaa26d9e7214a0a174) Thanks [@r-hashi01](https://github.com/r-hashi01)! - `@astlide/core/runtime/deck-page` exports `mountDeckPage()` and `setUpDeckPageTools()`: what a framework's slide page does around the runtime (page flags, the `<body>` data exporters read, diagrams, media buttons, camera, recording and PDF download). `@astlide/react` and `@astlide/vue` use them instead of their own copies. Vue's `DeckPage` now mounts again when `loadMermaid` changes, as React's does, so diagrams draw when the loader is set after mounting.

- [#324](https://github.com/r-hashi01/astlide/pull/324) [`adbe580`](https://github.com/r-hashi01/astlide/commit/adbe580ddf9d5dc7ecdf2ea5b1130ecb2c27efd5) Thanks [@r-hashi01](https://github.com/r-hashi01)! - `@astlide/core/runtime/chrome` exports `TOOLBAR_ACTIONS` (and its `ToolbarAction` type): the toolbar's action buttons with their labels, tooltips and glyphs. `@astlide/react` and `@astlide/vue` render their toolbars from it instead of their own copies; the markup is unchanged.

- [#336](https://github.com/r-hashi01/astlide/pull/336) [`ca69eb4`](https://github.com/r-hashi01/astlide/commit/ca69eb44d4674f3f9fa5f897cfef747483e9c0fc) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Toolbar icons are SVGs drawn in the button's color, the same on every OS, instead of emoji and text symbols. A theme replaces one with `--astlide-icon-<name>` (`--astlide-icon-notes`, …).
- Updated dependencies [[`fea6a5d`](https://github.com/r-hashi01/astlide/commit/fea6a5dbee45b4961376196afaf4379e46c826a1), [`edac338`](https://github.com/r-hashi01/astlide/commit/edac3380cec064a032b3f0f8408a5f5a0138be1a), [`930cbce`](https://github.com/r-hashi01/astlide/commit/930cbcecfa0b3504e5991d7ee0fd2d8f2c598dfc), [`91c5b77`](https://github.com/r-hashi01/astlide/commit/91c5b77060728969cc9107eb64bfb1b0d339fff6), [`a790f15`](https://github.com/r-hashi01/astlide/commit/a790f1540852d8f8a769637ff5cff894fda932d2), [`1ef9218`](https://github.com/r-hashi01/astlide/commit/1ef9218657bdb7656d2d0efdd16b905f5457ca11), [`5320952`](https://github.com/r-hashi01/astlide/commit/5320952815bbd3e6db4117e0020da4bc3c9c76cf), [`5990c26`](https://github.com/r-hashi01/astlide/commit/5990c26990a627d38d653ed18d75528b6b9306ce), [`d8e83c5`](https://github.com/r-hashi01/astlide/commit/d8e83c513188a2d6ff5d0ef19c0deb49e3832138), [`54a11b6`](https://github.com/r-hashi01/astlide/commit/54a11b63dee45115f6ff88f1b103b3cbb24f4245), [`7facbea`](https://github.com/r-hashi01/astlide/commit/7facbeaef81477f6e18ebe77825231c51008e519), [`c363144`](https://github.com/r-hashi01/astlide/commit/c363144e4fd497ea71dff15370e112e25f863a23), [`92723fe`](https://github.com/r-hashi01/astlide/commit/92723fe422773a8d5be104610838f662801a6ef8), [`e4f040b`](https://github.com/r-hashi01/astlide/commit/e4f040b08828fe273eea2e725946bd1f806ca32d), [`59196b6`](https://github.com/r-hashi01/astlide/commit/59196b6e837d5d4b07226370482141a9ba7fd561), [`5141f74`](https://github.com/r-hashi01/astlide/commit/5141f74cc66684cf277f5334aba6a38db56057fa), [`883db38`](https://github.com/r-hashi01/astlide/commit/883db38ba1fd9d5dae136a13fd91d05d629035c8), [`0c5f558`](https://github.com/r-hashi01/astlide/commit/0c5f5585f0b1d74578b1617c791545c524794d57), [`ac07bef`](https://github.com/r-hashi01/astlide/commit/ac07beff592926113a0f4b2d791f6cd46c669219), [`0a8765d`](https://github.com/r-hashi01/astlide/commit/0a8765d173fb8b14aaccb5b30d09ac6a9d313114), [`2541b0e`](https://github.com/r-hashi01/astlide/commit/2541b0edbbff605a612a371f6bf293dc368b92d4), [`9fff903`](https://github.com/r-hashi01/astlide/commit/9fff9030f981b703787fd33ed91ce3895fc2d70e), [`90645a8`](https://github.com/r-hashi01/astlide/commit/90645a845801d98d2566fadaa26d9e7214a0a174), [`012f634`](https://github.com/r-hashi01/astlide/commit/012f63471d957a962e5365aa07637bd7eee061fe), [`afbbfd3`](https://github.com/r-hashi01/astlide/commit/afbbfd3eb4e437fc4f60a21f68e36bab7b85dc7c), [`9571255`](https://github.com/r-hashi01/astlide/commit/9571255ed88caca288396b3c21e4e7c84358ea8c), [`d76b3b7`](https://github.com/r-hashi01/astlide/commit/d76b3b79346070ca434bd3afb5d253f4429fbd80), [`23c2465`](https://github.com/r-hashi01/astlide/commit/23c2465266c47df5eed2a60db84cedbeddfa5a1b), [`b2e32fd`](https://github.com/r-hashi01/astlide/commit/b2e32fd2d1f5cf2e958d1aad08d8d53cbc90ebc8), [`7a26d4d`](https://github.com/r-hashi01/astlide/commit/7a26d4d81ddbbf6552a1de466fd6d0d95d4ab826), [`6d673a7`](https://github.com/r-hashi01/astlide/commit/6d673a796cec6b80e9a19af22a735df4b357f5d7), [`a7b60dc`](https://github.com/r-hashi01/astlide/commit/a7b60dcc72e25d3217cdc34a8fd67b0db2654fde), [`b84e8d7`](https://github.com/r-hashi01/astlide/commit/b84e8d7e5803f1025fe83ba845e5c718ba2de182), [`9975d94`](https://github.com/r-hashi01/astlide/commit/9975d94cee159eeb017d60d3c44d6341749dc4bd), [`81a5518`](https://github.com/r-hashi01/astlide/commit/81a551881795013bc8702a36b3620d74eb1a1ccb), [`adbe580`](https://github.com/r-hashi01/astlide/commit/adbe580ddf9d5dc7ecdf2ea5b1130ecb2c27efd5), [`3433e65`](https://github.com/r-hashi01/astlide/commit/3433e659a38cf387956fd66c47d156ba2ac89461), [`a1a8a9d`](https://github.com/r-hashi01/astlide/commit/a1a8a9db521d9ab080ee86d87899a3fe65d4b7b8), [`ca69eb4`](https://github.com/r-hashi01/astlide/commit/ca69eb44d4674f3f9fa5f897cfef747483e9c0fc), [`5dd9f7a`](https://github.com/r-hashi01/astlide/commit/5dd9f7af14ebfea91507477d85cf55b63ce33b07), [`ba7bb19`](https://github.com/r-hashi01/astlide/commit/ba7bb196299a23c1bccc93243daec510d33a2313)]:
  - @astlide/core@3.1.0

## 3.0.4

### Patch Changes

- [#307](https://github.com/r-hashi01/astlide/pull/307) [`1bf7b93`](https://github.com/r-hashi01/astlide/commit/1bf7b93086dd31a717c234348fb422f496e1f380) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Accessibility: the slide overview and the go-to dialog keep keyboard focus and screen readers inside while open (the page behind is inert), and closing returns focus where it was. The overview opens with the current slide focused. The speaker notes' close button is a `type="button"`.

- [#303](https://github.com/r-hashi01/astlide/pull/303) [`abf5c40`](https://github.com/r-hashi01/astlide/commit/abf5c40073192cf379ff40546dc3f1c2ad0a2054) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Accessibility: on the first and last slide, the unavailable Previous / Next control in the toolbar and the presenter window is now a disabled button (screen readers announce it as disabled) instead of a link with no destination. The camera bubble's "Camera" label is on its video, where screen readers read it.

- [#305](https://github.com/r-hashi01/astlide/pull/305) [`0325605`](https://github.com/r-hashi01/astlide/commit/03256053aae2e65eeef9d58c57e3a2ca7e5462a2) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Accessibility: while the speaker notes are closed, Tab no longer stops on their off-screen close button (the overlay is `inert` until opened).

- [#306](https://github.com/r-hashi01/astlide/pull/306) [`a4200aa`](https://github.com/r-hashi01/astlide/commit/a4200aad83322d29c644e53301ed3954775f64a2) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Accessibility: the slide overview is a list of links (screen readers announced each thumbnail as a list item, not a link). The slide area is a `<main>`, the speaker notes an `<aside>` and the presenter's notes font controls a `<fieldset>`, instead of `<div>`s with those roles. Pages look the same.
- Updated dependencies [[`1bf7b93`](https://github.com/r-hashi01/astlide/commit/1bf7b93086dd31a717c234348fb422f496e1f380), [`abf5c40`](https://github.com/r-hashi01/astlide/commit/abf5c40073192cf379ff40546dc3f1c2ad0a2054), [`0325605`](https://github.com/r-hashi01/astlide/commit/03256053aae2e65eeef9d58c57e3a2ca7e5462a2), [`a4200aa`](https://github.com/r-hashi01/astlide/commit/a4200aad83322d29c644e53301ed3954775f64a2)]:
  - @astlide/core@3.0.4

## 3.0.3

### Patch Changes

- Updated dependencies [[`ab6a9cb`](https://github.com/r-hashi01/astlide/commit/ab6a9cbd1773533a42c63b2e3399fea0a8c81565)]:
  - @astlide/core@3.0.3

## 3.0.1

### Patch Changes

- [#294](https://github.com/r-hashi01/astlide/pull/294) [`efd2c93`](https://github.com/r-hashi01/astlide/commit/efd2c93d74e1dde22d21efbbaed2d324eda64e59) Thanks [@r-hashi01](https://github.com/r-hashi01)! - Depend on `@astlide/core` 3 (and on `@astlide/react` / `@astlide/vue` 3). The 3.0.0 releases of these packages, and `astlide` 0.2.0, were published depending on the previous versions.
- Updated dependencies [[`efd2c93`](https://github.com/r-hashi01/astlide/commit/efd2c93d74e1dde22d21efbbaed2d324eda64e59)]:
  - @astlide/core@3.0.1

## 3.0.0

### Major Changes

- [#291](https://github.com/r-hashi01/astlide/pull/291) [`934761a`](https://github.com/r-hashi01/astlide/commit/934761af53671800510c22a62bfff7bf38c7e506) Thanks [@r-hashi01](https://github.com/r-hashi01)! - First release, versioned with Astlide 3:
  - **`@astlide/react`:** Astlide's slides, components and deck page as React components.
  - **`@astlide/next`:** a folder of decks as pages of a Next.js app.
  - **`@astlide/vue`:** the same as `@astlide/react`, for Vue.
  - **`@astlide/nuxt`:** a Nuxt module serving a folder of decks.

  The decks are the same files as in an Astro site, MDX included.

### Patch Changes

- Updated dependencies [[`3b73a63`](https://github.com/r-hashi01/astlide/commit/3b73a63d1ce05a8452136c0dc570151dfb3b1e59), [`9360c4a`](https://github.com/r-hashi01/astlide/commit/9360c4a7a0fb686bc0570c6ea84f62ad303ba2af), [`6dd1add`](https://github.com/r-hashi01/astlide/commit/6dd1adda4bc3d5aba7e2710ece77c72c510e216c), [`934761a`](https://github.com/r-hashi01/astlide/commit/934761af53671800510c22a62bfff7bf38c7e506), [`98cf488`](https://github.com/r-hashi01/astlide/commit/98cf4884d30042a04f14bf5eba91f5ebd3f3d9ba), [`dcf7d27`](https://github.com/r-hashi01/astlide/commit/dcf7d2735570147aa26182e6d4c1a8bb68309d5d), [`88146fa`](https://github.com/r-hashi01/astlide/commit/88146fa594347d93dd987b0527b18af56da05763), [`c1fb41f`](https://github.com/r-hashi01/astlide/commit/c1fb41f7b97b77af936295b70ad69a3b0a7f5102), [`10167df`](https://github.com/r-hashi01/astlide/commit/10167df9b3adc6b569c3c4aabd282d7cd4b4cb12), [`310ace6`](https://github.com/r-hashi01/astlide/commit/310ace6e12b9520b812bdf3847137ddc680bfdc4), [`20c416d`](https://github.com/r-hashi01/astlide/commit/20c416d9cd0266cb0384aa0d30e4021fe1cfcd34), [`934761a`](https://github.com/r-hashi01/astlide/commit/934761af53671800510c22a62bfff7bf38c7e506), [`8f12d72`](https://github.com/r-hashi01/astlide/commit/8f12d72c0476b9a2e7b286a2eff84b7915a7931f), [`43f1d72`](https://github.com/r-hashi01/astlide/commit/43f1d7229a7cf87ad1391d64669d6747fcaf165e), [`6f0433f`](https://github.com/r-hashi01/astlide/commit/6f0433fbd76b7f8a571305425dbab5601e2fad26), [`732b7ab`](https://github.com/r-hashi01/astlide/commit/732b7ab4807c117d50e62d03fa4a8b951c9d442b), [`d041996`](https://github.com/r-hashi01/astlide/commit/d0419962f4af0bb6fc003e07131bce671b77ddc4)]:
  - @astlide/core@3.0.0
