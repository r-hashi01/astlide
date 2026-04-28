# FIX.md — Astlide Issues & Roadmap

## CRITICAL

- [x] **`fs` relative paths in injected routes** — `process.cwd()` + `path.join` に修正済み。

- [x] **`create-astlide` not buildable** — `kleur` 削除、`@types/node` 追加、`prepublishOnly` 追加、`tsc` ビルド確認済み。CLI 動作テスト済み。

---

## HIGH

- [x] **Fragment component ignores `effect` prop** — Slide.astro に effect 別 CSS（fade, slide-up, zoom, highlight）を追加。Fragment.astro の重複スタイル削除。

- [x] **Missing type exports** — `index.ts` から `slideSchema` と `SlideData` を re-export。`package.json` に `types` フィールド追加。

- [x] **`astro:content` import in schema.ts** — `astro:content`（仮想モジュール）→ `astro/zod` に変更。

- [x] **`transition` frontmatter prop が未実装** — View Transitions API を活用して実装済み。`<html data-slide-transition>` 属性 + CSS `::view-transition-old/new(slide-content)` で per-slide アニメーション（fade/slide-left/slide-right/slide-up/zoom/none）を実現。exit keyframes（fadeOut/slideToLeft 等）を追加。`base.css` に View Transitions ルール追加、DeckLayout のハードコード `transition:animate="fade"` を削除。

- [x] **Fragment デフォルト effect がドキュメントと逆** — `Fragment.astro` のデフォルトを `'slide-up'` → `'fade'` に修正。README の記述（`fade (default)`）と一致させた。

- [x] **hidden スライドのリダイレクトが範囲外になる** — `getStaticPaths` で各スライドに `nextVisibleSlide` を事前計算して props で渡すように修正。次の非 hidden スライド → 先頭の非 hidden スライド → スライド 1 の順でフォールバック。連続 hidden スライドにも対応。

- [x] **Astro 6 アップグレード** — Astro 6.0.3 + @astrojs/mdx 5.0.0 + Zod v4 に移行済み。Content Layer API（glob loader）移行、`render()` API 変更、ViewTransitions → ClientRouter、content config パス変更（`src/content.config.ts`）、テスト・ビルド確認済み。

- [x] **No CSP headers** — `<meta http-equiv="Content-Security-Policy">` を全ページ（DeckLayout + index）に追加。デフォルトポリシーは `default-src 'self'` ベース（Google Fonts / `unsafe-inline` 許可）。`astlide({ csp: false })` で無効化、文字列でカスタムポリシー設定が可能。Vite `define` 経由でビルド時に注入。

- [x] **No sanitization of MDX content** — `sanitizeHTML()` ユーティリティ（`src/utils/sanitize.ts`）を追加。frontmatter `notes` を `set:html` に渡す前にサニタイズ（script/iframe/on* 等を除去、安全なフォーマットタグは保持）。`background` フィールドに Zod `refine` バリデーション（expression()・javascript: URL・波括弧等をブロック）を追加。テスト 39件追加（sanitize.test.ts）。

- [x] **`<Notes>` component 経由の XSS パス** — DeckLayout.astro の JS に `sanitizeNotesHTML()` 関数を追加（`DOMParser` でHTMLをパース → 危険タグ削除 → `on*` 属性ストリップ → `innerHTML` に代入）。3箇所の unsanitized innerHTML 代入をすべて保護済み。

- [x] **`sanitizeBackground()` の `data:image/svg+xml` 抜け穴** — dangerous regex を `data:\s*(?:text\/html|image\/svg)` に拡張。`data:image/svg+xml` 形式（クォートあり・なし・base64・大文字小文字）をブロック。テスト3件追加（96件パス）。

---

## MEDIUM

- [x] **README.md outdated** — モノレポ構成、bun コマンド、`@astlide/core` パッケージ、両インストール方法に対応してリライト済み。

- [x] **No Content Collections auto-setup** — Integration 起動時に `src/content.config.ts` と `src/content/decks/` の存在チェックを追加。未設定時にコピペ可能なコード例付きの警告を表示。

- [x] **Presenter mode fragility** — BroadcastChannel によるメイン↔プレゼンターのスライド同期を実装。try/catch フォールバック付き（非対応環境では独立ナビゲーション）。

