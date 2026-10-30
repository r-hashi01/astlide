# @astlide/react

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
