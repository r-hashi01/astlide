# Astlide — Astro のスライド用インテグレーション

bun workspaces モノレポ。パッケージマネージャーは **bun**。

```
packages/astlide/          — @astlide/core (Astro Integration)
packages/create-astlide/   — create-astlide (CLI scaffolder)
packages/engine/           — @astlide/engine (ブラウザなしの HTML/CSS レイアウト、PPTX export が使用)
skills/astlide/            — エージェント用スキル (SKILL.md)
playground/                — 開発用 Astro プロジェクト
docs/                      — ドキュメントサイト (Starlight) → https://astlide.dev/
                             サイドバーは docs/site.mjs、/llms.txt・/llms-full.txt は docs/src/pages/
tools/ts6/                 — TypeScript 6 ブリッジ（下記）
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
bun run docs:dev     # ドキュメントサイト dev server
bun run docs:build   # TypeDoc (→ docs/public/api/) + ドキュメントサイトのビルド
bun run docs:api     # TypeDoc API リファレンスのみ生成
bun run changeset    # changeset 作成
```

## 絶対に守るルール

- ❌ frontmatter で `layout` を使わない → ✅ `slideLayout` を使う（`layout` は Astro MDX 予約語）
- ❌ パッケージ内部で相対パス import → ✅ `@astlide/core/...` パスを使う（`exports` マップで解決）
- ❌ npm/pnpm → ✅ bun のみ
- スライドファイル名: `01-name.mdx` の番号付き。`.mdx` / `.md` / `.html` を混在可（`astlideDeckLoader()` が処理、番号順にソート）
- デッキ設定: `_config.json` (title, author, date, theme)
- テーマ: default, dark, minimal, corporate, gradient, rose, forest（`templates` オプションで PowerPoint テンプレートもテーマにできる: `src/pptx/template.ts`）
- content collection の loader は `astlideDeckLoader()` を使う（`glob({ pattern: '**/*.mdx' })` ではなく）

## TypeScript

- リポジトリは **TypeScript 7**（ネイティブ `tsc`）。JS コンパイラ API を必要とするツール（`astro check` の language server、TypeDoc）だけ `tools/ts6` の TS6 を使う
- `bun run typecheck` / `bun run docs:api` は `node --import scripts/use-typescript6.mjs` で `typescript` の解決先を TS6 に差し替えて実行
- `tools/ts6` は TS7 とバージョン衝突させてネスト配置するためのワークスペース（ルートに TS6 を入れると `.bin/tsc` が TS6 にすり替わる）
- Astro が TS 7.1+ の `@astrojs/ts-content-mapper` に対応したら、ブリッジを外して `tsc --noEmit --runExternalCode` に移行する

## キーファイル

- `packages/astlide/src/index.ts` — Integration エントリ（`toolbar` / `font` / `slideDecorators` オプション）
- `packages/astlide/src/schema.ts` — Zod スキーマ (`slideSchema`)
- `packages/astlide/src/loader.ts` — `astlideDeckLoader()`（.mdx/.md/.html を扱う content loader）
- `packages/astlide/src/mcp/` — MCP サーバー（`astlide mcp` / `@astlide/core/mcp`。template_layouts・import_pptx・render_deck・check_deck）
- `packages/astlide/src/context.ts` — 型付きメタデータ API (`getDeckContext` / `getClientDeckContext`)
- `packages/astlide/src/plugin.ts` — プラグインAPI（themes/layouts/transitions/`decorators`）
- `packages/astlide/src/internal/DeckLayout.astro` — ビューポートスケーリング・ナビ(toolbar)・プレゼンター・PDF
- `packages/astlide/src/internal/virtual-plugins.ts` — `virtual:astlide/{themes,layouts,decorators}`
- `packages/astlide/src/internal/pages/` — inject されるルート（`/`, `/[deck]/[...slide]`, `/[deck]/all`）
- `packages/astlide/package.json` — `exports` マップ（公開API定義）

## ドキュメント運用

- **公開APIを変更したら TSDoc コメントも同時に更新する**（コメントがソースの真実）
- ドキュメントサイトは `docs/`（Starlight）。**機能を追加・変更したら `docs/src/content/docs/` の該当ページも更新する**
- `.github/workflows/pages.yml` が main への push で GitHub Pages（独自ドメイン https://astlide.dev/ ）に公開: `/`（docs）、`/api/`（TypeDoc、生成物は git 管理外）、`/demo/`（playground を base `/demo` でビルド）
- ドキュメントの画像は playground の `tour` デッキから生成: `node scripts/docs-screenshots.mjs`（ギャラリー: レイアウト/テーマ）と `node scripts/docs-ui-screenshots.mjs`（チュートリアル: プレゼンター等）。レイアウトや UI を変えたら撮り直す
- 内部リンクを手で組み立てるときは `withBase()`（`@astlide/core/utils/base-path`）を通す。CI が base 付きビルドで検査する

### リリースフロー

```bash
bun run changeset   # 変更内容を記録（機能追加・破壊的変更のたびに実行）
bun run version     # バージョンバンプ + CHANGELOG.md を自動生成
# 公開は CI のみ（Release ワークフロー、npm-publish 環境での承認が必要）。RELEASING.md 参照
```

## コードレビュー

`/review` コマンドを使用（`.claude/commands/review.md`）
