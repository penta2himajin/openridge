# Data sources

`local-lm-frontier` のデータをどう集めるか。AA API と HF API を主軸に、欠落部分を埋める方法をまとめる。

## 1. Artificial Analysis API

### Endpoint

```
GET https://artificialanalysis.ai/api/v2/data/llms/models
Headers: x-api-key: <KEY>
```

- 認証なしで叩くと `401 {"error":"API key is required"}`
- 無料枠 1,000 req/day（CritPt は別枠で 10 req/day）
- 鍵は Insights Platform でアカウント作成して発行

### 取得できるフィールド（確認済み）

| カテゴリ | フィールド                                                                         | 用途                      |
| -------- | ---------------------------------------------------------------------------------- | ------------------------- |
| 識別子   | `id` / `name` / `slug`                                                             | DB のキー。`id` は stable |
| 作成者   | `model_creator.{id, name, slug}`                                                   | モデル族でグルーピング    |
| ベンチ   | `evaluations.artificial_analysis_intelligence_index`                               | **Y軸デフォルト**         |
| ベンチ   | `evaluations.artificial_analysis_coding_index`                                     | Y軸切替                   |
| 個別     | `evaluations.{gpqa, hle, lcr, ifbench, scicode, tau2, terminalbench_hard}`         | Y軸切替                   |
| 速度     | `median_output_tokens_per_second` / `median_time_to_first_token_seconds`           | 将来拡張用に保持          |
| 価格     | `pricing.{price_1m_blended_3_to_1, price_1m_input_tokens, price_1m_output_tokens}` | 将来拡張用に保持          |

### Tracked evaluations（2026-07-23 監査）

`evaluations` オブジェクトには実際には17キーが存在するが（`aime`, `aime_25`, `artificial_analysis_math_index`, `mmlu_pro`, `livecodebench`, `math_500`, `tau_banking`, `terminalbench_v2_1` を含む）、AA本体の Intelligence Index v4.1 移行に伴い一部が新モデルへの採点対象から外れている。`AA_API_KEY` で全579件（オープン339件）を取得し、2026年以降リリースのオープンモデル113件におけるカバレッジを確認した結果:

| キー                                     | オープン全体  | 2026年以降リリース | 判定                                                                        |
| ---------------------------------------- | ------------- | ------------------ | --------------------------------------------------------------------------- |
| `artificial_analysis_intelligence_index` | 337/339 (99%) | 112/113 (99%)      | 採用                                                                        |
| `artificial_analysis_coding_index`       | 102/339 (30%) | 64/113 (57%)       | 採用                                                                        |
| `gpqa`                                   | 328/339 (97%) | 112/113 (99%)      | 採用                                                                        |
| `hle`                                    | 327/339 (96%) | 112/113 (99%)      | 採用                                                                        |
| `scicode`                                | 326/339 (96%) | 112/113 (99%)      | 採用                                                                        |
| `lcr` (AA-LCR)                           | 298/339 (88%) | 112/113 (99%)      | 採用                                                                        |
| `ifbench` (IFBench)                      | 292/339 (86%) | 107/113 (95%)      | 採用                                                                        |
| `tau2` (τ²-Bench)                        | 284/339 (84%) | 106/113 (94%)      | 採用                                                                        |
| `terminalbench_hard`                     | 277/339 (82%) | 105/113 (93%)      | 採用                                                                        |
| `tau_banking` (τ³-Banking)               | 102/339 (30%) | 64/113 (57%)       | 見送り（`tau2`/`coding_index`と同一サブセットで動いておりカバレッジが弱い） |
| `terminalbench_v2_1`                     | 102/339 (30%) | 64/113 (57%)       | 見送り（同上）                                                              |
| `mmlu_pro`                               | 210/339 (62%) | 1/113 (1%)         | **不採用（停止）** — 最新採点 2026-01-04                                    |
| `livecodebench`                          | 208/339 (61%) | 1/113 (1%)         | **不採用（停止）** — 最新採点 2026-01-04                                    |
| `artificial_analysis_math_index`         | 177/339 (52%) | 1/113 (1%)         | **不採用（停止）** — 最新採点 2026-01-04                                    |
| `aime_25`                                | 177/339 (52%) | 1/113 (1%)         | **不採用（停止）** — 最新採点 2026-01-04                                    |
| `math_500`                               | 120/339 (35%) | 4/113 (4%)         | **不採用（停止・小型モデル偏重）**                                          |
| `aime`                                   | 108/339 (32%) | 0/113 (0%)         | **不採用（完全停止）** — 最新採点 2025-07-31（1年以上前）                   |

