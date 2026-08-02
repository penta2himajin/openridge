# Prior art

`local-lm-frontier` の位置づけを既存サイトとの差分で記録する。

## ⚠ 重要な発見（v2 調査）

当初は「AAにはparam軸の効率比較がない」と仮定していたが、これは**誤り**。AAの `/models/open-source` ページに **"Intelligence vs Active Parameters"** と **"Intelligence vs Total Parameters"** の散布図が既に存在し、MoEのアクティブパラメータも明示的にトラックされている（"For Mixture of Experts (MoE) models, a routing mechanism selects a subset of experts per token, resulting in fewer active than total parameters. Dense models use all parameters, so active equals total."）。

→ 差別化レーンは当初想定より狭い。残るユニーク要素は次の3点:

1. **明示的なParetoフロンティア線**（AAは "most attractive quadrant" のハイライトだけで、フロンティア上の点を結ぶ線は引いていない）
2. **クローズドモデルのアンカー横線**（AA該当ページはオープン専用）
3. **1画面・他要素を削り切ったミニマルUI**（AAは周りに表・他チャート・provider別データが密集）
4. **Y軸の即座切替**（GPQA / LCB / AIME 等にワンクリック）

## カテゴリA — Paretoフロンティア特化（**コスト軸**派）

param軸でやってる既存例は調査範囲では**見つからなかった**。全てコスト軸。

### [Paraplouis/llm-pareto-frontier](https://github.com/Paraplouis/llm-pareto-frontier)

最も思想が近い既存実装。

- 軸: LM Arena ELO (Y) vs API cost (X)
- 更新: 手動 `./refresh.sh` を走らせて commit、GH Actions が deploy
- 対象: open/closed 両方
- MoE 区別: ドキュメントに明記なし

### [bsamek/pareto-llm](https://github.com/bsamek/pareto-llm) / [michaelshi.me/pareto/](https://michaelshi.me/pareto/) / [modeldepot.io](https://modeldepot.io/)

同趣旨の個人/小規模プロジェクト群。LessWrong に "LLM Pareto Frontier But Live" の議論記事あり。

## カテゴリB — 価格 vs 性能 scatter（Pareto線は明示せず）

### [WhatLLM.org](https://whatllm.org/explore)

- 925モデル/54プロバイダ。quality-vs-price scatter
- フィルタ豊富（creator / open-source / "best value" / "fastest"）
- "Best Local LLM" 専用ランキングあり
- MoE active params の扱いは明記なし

### [llm-stats.com](https://llm-stats.com/)

- AAデータを流用したテーブル中心+ scatter補助
- coding-arena / GPQA Diamond / throughput / latency / pricing

## カテゴリC — リーダーボード（テーブル主体）

