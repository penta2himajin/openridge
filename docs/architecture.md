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
                                                 │ wrangler deploy
                                                 ▼
                                    ┌─────────────────────────┐
                                    │  Cloudflare Workers     │
                                    │  (Static Assets)        │
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
| ホスティング | **Cloudflare Workers (Static Assets)** |
| デプロイ | `cloudflare/wrangler-action@v3` |
| データ更新基盤 | **GitHub Actions**（schedule + manual dispatch） |

## 3. リポジトリ構成（graduate 後の別repo想定）

```
local-lm-frontier/
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
├─ .github/workflows/
│  ├─ refresh.yml           ← Daily Refresh: cron + manual dispatch
│  └─ deploy.yml            ← Workers にデプロイ
├─ wrangler.jsonc           ← assets = { directory = "./dist" }
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
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci && npm run build
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CF_API_TOKEN }}
          accountId: ${{ secrets.CF_ACCOUNT_ID }}
          command: deploy
```

## 6. Cloudflare Workers (Static Assets)

- **公開ドメイン**: [`openridge.dev`](https://openridge.dev)（Cloudflare Registrar で取得、$12/年）
- **Worker 名**: `ridge`（サイト内表示名と合わせる）
- Registrar と Workers が同一 CF アカウントなので DNS / カスタムドメイン紐付けは UI 1クリック

`wrangler.jsonc`:

```jsonc
{
  "name": "ridge",
  "compatibility_date": "2026-01-01",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application"
  },
  "routes": [
    { "pattern": "openridge.dev", "custom_domain": true },
    { "pattern": "www.openridge.dev", "custom_domain": true }
  ]
}
```

- **JS は不要**（純粋に静的配信）。`main` を書かなくていい
- 将来 KV / Cron Triggers / R2 が欲しくなったら追加可能
- カスタムドメインは無料、グローバル CDN 標準装備、HTTPS 自動

## 7. graduate までの段階

1. **ideabook 内** (`ideas/local-lm-frontier/`): 構想・調査メモのみ（このファイル群）
2. **prototype** (`ideas/local-lm-frontier/prototype/`): MVP 実装。`scripts/build-data.ts` と Astro の最小UI を ideabook 内で動かす
3. **graduate**: 別repo `local-lm-frontier` に切り出し、Workers デプロイ、独自ドメイン。ideabook 側 README を stub にして `Status: graduated`

## Open

- HF API の認証なしレート (~300 req/h 程度?) で AA 全モデル分の build が引っかからないか実測
- `data/models.json` のサイズ（モデル数 < 500 なら1ファイルで十分。1000超えたら分割検討）
- `data/` を git log のデフォルト表示から外す alias 設定の周知（PR レビュー時のノイズ低減）