AA公式([methodology](https://artificialanalysis.ai/methodology/intelligence-benchmarking))によると、現行 Intelligence Index v4.1 は GDPval-AA v2 / τ³-Banking / Terminal-Bench v2.1 / SciCode / AA-LCR / AA-Omniscience / HLE / GPQA Diamond / CritPt で構成される。MMLU-Pro・LiveCodeBench・AIME・Math-500・AA Math Index は index から外れ新規モデルの採点も停止済み。IFBench はv4.1で index からは外れたが新モデルへの採点は継続中（AA公式リーダーボードページに明記）。

**MATHカテゴリは廃止**。AAが現在アクティブに更新している純粋な数学ベンチマークが存在しないため（`docs/ui.md` §3 参照）。次回 AA が新しい数学評価を追加・復活させた場合はこの監査を更新して再検討する。

### 取得できないフィールド（要補完）

- **パラメータ数（総/アクティブ）** ← HF API で補完
- **ライセンス** ← HF API の tags / cardData で補完
- **HF リポID** ← 手動 alias マップ（**確認済み**: AA レスポンスに `huggingface_id`, `hf_repo`, `links`, `urls`, `source` 系のフィールドは存在しない。`model_creator.slug` も AA 内部識別子で HF org とは一致しない。alias map は不可避）
- **モデル "mode" の粒度**（xhigh/high/medium 等）← AA側で別エントリになっているか要検証。なってない場合は手動分割不要、なっている場合はそのまま使える

## 2. HuggingFace API

### Endpoint

```
GET https://huggingface.co/api/models/<owner>/<repo>
（無認証可、rate limit はゆるい）
```

### 取得できるフィールド（確認済み）

```json
{
  "safetensors": {
    "parameters": { "BF16": 235093634560 },
    "total": 235093634560      // ← 総パラメータ
  },
  "config": {
    "architectures": ["Qwen3MoeForCausalLM"],
    "model_type": "qwen3_moe"  // ← MoE判定に使える
  },
  "tags": ["...", "license:mit", "fp8", ...],  // ← ライセンス抽出
  "downloads": 191503,
  "likes": ...,
  "lastModified": "...",
  "createdAt": "..."
}
```

### MoE のアクティブパラメータ

これが**本プロジェクトで一番厄介な箇所**。HF API は `safetensors.total` しか返さず、アクティブ計算はクライアント側の責務。

**方針（推奨）: ハイブリッド**

1. **手動オーバーライド優先**: `data/moe_overrides.json` に主要MoEの { repo_id → active_params } を手で書く。例:

   ```json
   {
     "deepseek-ai/DeepSeek-V3.1": { "active": 37000000000 },
     "Qwen/Qwen3-235B-A22B": { "active": 22000000000 },
     "XiaomiMiMo/MiMo-V2-Flash": { "active": 15000000000 }
   }
   ```

   50モデル程度の手動メンテで、シーンで観測されるMoEはほぼカバー可能。

2. **自動計算フォールバック**: オーバーライド未設定なら HF から `config.json` を生で取得して概算:
   - `num_experts_per_tok` × `moe_intermediate_size` × `hidden_size` (per layer) + non-expert params
   - 厳密ではないが ±10% 程度に収まれば散布図用途には十分

   **キー名と入れ子に注意**（MoE を dense と誤読する主因。推定が null を返すと呼び出し側は `total` にフォールバックし、それがそのまま dense 表示になる）:
   - per-token のルーティング数は5通りの綴りがある: `num_experts_per_tok` (DeepSeek / Qwen / Nemotron) / `num_experts_per_token` (Kimi Linear) / `top_k_experts` (Gemma 4 / DiffusionGemma) / `experts_top_k` (Motif) / `moe_top_k` (StepFun)
   - **`num_experts` / `n_routed_experts` / `moe_num_experts` は expert プールの総数**であって per-token 数ではない。取り違えると sparsity 分だけ過大評価する（Gemma 4 なら 128 vs 8）
   - マルチモーダルモデルは LLM config を wrapper の下に埋める: `text_config` (Gemma 4 / Step 3.7) / `llm_config` (Nemotron Omni) / `thinker_config.text_config` (Qwen3-Omni)。トップレベルだけ読むと routing が見つからず dense 判定になる
   - shared expert は routed expert と幅が違うことがある。`moe_shared_expert_intermediate_size` (Nemotron-H) / `shared_expert_intermediate_size` (Qwen3-Omni) / `share_expert_dim` (StepFun) があればそちら（全 shared expert の合計幅）を優先する
   - **先頭 dense 層数の綴りも割れる**: `first_k_dense_replace` (DeepSeek / Qwen) / `n_dense_first_layers` (Motif) / `dense_mlp_idx` (Thinking Machines)。StepFun は逆に **MoE 層の index を `moe_layers_enum` に列挙**するので、dense 層数はその補集合として求める（列挙が壊れていても負にならないよう `[0, L]` にクランプする）
   - Thinking Machines (Inkling) は**慣習を逆転**させ、routed expert 幅を素の `intermediate_size` に、dense 層幅を `dense_intermediate_size` に置く。`moe_intermediate_size` が無いので放置すると 975B-A41B が dense 判定になる。**`dense_intermediate_size` の有無**を条件に `intermediate_size` を routed 幅として読む（無条件に読むと全 dense モデルが MoE 扱いになる）
   - Gemma 4 は experts が dense MLP を**置き換えず併走**する（`enable_moe_block: true`、`model.safetensors.index.json` の weight map で確認済み）。この場合 `intermediate_size` は dense 層の幅ではなく常時オンの shared expert 幅

   **推定が効かない構造**: Nemotron-H 系の Mamba-2 / MoE ハイブリッドは大半の層が Mamba で、`num_hidden_layers` から attention / MoE 層数を導けない。この系統は推定を諦めて `moe_overrides.json` に実測値を置く。

   **attention 項の誤差**: 推定は attention を一律 `4·H²` で置く。MLA（`kv_lora_rank` / `q_lora_rank` を持つ DeepSeek 系・A.X-K2）では**過大**、linear-attention ハイブリッド（Solar Open2 の `linear_attn_config`）では **過小**に出る。総パラメータの再構成が `safetensors.total` とよく一致するのに active だけ公称値から 20% 以上ずれる場合はここが原因なので、モデルカードの公称 active を `moe_overrides.json` に入れる。

   **不変条件**: `active > total` は物理的にありえない（チェックポイントに無い重みは活性化できない）。推定がこれを踏んだ場合は警告を出して `total` にフォールバックする。alias が量子化・部分アップロードの repo を指してしまった場合にも効く（`safetensors.total` が過小になるため）。

3. **dense モデル**: `active = total` で確定（追加処理不要）

### モデル同定（AA ↔ HF）

AA API が HF id を返さないため手動 alias map が **唯一の同定経路**。運用方針:

- AA の `slug` をキーに、`data/hf_aliases.json` で明示的にマッピング:
  ```json
  {
    "deepseek-v3-1": "deepseek-ai/DeepSeek-V3.1",
    "qwen3-235b-a22b": "Qwen/Qwen3-235B-A22B",
    "gpt-5-5-xhigh": null // クローズドは null（HF不要）
  }
  ```
- ファイル末尾には `// missing: <slug>` のようなコメント形式で alias 未追加の AA slug を Daily Refresh ログから拾って書き溜める
- alias **未登録**（key 自体が存在しない）の場合: 警告ログのみ、その AA エントリは `data/models.json` に **載るが params=null** で散布図上は表示されない。"気づき"のチャンスを残しつつビルドは止めない
- AA 掲載のオープン重みモデル総数は数百レベルなので、手書き運用で破綻しない
- HF 検索 API でファジー推測する案もあったが、誤マッチのリスク（v3 vs v3.1, base vs instruct）が高いので **採用しない**（`HF_ORGS_BY_CREATOR` で信頼できる org に絞った検索のみ行う）

### `null` の意味と自動回復

`null` は **自動検索が公開 repo を見つけられなかった**という記録であって、恒久的な判定ではない。この分岐はオープン扱いのモデルでしか走らないため、クローズドモデルが `null` を書くことはない。

`null` を放置すると **一度検索に失敗した slug が永久に散布図から消える**。実際 `kimi-k3`（データセット中オープン最高スコア）がこれで不可視になっていた。二重の回復経路を持たせている:

1. **兄弟からの継承**: 推論エフォート違いの slug（`-high` / `-low` / `-max` / `-non-reasoning` 等）は同一チェックポイントなので、解決済みの兄弟の repo を引き継ぐ。通信ゼロ。全兄弟の repo が一致する場合のみ採用し、割れている場合は alias に明示させる
2. **再検索**: リリースから **180 日以内**なら毎回再検索する。ラボが AA 採点の数日〜数週間後に重みを公開することが多いため。この窓を過ぎても repo が無いモデル（Qwen Plus / GLM Turbo / Solar Pro 等の API 専用ティア）は再試行しない

**日付ピン付き slug（`-0424` / `-0731`）は継承しない**。これらは別チェックポイントであり、AA が日付で slug を分けている意図そのものが「別物」だから。`deepseek-v4-pro`（0813、重み未公開）が 4 月版の repo を拾わないのはこの規則による。

### `safetensors.total` が読めない repo

重みは公開されているのに HF が `safetensors.total` を埋めないケースがある。`fetchHfTotal` はこの値だけを見るので、alias が正しくても params が取れない。実例:

- **Mistral**: `consolidated-*.safetensors` という独自レイアウトで shard する（`Mistral-Large-3-675B-Instruct-2512`、`Pixtral-Large-Instruct-2411`）。`config.json` も無く、MoE 設定は `params.json` に入るので active 推定も効かない。BF16 / NVFP4 の派生 repo も同じレイアウトなので乗り換え先が無い
- **safetensors 以前のモデル**: `deepseek-llm-67b-chat` は `pytorch_model-*.bin` のみ

この3件は `manual_params.json` に公称値を置いて解決している（Mistral Large 3 は公式カードの 675B / 41B active、Pixtral Large は 124B、DeepSeek LLM 67B は 67B）。**重みが公開されているからこそ許される手当**であり、未公開モデルに公称値を入れる口実にはならない（下記「掲載方針」）。

なお `manual_params.json` が効くと HF 解決自体がスキップされるので、これらは `hfId` が null のままになりツールチップの HF リンクが出ない。既存69件の手動エントリと同じ挙動。

### 量子化のみが公開されている場合

`gemma-3n-e4b-preview-0520`（AA 名 `Gemma 3n E4B Instruct Preview (May '25)`）は、公開されているのが `google/gemma-3n-E4B-it-litert-preview` の **int4 LiteRT `.task` バンドル1個だけ**で、BF16 チェックポイントが無い。`docs/ui.md` の「quantization 違いは扱わない・FP16/BF16 ベースラインのみ」に従い載せない。6月正式版の `gemma-3n-e4b` は別 AA エントリとして解決済みなので、この系統が散布図から消えるわけではない。

### 掲載方針: 公開重みが無いモデルは載せない

**AA が open-weights に分類していても、実際にダウンロードできる重みが無いモデルは散布図に載せない。** params を推測して点を打つことも、公称値だけを手で `manual_params.json` に入れることもしない。本サイトは「self-host できるモデル」の Pareto フロンティアであり、動かせないモデルが frontier を占めると指標そのものが嘘になる。

該当するのは主に3類型:

- **API 専用ティア**: Qwen Plus / Omni、GLM Turbo、Solar Pro、Mistral Medium / Large、Doubao など。AA は API 経由で採点できるので open 側に並ぶが、重みは配布されていない
- **未公開のフラッグシップ**: Meta の Muse Spark 系（1.2 / 1.1 / 無印）は AA 上 II 56.8 / 53.2 / 44.3 だが、`meta-models` org には Muse Glimmer しか無く HF 全体を検索しても repo が無い
- **同一 repo を上書きされた別チェックポイント**: `Step 3.5 Flash 2603`（AA slug `step-3-5-flash`、2026-04-02）は、`stepfun-ai/Step-3.5-Flash` の commit 履歴上 2026-02 以降 重みの更新が無く（3月の commit は config と eval 結果のみ）、公開されているのは 0202 版。スコアも 0202 entry と実際に食い違う（HLE 0.211 vs 0.245、AA-LCR 0.48 vs 0.603）ので、2603 の repo として 0202 の repo を alias するのは誤り

これらは alias を `null` のまま放置するのが正しい状態であり、`params=null` で散布図から外れる挙動は**バグではなく仕様**。逆に「repo は実在するのに解決できていない」ケース（org 未登録・名前不一致・180日窓切れ）は直す対象で、両者を混同しないこと。

## 3. クローズドモデル（アンカー線）

- AA API はクローズドも返すので、それを横線データとして抽出
- `pricing` の input/output 価格は保持しておく（将来 "$ per intelligence" 軸を作りたくなったとき用）
- `mode` 粒度: AA 上で別エントリになっていれば自動で別線として扱える。要 dryrun 検証

## 4. データの新鮮さ

- GH Actions の cron: 日次（UTC 04:00 想定）
- diff があれば commit → push トリガで GH Pages に再デプロイ
- 取得失敗時は前回 JSON をそのまま保持（落ちないことを優先、リトライ機構なし）
- 副産物として **git 履歴がそのままモデル指標の時系列データ** になる（将来 "frontier 推移" ビューを作るための無料の素材）

## Open

- HF の安定したライセンス抽出: `tags` の `license:*` プレフィックスで取れるが、`cardData.license` の方が信頼できそう。比較してどちらをcanonicalにするか決める。
- AA API の "mode" 粒度の実データ確認（鍵を取って dryrun する必要あり）
- パラメータ非公開のオープン重みモデル（極まれ）の扱い