- [x] **export-pdf.ts hardcoded values** — `--width`/`--height`/`--base-url` CLI 引数を追加。`--help` 表示、`getDecks()` の `process.cwd()` パス修正、EXPORT_STYLE の共通化。

- [x] **Multiple `updateConfig()` calls** — MDX 追加と Shiki 設定を単一の `updateConfig()` 呼び出しにマージ済み。

- [x] **No tests at all** — Vitest 導入済み。schema バリデーション + Integration ロジックの unit test 作成。CI に test ジョブ追加。
  - ✅ Unit tests for schema validation (slideSchema: layouts, transitions, defaults, optional fields)
  - ✅ Integration tests for the Astro integration (injectRoute, MDX auto-add, Shiki config, content collection warnings)
  - ✅ Sanitize tests (sanitizeHTML, sanitizeBackground)
  - ⊖ 一般 E2E（navigation / fragments / ui-modes）は **意図的に削除**。理由: 検証対象は `DeckLayout.astro` の inline `<script>` だけで、別モジュールに抽出すれば happy-dom + Container API で unit 化できる。現状規模では browser harness 維持コストが利益を上回ると判断（v1 接近時に再検討）。
  - ✅ Visual regression tests（`e2e/visual.test.ts`、pixelmatch + pngjs、3 baseline @1920x1080）。macOS 限定で `Visual Regression` workflow が weekly + manual dispatch で実行。
  - ✅ vitest workspace を 2 プロジェクト分割し、`astro-components.test.ts` (70 tests) のハング解消。`bun run test` で 341/341 pass。

- [x] **No publish workflow** — 両パッケージに `prepublishOnly`、`description`、`repository`、`homepage`、`bugs`、`keywords` を追加。`npm pack --dry-run` で内容確認済み。

- [x] **No changelog / versioning strategy** — `@changesets/cli` + `@changesets/changelog-github` 導入済み。`.changeset/config.json` 設定、playground を ignore 設定。`bun changeset` / `bun version` / `bun release` スクリプト追加。GitHub Actions release ワークフロー（changesets/action）で自動 Release PR 作成 + npm publish。

- [x] **No `prepublishOnly` script** — `create-astlide` は `prepublishOnly: "bun run build"` 済み。`@astlide/core` はソース直接公開のため echo のみ。

- [x] **No `.npmignore` or `"files"` field** — 両パッケージとも `"files"` フィールド設定済み。`@astlide/core` は `["src"]`（tests/ 除外）、`create-astlide` は `["dist", "template"]`。dry-run 確認済み。

- [x] **No slide transition system** — Astro ClientRouter (`<ClientRouter />`) 導入済み。スライド間のナビゲーションが SPA ライクなクライアントサイドルーティングになり、fade トランジション付きでスムーズに遷移。`navigate()` によるプログラム遷移、イベントリスナー cleanup、BroadcastChannel 対応。

- [x] **No `<Notes>` component** — `Notes.astro` コンポーネント追加済み。MDX 内で `<Notes>` を使いリッチなプレゼンターノートが書ける。DeckLayout の JS が `[data-slide-notes]` を検出してプレゼンターモード・ノートオーバーレイに反映。frontmatter `notes` との併用時はコンポーネント優先。

- [x] **No `<Columns>` component** — `Columns.astro` コンポーネント追加済み。CSS Grid ベースで任意カラム数対応。`columns`, `gap`, `align`, `widths` props でカスタマイズ可能。MDX 内の子要素が自動的にグリッドアイテムになる。playground にデモスライド追加。

- [x] **No SPA mode** — Astro ClientRouter でクライアントサイドルーティング実現済み。MPA ビルドながら SPA ライクなスムーズナビゲーション。

- [x] **No ARIA attributes** — スライドに `role="region"` + `aria-roledescription="slide"` + `aria-label` を追加。プログレスバーに `role="progressbar"` + aria-value 属性。スキップリンク追加。`aria-live` リージョンでスライド番号をスクリーンリーダーに通知。Fragment に `aria-hidden` トグル。オーバービューに `role="dialog"` + `role="list"`。ノートオーバーレイに `role="complementary"`。フォーカス管理（`tabindex="-1"` + 自動フォーカス）。