| サイト                                                                                                                 | 特徴                                               |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| [Vellum LLM Leaderboard](https://www.vellum.ai/llm-leaderboard) / [Open版](https://www.vellum.ai/open-llm-leaderboard) | 表形式、フィルタ多め、商用色強い                   |
| [Onyx.app](https://onyx.app/open-llm-leaderboard)                                                                      | bar chart hover中心                                |
| [DeployBase](https://deploybase.ai/articles/open-source-llm-leaderboard)                                               | self-hosting cost付き                              |
| [Open WebUI leaderboard](https://openwebui.com/leaderboard)                                                            | 実使用ベース（Open WebUI内ユーザーの利用統計）     |
| [HF Open LLM Leaderboard v2](https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard)                  | IFEval/BBH/MATH/GPQA/MUSR/MMLU-Pro。クローズドなし |

## カテゴリD — ハードウェア適合（canirun.aiの仲間）

副次機能として参考にする価値はあるが、**主体にはしない**（このプロジェクトの守備範囲外）。"詳細を見る" でこれらに外部リンクするのが筋。

| ツール                                                                                           | 特徴                                             |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| [canirun.ai](https://www.canirun.ai/)                                                            | WebGPUで自動マシン判定 + S〜Fグレード、~60モデル |
| [NyxKrage LLM VRAM Calculator](https://huggingface.co/spaces/NyxKrage/LLM-Model-VRAM-Calculator) | **コミュニティ標準**。HFモデルID入力 + quant指定 |
| [apxml.com VRAM Calculator](https://apxml.com/tools/vram-calculator)                             | Nvidia + Apple Silicon、quant別、TPS推定         |
| [SelfHostLLM](https://selfhostllm.org/) ([リポ](https://github.com/erans/selfhostllm))           | 同時リクエスト数まで計算、OSS                    |
| [LocalLLM.in VRAM Calculator](https://localllm.in/blog/interactive-vram-calculator)              | 同類、Llama/Qwen/Mixtral中心                     |
| [Onyx GPU/VRAM Checker](https://onyx.app/llm-hardware-requirements)                              | Onyx系列のツール                                 |

## カテゴリE — キュレーション記事（手動更新の比較表）

- [Sebastian Raschka: A Dream of Spring for Open-Weight LLMs](https://magazine.sebastianraschka.com/p/a-dream-of-spring-for-open-weight)
- [till-freitag.com / 25+ Open-Source LLMs Compared](https://till-freitag.com/en/blog/open-source-llm-comparison)
- [ComputingForGeeks Open Source LLM Comparison](https://computingforgeeks.com/open-source-llm-comparison/)
- [DataCamp 11 Top Open-Source LLMs](https://www.datacamp.com/blog/top-open-source-llms)

更新は手動で年1〜数回程度。鮮度では自動ビルド型サイトに敵わない。

---

## 差別化マトリクス（更新版）

|                    | AA      | AA open-source page | canirun | Paraplouis | WhatLLM | llm-stats | Vellum | HF v2 | **local-lm-frontier** |
| ------------------ | ------- | ------------------- | ------- | ---------- | ------- | --------- | ------ | ----- | --------------------- |
| Param軸 scatter    | ❌      | ✅                  | ❌      | ❌         | ❌      | △         | ❌     | △     | ✅                    |
| 明示 Pareto 線     | ❌      | ❌ (quadrantのみ)   | ❌      | ✅         | ❌      | ❌        | ❌     | ❌    | ✅                    |
| クローズドアンカー | △       | ❌ (open専用)       | ❌      | ❌         | ❌      | △         | △      | ❌    | ✅                    |
| MoE active params  | ❌(API) | ✅                  | ✅      | ?          | ?       | △         | △      | △     | ✅                    |
| Y軸即時切替        | ❌      | ❌                  | ❌      | ❌         | △       | △         | ❌     | △     | ✅                    |
| 1画面で完結        | ❌      | △                   | △       | ✅         | ❌      | ❌        | ❌     | △     | ✅                    |
| 自動データ更新     | ✅      | ✅                  | △       | ❌ (手動)  | ✅      | ✅        | ✅     | ✅    | ✅                    |
| VRAM/hw適合        | ❌      | ❌                  | ✅      | ❌         | ❌      | ❌        | ❌     | ❌    | ❌ (意図的)           |

「**param軸 × 明示Pareto線 × クローズドアンカー × ミニマル**」の組み合わせは依然空白。ただし**個々の要素は他所にある**ので、組み合わせの妙とUI洗練が勝負どころ。

---

## 各サイトの収益化（ユーザー要望 v3 調査）

将来 graduate して公開する場合の参考に。

| サイト                         | モデル                                             | 詳細                                                                                                                                                                                        |
| ------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Artificial Analysis**        | 公開情報なし。Insights Platform / 法人サービス想定 | サイト・APIは無料（1k req/day）。pricing/about ページに金額情報なし。実態は AIラボや企業向けのカスタム評価データ販売/コンサルが収益源と推測される（業界における同類サービスの典型パターン） |
| **canirun.ai**                 | 不明（ホビープロジェクト推定）                     | 広告・課金導線が見当たらない                                                                                                                                                                |
| **WhatLLM.org**                | アグリゲータSEO / アフィリエイト推定               | 925モデルを並べてプロバイダAPIへ送客する構造。明示的な課金プランなし                                                                                                                        |
| **llm-stats.com**              | Free。アフィリエイト可能性ありと明記               | "creators / freelancers / digital businesses" 向けの無料サイト                                                                                                                              |
| **Vellum**                     | **リードジェネレーション**                         | リーダーボードは集客装置。本体は Pro $500/月、Enterprise 数万ドル/年規模のAI開発プラットフォーム                                                                                            |
| **Onyx**                       | リードジェネレーション                             | OSS の Onyx エンタープライズAIプラットフォームへ送客                                                                                                                                        |
| **DeployBase**                 | リードジェネレーション                             | self-hosting サービスへの送客                                                                                                                                                               |
| **HF Open LLM Leaderboard**    | HF Hub 本体のコンテンツマーケティング              | Hub の有料プラン (Pro/Enterprise) と inference Endpoint への送客                                                                                                                            |
| **Paraplouis pareto-frontier** | 非収益（OSS）                                      | GitHub の個人プロジェクト                                                                                                                                                                   |
| **NyxKrage / SelfHostLLM**     | 非収益（OSS / HF Space）                           | 同上                                                                                                                                                                                        |
| **apxml VRAM Calculator**      | 有料コース/教材への送客                            | apxml は AI/ML 教育コンテンツが本体                                                                                                                                                         |

### 観察される収益化パターン3つ

1. **リードジェネレーション型** (Vellum / Onyx / DeployBase / HF / apxml)
   無料リーダーボード → 隣接する有料SaaS/サービスに送客。本プロジェクトでは本業の隣接サービスがないと成立しない。
2. **アグリゲータSEO + アフィリエイト型** (WhatLLM / llm-stats)
   モデル数で勝負、各プロバイダAPI へのリンクからアフィリエイト or 広告露出。本プロジェクトはミニマル方針と相性が悪い（数で勝負しないため）。
3. **非収益 / OSS** (Paraplouis / canirun / NyxKrage / SelfHostLLM)
   個人プロジェクト・hobby 運用。ホスティング無料枠で完結。**本プロジェクトの自然な初期形態**。

### 将来選択肢

graduate 後に収益化する場合のオプション（複数併用可）:

- **(a) OSS hobby のまま**: GH Pages 無料運用。自分が使うのが主目的なら最も筋がいい
- **(b) 元データ JSON 配信 API**: 同じデータを欲しい個人/小サービス向けに薄い課金（$5/月など）
- **(c) スポンサーロゴ枠**: モデルプロバイダ・GPU ベンダーの控えめロゴをツールチップに（ミニマル UI と両立可能なライン）
- **(d) GPU/ホスティング アフィリエイト**: "このモデルを動かすなら〜" 系の控えめリンク (RunPod / Lambda Labs / Vast.ai)。canirun.ai 風の hw 機能を追加する時にだけ意味が出る

優先順位は当面 (a) のみで十分。graduate 時点で見直す。

---

## 結論

- 当初仮説より差別化レーンは狭い（AA本体が param-scatter を既に提供）。それでも **「明示Pareto線 + クローズドアンカー + ミニマル1画面 + 即時Y軸切替」** の組み合わせはまだ空白。
- 競合サイトの収益化は **本業のSaaSへの送客** か **OSSホビー** の二極化。本プロジェクトは **OSSホビーとして始め、自分が使うのを第一目的にする** のが自然。
- canirun.ai 的なhw適合は副次機能として後付けする選択肢を残すが、まず核となる scatter のみで出す。
