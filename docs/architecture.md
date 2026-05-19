# Architecture

「データパイプライン」と書くと大袈裟になるので、本ドキュメントでは **Daily Refresh + Static Site** という最小構成を前提に書く。

## 1. 全体像

```
┌────────────────────┐  daily cron  ┌─────────────────────────┐
│  GitHub Actions    │ ───────────▶ │  scripts/build-data.ts  │
│  (schedule + on-   │              │   ├ fetch AA API        │
│   demand)          │              │   ├ fetch HF API        │
└────────────────────┘              │   ├ resolve aliases     │
                                    │   ├ compute MoE active  │
                                    │   ├ compute Pareto      │
                                    │   └ write data/*.json   │
                                    └────────────┬────────────┘
                                                 │ git commit (if diff)
                                                 ▼
                                    ┌─────────────────────────┐
                                    │  data/models.json       │
                                    └────────────┬────────────┘
                                                 │ on push:
                                                 ▼
                                    ┌─────────────────────────┐
                                    │  Astro build            │
                                    │   - Solid components    │
                                    │   - Observable Plot     │
                                    │   - imports JSON        │
                                    └────────────┬────────────┘
                                                 │ actions/deploy-pages
                                                 ▼
                                    ┌─────────────────────────┐
                                    │  GitHub Pages           │
                                    │  (static, HTTPS, CDN)   │
                                    └────────────┬────────────┘
                                                 │ HTTPS / CDN
                                                 ▼
                                            user browser
```

**設計上重要なこと**:

- **ブラウザは AA API を叩かない**。APIキーは GH Actions secret に閉じ込め、ビルド時に JSON 化して配信。rate limit も鍵漏洩も気にしなくていい。
- **JSON は repo に commit する**（build-time bake ではなく）。git履歴がそのまま時系列データになる。将来 "frontier 推移" ビューを追加したい時にゼロコストで実現できる。
- **データ生成とサイトビルドを分離**。データ更新コミットだけで再デプロイが走る（Astro ビルドは早いので問題なし）。

## 2. スタック確定

| レイヤ | 採用 |
|---|---|
| 静的サイト生成 | **Astro** |
| UI コンポーネント | **Solid.js**（`@astrojs/solid-js` 統合経由） |
| チャート | **Observable Plot** をベースに、足りないインタラクションは **D3** / 手書き SVG で上書き |
| スタイル | **Tailwind CSS**（OKLCH ベースのカスタムパレット） |
| データ取得スクリプト | **TypeScript** (`tsx` で直接実行 / Node 20) |
| ホスティング | **GitHub Pages** |
| デプロイ | `actions/upload-pages-artifact@v3` + `actions/deploy-pages@v4` |
| データ更新基盤 | **GitHub Actions**（schedule + manual dispatch） |

## 3. リポジトリ構成

```
openridge/
├─ data/
│  ├─ models.json           ← Daily Refresh の成果物（commit対象）
│  ├─ hf_aliases.json       ← AA slug → HF repo id の手動マップ
│  ├─ moe_overrides.json    ← MoE のアクティブパラメータ手動値
│  └─ closed_anchors.json   ← クローズド表示の取捨選択ルール
├─ scripts/
│  └─ build-data.ts         ← 取得・突合・計算・出力
├─ src/
│  ├─ pages/
│  │  └─ index.astro        ← 1ページ
│  ├─ components/
│  │  ├─ Frontier.tsx       ← Solid: メインの散布図 (Observable Plot)
│  │  ├─ Tooltip.tsx        ← Solid: ホバー詳細
│  │  ├─ Filters.tsx        ← Solid: チップ式フィルタ
│  │  └─ Header.tsx
│  └─ lib/
│     ├─ pareto.ts          ← フロンティア計算
│     └─ models.ts          ← データ型・ロード
├─ public/
│  └─ CNAME                 ← `openridge.dev` (GH Pages custom domain)
├─ .github/workflows/
│  ├─ refresh.yml           ← Daily Refresh: cron + manual dispatch
│  └─ deploy.yml            ← GH Pages へデプロイ
├─ astro.config.mjs
├─ tailwind.config.ts
└─ package.json
```

## 4. Daily Refresh の中身（"pipeline" ではなくスクリプト1本）

`scripts/build-data.ts` の概要:

