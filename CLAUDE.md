# Astlide — Astro Slide Framework

bun workspaces モノレポ。パッケージマネージャーは **bun**。

```
packages/astlide/          — @astlide/core (Astro Integration)
packages/create-astlide/   — create-astlide (CLI scaffolder)
playground/                — 開発用 Astro プロジェクト
```

## コマンド

```bash
bun run dev          # playground dev server
bun run build        # playground build
bun run lint         # Biome lint
bun run lint:fix     # Biome lint 自動修正
bun run format       # Biome format
bun run test         # vitest unit tests
bun run test:e2e     # Playwright e2e tests
bun run docs         # TypeDoc API リファレンス生成 (→ docs/api/)
bun run changeset    # changeset 作成
```

## 絶対に守るルール

- ❌ frontmatter で `layout` を使わない → ✅ `slideLayout` を使う（`layout` は Astro MDX 予約語）
- ❌ パッケージ内部で相対パス import → ✅ `@astlide/core/...` パスを使う（`exports` マップで解決）
- ❌ npm/pnpm → ✅ bun のみ
- スライドファイル名: `01-name.mdx`, `02-name.mdx` の番号付き
- デッキ設定: `_config.json` (title, author, date, theme)
- テーマ: default, dark, minimal, corporate, gradient, rose, forest

## キーファイル

- `packages/astlide/src/index.ts` — Integration エントリ
- `packages/astlide/src/schema.ts` — Zod スキーマ (`slideSchema`)
- `packages/astlide/src/internal/DeckLayout.astro` — ビューポートスケーリング・ナビ・プレゼンター
- `packages/astlide/src/internal/pages/` — inject されるルート
- `packages/astlide/package.json` — `exports` マップ（公開API定義）

## ドキュメント運用

- **公開APIを変更したら TSDoc コメントも同時に更新する**（コメントがソースの真実）
- `bun run docs` で `docs/api/` に HTML リファレンスを生成（生成物は git 管理外）
- 将来 Starlight サイトを作る際は `docs/` をそのままルートにできる構成

### リリースフロー

```bash
bun run changeset   # 変更内容を記録（機能追加・破壊的変更のたびに実行）
bun run version     # バージョンバンプ + CHANGELOG.md を自動生成
bun run release     # npm publish（CI での実行を推奨）
```

## コードレビュー

`/review` コマンドを使用（`.claude/commands/review.md`）
