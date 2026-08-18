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

   **attention 項の誤差**: 推定は attention を一律 `4·H²` で置く。MLA（`kv_lora_rank` / `q_lora_rank` を持つ DeepSeek 系・A.X-K2）では**過大**、linear-attention ハイブリッド（Solar Open2 の `linear_attn_config`、Qwen3.5 以降の `full_attention_interval`）では **過小**に出る。加えて `tie_word_embeddings: false` のモデルでは **lm_head を数えていない**（embed のみ計上）。総パラメータの再構成が `safetensors.total` とよく一致するのに active だけ公称値からずれる場合はここが原因なので、実測値を `moe_overrides.json` に入れる。

   **実測値の求め方**: モデルカードの `A<N>B` は丸め値で、実測との差は無視できない（Qwen3.5-35B-A3B は実測 3.455B で公称 +15%、LFM2-8B-A1B は実測 1.558B で公称 +56%）。正確に出すには **safetensors のシャードヘッダから全テンソル形状を読む**のが確実:
   1. `model.safetensors.index.json` で shard 一覧を取る
   2. 各 shard の先頭 8 バイト（little-endian の header 長）と、続く JSON ヘッダを Range リクエストで取得する。ヘッダに `{name: {dtype, shape, data_offsets}}` が入っている
   3. 全 shape の積を合計し、`safetensors.total` と**一致することを確認**する（一致しなければ数え漏らしがある）
   4. `active = 非 expert 重み + routed experts × experts_per_tok / num_experts + embed + lm_head`

   vision tower と MTP ヘッドは除く。この定義で Qwen の公称 `A<N>B` が再現できる（397B-A17B → 17.349B、2.4T-A95B → 95.288B）。

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

2026-08-18 に非表示だった28件を全数監査した結果、次の5類型に整理できた。**類型ごとに取るべき対応が違う**ので、ひとまとめに「重みが無い」と記録しないこと。

#### 1. API 専用ティア — 恒久的に出ない

Qwen Plus / Omni、GLM Turbo、Solar Pro / Mini、Mistral Medium / Saba / Devstral Medium、Doubao Seed Code、MiMo-V2-Omni、Agnes 2.5 Pro Alpha (Sapiens AI)、Celeris-1、LFM 40B。AA は API 経由で採点できるので open 側に並ぶが、ベンダーが重みを配布していない。

Upstage が分かりやすい証拠を出している: `upstage/solar-pro3-tokenizer` / `solar-pro2-tokenizer` / `solar-1-mini-tokenizer` と、**トークナイザだけ**を公開している。重みを出す気が無いモデルに対する典型的な運用。LFM 40B も同種で、LiquidAI が重みを公開し始めたのは LFM2 世代から（`LiquidAI/LFM-40B` は 404、org には LFM2 系のみ）。

alias を `null` のまま放置するのが正しい状態。再試行しても意味が無い。

#### 2. 公開予告済み・未公開 — 窓が効くので放置しない

Meta の Muse Spark 系（1.2 / 1.1 / 無印、AA 上 II 56.8 / 53.2 / 44.3）。**上の API 専用ティアと混同しないこと。**

Meta は 2026-04 に Llama を退役させて Muse をプロプライエタリで出したが、2026-08-10 に Muse Glimmer 30B を Apache 2.0 で公開すると同時に、**Muse Spark 1.2 の重みも「数週間以内」に公開すると発表した**（最終日程・ライセンスとも未定）。AA 側は現時点で "proprietary. The model weights are not publicly available." のまま。

つまりこれは §「`null` の意味と自動回復」の 180 日再試行窓がまさに想定しているケース。`meta-models` は org 登録済みなので、Meta が publish すれば追加作業なしで解決する。ただし**無印 Muse Spark（2026-04-08）は 2026-10 上旬に窓を抜ける**ので、それ以降に公開された場合は手で alias を入れる必要がある。

#### 3. 同一 repo を上書きされた別チェックポイント

`Step 3.5 Flash 2603`（AA slug `step-3-5-flash`、2026-04-02）。`stepfun-ai/Step-3.5-Flash` の commit 履歴上 2026-02 以降 重みの更新が無く（3月の commit は config と eval 結果のみ）、公開されているのは 0202 版。スコアも 0202 entry と実際に食い違う（HLE 0.211 vs 0.245、AA-LCR 0.48 vs 0.603）ので、2603 の repo として 0202 の repo を alias するのは誤り。**0202 版のみを掲載する**のが正しい状態。

#### 4. 量子化のみが公開されている

`gemma-3n-e4b-preview-0520`（AA 名 `Gemma 3n E4B Instruct Preview (May '25)`）は、公開されているのが `google/gemma-3n-E4B-it-litert-preview` の **int4 LiteRT `.task` バンドル1個だけ**で、BF16 チェックポイントが無い。`docs/ui.md` の「quantization 違いは扱わない・FP16/BF16 ベースラインのみ」に従い載せない。

**6月正式版の repo に alias してはいけない。** 両者は別々に採点されており、スコアが実際に違う（II 4.2 vs 1、GPQA 0.278 vs 0.296、さらに正式版だけが Coding Index / AA-LCR / IFBench / τ² / TB-Hard を持つ）。alias すると preview のスコアを正式版の重みに紐づけることになり、しかも preview の方が II が高いので実在しない点を描く。類型3と同じ誤りである。正式版 `gemma-3n-e4b` は別 AA エントリとして解決済みなので、この系統が散布図から消えるわけではない。

#### 5. 公式配布が終了した／Hub に存在しない旧モデル — `excluded.json` で除外

上の4類型は `params=null` で snapshot に残すが、この類型だけは **`data/excluded.json` に入れて models.json から落とす**。理由は、残すと「オープンなのに解決に失敗している」ように読めてしまい、直す対象と見分けがつかなくなるため。

- `dbrx`: 2024-03 にオープンライセンスで公開されたが、`databricks` org ごと HF から消滅（`dbrx-instruct` / `dbrx-base` とも 404、org 一覧も空）
- `llama-65b`: LLaMA 1。研究ライセンスの申請配布で、Hub に Meta 公式 repo が存在したことがない（検索に出る `upstage/llama-65b-instruct` は他社 fine-tune）

`excluded.json` はこの用途に限る。API 専用ティアをここに入れてはいけない — あちらは `null` という記録自体が「検討した上で載せない」ことの証跡になっている。

---

類型1〜4は alias を `null` のまま放置するのが正しい状態であり、`params=null` で散布図から外れる挙動は**バグではなく仕様**。逆に「repo は実在するのに解決できていない」ケース（org 未登録・名前不一致・180日窓切れ）は直す対象で、両者を混同しないこと。

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