```ts
const aa = await fetchAA();                       // /api/v2/data/llms/models
const aliases = loadJson("data/hf_aliases.json");
const overrides = loadJson("data/moe_overrides.json");

const models = [];
for (const m of aa.data) {
  const hfId = aliases[m.slug];                   // undefined = 未登録, null = closed
  let total = null, active = null, license = null;

  if (hfId) {
    const hf = await fetchHF(hfId);
    total = hf.safetensors?.total ?? null;
    license = extractLicense(hf);
    active = overrides[hfId]?.active
          ?? estimateActiveFromConfig(hf)
          ?? total;                                // dense は total = active
  } else if (hfId === undefined) {
    console.warn(`[alias-missing] ${m.slug}`);     // 新モデル検出ログ
  }

  models.push({
    id: m.id,
    name: m.name,
    creator: m.model_creator.name,
    isClosed: hfId === null,
    params: { total, active },
    license,
    scores: m.evaluations,
    pricing: m.pricing,
    speed: {
      tps: m.median_output_tokens_per_second,
      ttft: m.median_time_to_first_token_seconds
    },
    hfId
  });
}

const open = models.filter(x => !x.isClosed && x.params.active != null);
const paretoByMetric = {};
for (const metric of TRACKED_METRICS) {
  paretoByMetric[metric] = computeParetoFrontier(
    open,
    m => m.params.active,
    m => m.scores[metric]
  ).map(p => p.id);
}

writeJson("data/models.json", {
  generatedAt: new Date().toISOString(),
  models,
  paretoByMetric
});
```

### Pareto 計算

X 最小化・Y 最大化。O(n log n)（Y降順ソート → X を後ろから単調更新）。Y軸切替で frontier が変わるので、**よく使う指標は事前計算して JSON に同梱**する。再計算をクライアントに任せない。

## 5. GitHub Actions

### `refresh.yml`

```yaml
on:
  schedule: [{ cron: "0 4 * * *" }]    # 毎日 04:00 UTC
  workflow_dispatch:
permissions:
  contents: write
jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run refresh
        env:
          AA_API_KEY: ${{ secrets.AA_API_KEY }}
      - name: Commit if changed
        run: |
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git config user.name  "github-actions[bot]"
          git add data/models.json
          git diff --cached --quiet || git commit -m "chore(data): refresh $(date -u +%Y-%m-%d)"
          git push
```

失敗時: Action が赤くなる。GitHub のデフォルト通知がメールで来る。それで十分（リトライ機構なし）。

### `deploy.yml`

```yaml
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: false
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci && npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

## 6. GitHub Pages

- **公開ドメイン**: [`openridge.dev`](https://openridge.dev)
- **CNAME**: `public/CNAME` に `openridge.dev` を入れる（Astro が `public/` を `dist/` ルートにコピーするので、Pages がカスタムドメインとして拾う）
- **DNS** (apex `openridge.dev`): A レコード4本を GitHub Pages の IP に向ける
  - `185.199.108.153`
  - `185.199.109.153`
  - `185.199.110.153`
  - `185.199.111.153`
- **DNS** (`www.openridge.dev`): CNAME `penta2himajin.github.io`
- **DNS proxy 注意**: Cloudflare DNS を使う場合は **グレー雲 (DNS only)** にする。オレンジ雲 (proxy ON) は Pages 側の Let's Encrypt 証明書発行と稀に喧嘩する
- **HTTPS**: GH Pages が Let's Encrypt で自動発行・更新。`.dev` は HSTS preloaded なので HTTPS 必須だが追加設定は不要
- **Repo Settings → Pages**: Source = "GitHub Actions"（このリポは workflow 経由で deploy する）

### Cloudflare Workers ではなく Pages を選んだ理由

初期構想（ideabook 期）では CF Workers (Static Assets) を想定していたが、graduate 直後に Pages に切り替えた。

- 本サイトは純粋静的 + JSON のみ。Workers の旨味（KV / Durable Objects / Cron / SSR / 関数ルート）は使わない
- Daily Refresh は GH Actions の cron で完結。CF Cron Triggers は不要
- prior-art.md の "1画面・機能を増やさない" を core invariant として持っているので、将来 Worker 機能要件が発生する確率は低い
- Pages なら `wrangler.jsonc` / `wrangler` deps / `CF_API_TOKEN` / `CF_ACCOUNT_ID` の secret セットアップ / 別アカウント運用が一切不要
- 将来本当に Worker 機能が必要になったら `pages.dev` を捨てて Workers に戻す移行コストは小さい（DNS 切替 + workflow 差替えのみ）

## 7. graduate までの段階

1. **ideabook 内** (`ideas/local-lm-frontier/`): 構想・調査メモのみ（このファイル群）
2. **prototype** (`ideas/local-lm-frontier/prototype/`): MVP 実装。`scripts/build-data.ts` と Astro の最小UI を ideabook 内で動かす
3. **graduate**: 別repo `local-lm-frontier` に切り出し、Workers デプロイ、独自ドメイン。ideabook 側 README を stub にして `Status: graduated`

## Open

- HF API の認証なしレート (~300 req/h 程度?) で AA 全モデル分の build が引っかからないか実測
- `data/models.json` のサイズ（モデル数 < 500 なら1ファイルで十分。1000超えたら分割検討）
- `data/` を git log のデフォルト表示から外す alias 設定の周知（PR レビュー時のノイズ低減）