- [x] **No reduced-motion support** — `Slide.astro` と `DeckLayout.astro` の両方で `@media (prefers-reduced-motion: reduce)` 対応済み。フラグメント・トランジション・UI要素すべてのアニメーション無効化。

- [x] **No screen reader navigation** — スキップリンク（"Skip to slide content"）追加。`aria-live="polite"` リージョンでスライド遷移をアナウンス。セマンティックなランドマーク構造（`role="main"`, `role="region"`, `role="dialog"`, `role="complementary"`, `aria-label`）。オーバービューアイテムに詳細な `aria-label`（"Slide X of Y (current)"）。

- [x] **`create-astlide` テンプレートのサンプルスライドが不足** — 3枚（cover/intro/end）→ 7枚に拡充。01-cover / 02-intro / 03-two-column / 04-code（CodeBlock デモ）/ 05-fragments / 06-columns / 07-end。playground と同じ構成で学習コストを削減。

- [ ] **No documentation site** — A framework needs user-facing docs.
  - Getting Started guide
  - Slide syntax reference (frontmatter, layouts, fragments)
  - Theme customization guide
  - Component API reference (Slide, Fragment, Left, Right, etc.)
  - CLI reference (create-astlide, export-pdf)
  - Deployment guide (static hosting, PDF export)
  - Could be built with Astro Starlight

- [x] **No interactive CLI** — `create-astlide` にインタラクティブプロンプトを追加。① プロジェクト名（引数省略時のみ）② テーマ選択（7種・番号入力）③ サンプルスライド含む？（y/n）④ パッケージマネージャー（bun/npm/pnpm/yarn）。選択テーマを `_config.json` に反映、サンプル不要時は 02-06 を削除。next steps のコマンドも選択 PM に合わせて変更。Node.js 組み込み `readline` のみ使用（追加依存なし）。

- [x] **No error overlay** — `ErrorOverlay.astro` を追加。dev 限定で fixed-position の小さな診断パネルを表示し、`_config.json` のパース失敗・unknown layout/theme/transition をスライド上に表示する（dismissable, sessionStorage 永続化）。MDX 構文エラーは Vite 標準オーバーレイに委譲。

- [x] **No plugin API** — `defineAstlidePlugin()` + `AstlidePlugin` 型を追加（`@astlide/core/plugin`）。プラグインは `themes` `layouts` `transitions` `shiki` の contribution を持つ。`astlide({ plugins: [...] })` で登録。`virtual:astlide/themes` Vite virtual module 経由で全テーマ CSS を side-effect import。schema は `slideLayout` / `transition` / `theme` を `z.string()` に緩和し、未登録名は dev で警告のみ。9 件の unit test で resolve/dedup 検証。

- [x] **No custom theme API** — Plugin API に Theme contribution として統合済み。npm 命名規約 `astlide-plugin-*` / `keywords: ["astlide-plugin"]` / `peerDependencies: { "@astlide/core": "^x" }` / `export default defineAstlidePlugin({...})`。`DeckLayout.astro` のハードコード 7 テーマ import を `virtual:astlide/themes` 1 行に置換、組み込みテーマも synthetic plugin として同経路で登録。

- [x] **No `<CodeBlock>` component** — `CodeBlock.astro` コンポーネント追加。ファイル名ヘッダーバー + ワンクリックコピーボタン（Clipboard API）を提供。`<slot>` に MDX コードフェンスを受け取り、Shiki ハイライト済みの `<pre>` をラップ。`data-copied` 属性でコピー完了フィードバック。`slide.astro` の components マップに追加済み。playground/template の 04-code.mdx で CodeBlock を使用するよう更新。

- [x] **disabled ナビボタンに `aria-disabled` がない** — 通常ナビ・プレゼンターナビの両方に `aria-disabled="true"` と `tabindex="-1"` を追加。disabled 時は CSS クラスだけでなく WAI-ARIA でも無効状態をスクリーンリーダーに通知するようになった。

---

## LOW

- [x] **No linter/formatter** — Biome 導入済み。`bun run lint` / `bun run lint:fix` / `bun run format`

