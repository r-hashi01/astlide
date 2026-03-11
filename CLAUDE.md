# Astlide — Astro Slide Framework

Slidev のような Astro ベースのスライドプレゼンテーションフレームワーク。

## プロジェクト構成

bun workspaces によるモノレポ。パッケージマネージャーは **bun** を使う。

```
packages/astlide/          — @astlide/core: コアパッケージ (Astro Integration)
packages/create-astlide/   — create-astlide: CLI スキャフォルダー (bun create astlide)
playground/                — 開発テスト用 Astro プロジェクト (workspace:* で @astlide/core をリンク)
```

### packages/astlide (@astlide/core)

- `src/index.ts` — Astro Integration エントリ (`injectRoute` でページ注入)
- `src/schema.ts` — Zod スキーマ (`slideSchema`)。ユーザーが content config で import する
- `src/components/` — Slide, Fragment, Left, Right, ImageSide, TextPanel
- `src/internal/DeckLayout.astro` — ビューポートスケーリング、ナビ、プレゼンター、オーバービュー等
- `src/internal/pages/` — Integration が inject するルート (slide.astro, index.astro)
- `src/styles/` — base.css + themes/default.css (7テーマ内蔵)
- `src/cli/export-pdf.ts` — Playwright + pdf-lib による PDF/PNG エクスポート

### packages/create-astlide (CLI)

- `src/index.ts` — CLI 本体。template/ ディレクトリをコピーする
- `template/` — スキャフォルドされるテンプレートプロジェクト

### playground

`@astlide/core` を workspace 依存で使う開発環境。example-deck (6スライド) 付き。

## コマンド

```bash
bun run dev        # playground の dev server 起動
bun run build      # playground のビルド
bun run preview    # playground のプレビュー
bun run lint       # Biome で lint チェック
bun run lint:fix   # Biome で lint 自動修正
bun run format     # Biome でフォーマット
bun install        # 依存関係インストール
```

## 技術スタック

- **Astro 5** + @astrojs/mdx 4
- Content Collections + Zod schema
- CSS transform ベースのビューポートスケーリング (1920×1080)
- TypeScript (strict)
- Biome (linter + formatter、タブインデント)

## 重要な規約

- frontmatter では `slideLayout` を使う（`layout` は Astro MDX の予約語）
- スライドファイル名は `01-name.mdx`, `02-name.mdx` のように番号付き
- デッキ設定は `_config.json` (title, author, date, theme)
- テーマ: default, dark, minimal, corporate, gradient, rose, forest

## Astro Integration の仕組み

`astlide()` を `astro.config.mjs` に追加すると:
1. MDX integration を自動追加（未設定の場合）
2. `injectRoute` で `/` と `/[deck]/[...slide]` を注入
3. Shiki のコードハイライト設定

ユーザー側に必要なのは:
- `astro.config.mjs` に `import astlide from '@astlide/core'` して `astlide()` を追加
- `src/content/config.ts` で `import { slideSchema } from '@astlide/core/schema'` して collection 定義
- `src/content/decks/<deck-name>/` にスライドを配置

## レイアウト一覧

default, cover, section, two-column, image-full, image-left, image-right, code, quote, statement

## キーボードショートカット

→/Space: 次, ←: 前, o: オーバービュー, p: プレゼンター, n: ノート, f: フルスクリーン
