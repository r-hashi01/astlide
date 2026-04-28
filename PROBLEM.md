# Known Issue: astro-components.test.ts hangs in vitest

## 症状

`bun run test` または `vitest run` を実行すると、
`packages/astlide/tests/astro-components.test.ts` だけが無応答のままハングし、
他の 7 テストスイート (262 tests) はすべてパスする。

```
✓ theme-map.test.ts       (34 tests)
✓ hast-builder.test.ts    (39 tests)
✓ sanitize.test.ts        (54 tests)
✓ schema.test.ts          (61 tests)
✓ ooxml-writer.test.ts    (43 tests)
✓ mdx-parser.test.ts      (14 tests)
✓ integration.test.ts     (17 tests)
⏳ astro-components.test.ts  ← ここでハング（70 tests）
```

## 原因（切り分け済み）

### 単体では動く

```bash
# 1. AstroContainer.create() 単体 → 問題なし（< 1秒で完了）
node --input-type=module -e "
  import { experimental_AstroContainer as AstroContainer } from 'astro/container';
  const c = await AstroContainer.create();
  console.log('ok', typeof c);
  process.exit(0);
"

# 2. .astro ファイルを import しない最小テスト → vitest 内でも問題なし
vitest run packages/astlide/tests/_probe_no_astro.test.ts  # pass
```

### 組み合わせるとデッドロック

```
vitest (forks pool)
  └─ fork worker
       ├─ import Fragment from "../src/components/Fragment.astro"
       │    └─ Astro Vite plugin が transform リクエストを送信
       │         → メインプロセス (Vite server) へ IPC
       │              └─ (メインプロセスが別の処理でブロック中)  ← デッドロック
       └─ beforeAll: AstroContainer.create()
            └─ 同じ transform パイプラインを使おうとして永遠に待機
```

**根本原因:**
`getViteConfig` (Astro の vitest 設定ヘルパー) が初期化した Vite dev server に対して、
fork worker からの `.astro` ファイル transform IPC がデッドロックする。
`pool: 'forks'` でも `pool: 'threads'` でも再現する。

## 暫定対処

`pool: 'forks'` + `hookTimeout: 30000` を設定済み（`vitest.config.ts`）。
ハングは変わらないが、他のスイートには影響なく `bun run test` は 262 tests 通過する。
（astro-components スイートはタイムアウト後にエラー扱いになる）

## 恒久対処の候補

### 案 A: vitest workspace で 2 プロジェクト分割

```ts
// vitest.workspace.ts
import { defineWorkspace } from 'vitest/config';
export default defineWorkspace([
  {
    // 通常テスト: getViteConfig あり
    extends: './vitest.config.ts',
    test: { exclude: ['**/astro-components.test.ts'] },
  },
  {
    // Astro コンポーネントテスト: vmThreads でメインプロセス内実行
    extends: './vitest.config.ts',
    test: {
      include: ['**/astro-components.test.ts'],
      pool: 'vmThreads',
    },
  },
]);
```

### 案 B: .astro ファイルのインポートを排除

テスト側で `import` をやめ、`AstroContainer` 経由で動的に読み込む形にリファクタ。
テストコードの書き換えが必要。

### 案 C: Astro の issue トラッカーを確認

Astro 6 の `experimental_AstroContainer` + `getViteConfig` の既知バグかもしれない。
https://github.com/withastro/astro/issues で "AstroContainer vitest hang" を検索。

## 現在の状態

✅ **解消済み**（案 A: vitest projects 分割を採用）

`vitest.config.ts` を `defineConfig({ test: { projects: [...] } })` に変更し、astro-components スイートのみ別ファイル `vitest.config.astro.ts` で `pool: "vmThreads"` 指定して切り出し。残る通常スイートは従来の `pool: "forks"` のまま。

- `bun run docs` → ✅ 動作（docs/api/ 生成確認済み）
- `bun run lint` → ✅ クリーン
- `bun run test` → ✅ **341/341 全 pass**（astro-components 70 件 + plugin.test.ts 9 件含む）