- [x] **No CI/CD** — GitHub Actions CI 追加（lint, build, build-cli の3ジョブ）。

- [x] **No `--help` in create-astlide** — `-h`/`--help` と `-v`/`--version` フラグ追加。

- [x] **All themes in single file** — 7テーマを個別 CSS ファイルに分割。DeckLayout で全テーマ import。

- [x] **プレゼンタータイマーがページロードで即開始** — 自動開始から手動制御に変更。▶ Start/⏸ Pause トグルボタンと ↺ Reset ボタンを追加。3変数（`timerRunning`, `timerElapsed`, `timerStartTime`）で Pause 中の累積秒を保持し、Resume 時に正確な経過時間を維持。CSP の `frame-src` に `youtube-nocookie.com` を追加。

- [~] **No dev mode HMR optimization** — Astro/Vite の標準 HMR で実用上問題なしと判断。`scripts/measure-hmr.mjs` で計測のみ用意（中央値が 1s を超えたら追加最適化を判断）。

- [~] **No VS Code extension** — モノレポでは扱わず **別リポ `astlide-vscode`** として独立させる方針に決定。理由: 配布チャネル (Marketplace/`vsce publish`) が changesets ワークフローと噛み合わない / 依存方向が一方向 (拡張 → core) で peer dep 化できる / リリースサイクルが大きく異なる / テスト基盤 (`@vscode/test-electron`) が別系統。最小スコープ着手時は `.mdx` 検出 + frontmatter / コンポーネントスニペット + 「ブラウザで開く」コマンドから。

- [x] **No `<Math>` component** — `Math.astro` コンポーネント追加。KaTeX v0.16 によるビルド時 SSR。`formula` + `display` props でインライン/ブロック切り替え。`sanitizeKaTeXOutput()` で XSS 対策（script/on*/javascript: URL を除去しつつ SVG・inline-style を保持）。`sanitize.ts` に `sanitizeKaTeXOutput` 関数を追加。

- [x] **No `<Tweet>`, `<YouTube>` embeds** — `YouTube.astro` と `Tweet.astro` を追加。YouTube はフルURL/IDどちらでも受け取り（正規表現で自動抽出）、プライバシー強化モード (`youtube-nocookie.com`)、`start` 秒数指定、16:9 aspect-ratio CSS。Tweet は静的スタイルドカード（外部API不要、オフライン動作）、`url`/`text`/`author`/`handle`/`date`/`avatar` props、X ロゴ付き。

- [x] **No static export optimization** — DeckLayout.astro に `<meta name="description">`, OG タグ（`og:title`, `og:description`, `og:type`）を追加。`noindex`/`nofollow` をデフォルトで挿入（`AstlideOptions.indexable: true` で解除可能）。次スライドへの `<link rel="prefetch">` でナビゲーション体験を改善。`index.ts` に `indexable` オプションと `__ASTLIDE_INDEXABLE__` Vite define を追加。

- [x] **No PPTX export** — `export-pptx.ts` を新規追加。MDX AST ベースの本格実装（Playwright/dev server 不要）。unified + remark-parse + remark-mdx で各 MDX ファイルを直接パースし、pptxgenjs で PPTX を生成。
  - 全 10 slideLayout → PPTX スライドジオメトリにマッピング（cover/section/two-column/image-full/image-left/image-right/code/quote/statement/default）
  - 全 7 テーマの背景色・前景色・アクセントカラーを `ThemeColors` マップで管理
  - Markdown ノード（heading/paragraph/list/code/blockquote）をテキストランに変換
  - `<Left>/<Right>` → 2カラムレイアウト、`<Columns>` → N カラムグリッド
  - `<Fragment>` → 全コンテンツ表示（アニメーションなし）、`<Notes>` → スキップ
  - `<CodeBlock>` → 専用スタイル付きコードボックス（暗背景 + 等幅フォント）
  - `<Math>` → `[Math: formula]` テキストプレースホルダー
  - `<YouTube>/<Tweet>` → URL/テキスト抽出してインライン表示
  - `background` frontmatter → ソリッドカラー/画像 URL をスライド背景に適用
  - `hidden: true` のスライドはスキップ
  - `pptxgenjs` を `optionalDependencies` に追加
