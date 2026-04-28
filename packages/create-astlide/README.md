# create-astlide

[![npm version](https://img.shields.io/npm/v/create-astlide.svg)](https://www.npmjs.com/package/create-astlide)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Scaffold a new [Astlide](https://github.com/r-hashi01/astlide) slide project.

## Use

```bash
bun create astlide my-slides
# or: npm create astlide@latest my-slides
# or: pnpm create astlide my-slides
# or: yarn create astlide my-slides
```

The CLI prompts for:

1. Project name (if not given as an argument)
2. Theme — pick one of the 7 built-in themes
3. Whether to include sample slides (recommended)
4. Package manager — bun / npm / pnpm / yarn

The generated project is a standard Astro project with `@astlide/core` pre-configured. Run `bun install && bun run dev` and open <http://localhost:4321>.

## Flags

| Flag | Description |
|---|---|
| `--help`, `-h` | Show help |
| `--version`, `-v` | Print CLI version |

## License

MIT
