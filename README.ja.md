# openridge

[English](./README.md)

> Source: README.md @ HEAD（初版なので差分追跡は次回更新から）

> Status: scaffolded — pre-MVP

セルフホスト可能なオープン重み LLM のための、Pareto フロンティア可視化ツール。1画面・ノイズ最小の散布図に「モデルパラメータ vs 性能ベンチマーク」を載せ、クローズドモデルは横線アンカーとして "だいたいあのクローズドモデルくらい" の参照点を提供する。製品内ブランド名は **Ridge**。

公開予定ドメイン: [openridge.dev](https://openridge.dev)

## これは何か

散布図1枚で完結。X軸 = パラメータ（active / total / compare 切替、log スケール）、Y軸 = 切替可能なベンチマーク（既定 AA Intelligence Index）。オープンモデルは点、その Pareto フロンティアを線で結ぶ。GPT・Claude・Gemini などクローズドのフロンティアモデルは水平点線でアンカーとして配置し、「この点はだいたいあのモデルくらい賢い」が一目で読める。

差別化の根拠と既存サイトとの比較は `docs/prior-art.md` を参照。

## 状態

現時点で repo に入っているのは仕様ドキュメント・規約・プロジェクト骨格のみで、動くコードは未実装。MVP は `docs/` 配下に分割された仕様で定義されている:

| ドキュメント | 範囲 |
|---|---|
| `docs/architecture.md` | スタック、データパイプライン、デプロイ方針 |
| `docs/data-sources.md` | AA API / HuggingFace API 調査、alias map 設計 |
| `docs/design.md` | ビジュアル言語、トークン、モーション |
| `docs/ui.md` | UI 仕様（ヘッダ・dropdown・segmented control・散布図・フィルタ） |
| `docs/framer-prompts.md` | UI モック作成に投入する Framer プロンプト本文 |
| `docs/prior-art.md` | AA, Paraplouis, WhatLLM, llm-stats, Vellum, HF 等との差分整理 |

由来: `ideabook/ideas/local-lm-frontier/` から graduate した repo（seed 期間のコードネームはそのまま）。

## リポジトリ構成

```
.github/                CI/CD workflows と PR/issue テンプレート
data/                   commit する JSON: モデルスナップ・alias マップ・オーバーライド
docs/                   ideabook から引き継いだ仕様書
git-hooks/              共有 pre-push hook（templates 由来）
public/                 そのまま配信する静的アセット
scripts/                build-data.ts（Daily Refresh、未実装）
src/
  pages/                Astro ページ
  components/           Solid コンポーネント
  lib/                  pareto / model ヘルパ
  styles/               Tailwind ベース + トークン
astro.config.mjs
tailwind.config.ts
tsconfig.json
package.json
```

## ビルド & テスト

ツールチェイン定義のみ commit 済み。MVP 実装後の運用は:

```bash
npm install
npm run dev        # Astro ローカル dev server
npm run refresh    # scripts/build-data.ts: AA + HF → data/models.json
npm run build      # dist/ への静的ビルド
# デプロイは GitHub Actions (.github/workflows/deploy.yml) 経由
```

pre-push hook（フォーマッタ・lint）:

```bash
git config core.hooksPath git-hooks
```

## 規約

[`penta2himajin/templates`](https://github.com/penta2himajin/templates) のパターンを継承:

- Conventional Commits（`feat:` / `fix:` / `docs:` / `chore:` / `refactor:`）
- Branch 命名: Claude による変更は `claude/<topic>`
- Claude 署名コミットには `Co-Authored-By: Claude <noreply@anthropic.com>` trailer
- 跨セッションの長期 workstream は `session-handoff` ラベル付き GitHub issue。プロトコルは [templates/docs/handoff-protocol.md](https://github.com/penta2himajin/templates/blob/main/docs/handoff-protocol.md)

## ライセンス

MIT。詳細は `LICENSE`。
