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

| カテゴリ | フィールド | 用途 |
|---|---|---|
| 識別子 | `id` / `name` / `slug` | DB のキー。`id` は stable |
| 作成者 | `model_creator.{id, name, slug}` | モデル族でグルーピング |
| ベンチ | `evaluations.artificial_analysis_intelligence_index` | **Y軸デフォルト** |
| ベンチ | `evaluations.artificial_analysis_coding_index` | Y軸切替 |
| 個別 | `evaluations.{gpqa, hle, lcr, ifbench, scicode, tau2, terminalbench_hard}` | Y軸切替 |
| 速度 | `median_output_tokens_per_second` / `median_time_to_first_token_seconds` | 将来拡張用に保持 |
| 価格 | `pricing.{price_1m_blended_3_to_1, price_1m_input_tokens, price_1m_output_tokens}` | 将来拡張用に保持 |

### Tracked evaluations（2026-07-23 監査）

`evaluations` オブジェクトには実際には17キーが存在するが（`aime`, `aime_25`, `artificial_analysis_math_index`, `mmlu_pro`, `livecodebench`, `math_500`, `tau_banking`, `terminalbench_v2_1` を含む）、AA本体の Intelligence Index v4.1 移行に伴い一部が新モデルへの採点対象から外れている。`AA_API_KEY` で全579件（オープン339件）を取得し、2026年以降リリースのオープンモデル113件におけるカバレッジを確認した結果:

| キー | オープン全体 | 2026年以降リリース | 判定 |
|---|---|---|---|
| `artificial_analysis_intelligence_index` | 337/339 (99%) | 112/113 (99%) | 採用 |
| `artificial_analysis_coding_index` | 102/339 (30%) | 64/113 (57%) | 採用 |
| `gpqa` | 328/339 (97%) | 112/113 (99%) | 採用 |
| `hle` | 327/339 (96%) | 112/113 (99%) | 採用 |
| `scicode` | 326/339 (96%) | 112/113 (99%) | 採用 |
| `lcr` (AA-LCR) | 298/339 (88%) | 112/113 (99%) | 採用 |
| `ifbench` (IFBench) | 292/339 (86%) | 107/113 (95%) | 採用 |
| `tau2` (τ²-Bench) | 284/339 (84%) | 106/113 (94%) | 採用 |
| `terminalbench_hard` | 277/339 (82%) | 105/113 (93%) | 採用 |
| `tau_banking` (τ³-Banking) | 102/339 (30%) | 64/113 (57%) | 見送り（`tau2`/`coding_index`と同一サブセットで動いておりカバレッジが弱い） |
| `terminalbench_v2_1` | 102/339 (30%) | 64/113 (57%) | 見送り（同上） |
| `mmlu_pro` | 210/339 (62%) | 1/113 (1%) | **不採用（停止）** — 最新採点 2026-01-04 |
| `livecodebench` | 208/339 (61%) | 1/113 (1%) | **不採用（停止）** — 最新採点 2026-01-04 |
| `artificial_analysis_math_index` | 177/339 (52%) | 1/113 (1%) | **不採用（停止）** — 最新採点 2026-01-04 |
| `aime_25` | 177/339 (52%) | 1/113 (1%) | **不採用（停止）** — 最新採点 2026-01-04 |
| `math_500` | 120/339 (35%) | 4/113 (4%) | **不採用（停止・小型モデル偏重）** |
| `aime` | 108/339 (32%) | 0/113 (0%) | **不採用（完全停止）** — 最新採点 2025-07-31（1年以上前） |

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
     "Qwen/Qwen3-235B-A22B":      { "active": 22000000000 },
     "XiaomiMiMo/MiMo-V2-Flash":  { "active": 15000000000 }
   }
   ```
   50モデル程度の手動メンテで、シーンで観測されるMoEはほぼカバー可能。

2. **自動計算フォールバック**: オーバーライド未設定なら HF から `config.json` を生で取得して概算:
   - `num_experts_per_tok` × `moe_intermediate_size` × `hidden_size` (per layer) + non-expert params
   - 厳密ではないが ±10% 程度に収まれば散布図用途には十分

3. **dense モデル**: `active = total` で確定（追加処理不要）

### モデル同定（AA ↔ HF）

AA API が HF id を返さないため手動 alias map が **唯一の同定経路**。運用方針:

- AA の `slug` をキーに、`data/hf_aliases.json` で明示的にマッピング:
  ```json
  {
    "deepseek-v3-1":    "deepseek-ai/DeepSeek-V3.1",
    "qwen3-235b-a22b":  "Qwen/Qwen3-235B-A22B",
    "gpt-5-5-xhigh":    null   // クローズドは null（HF不要）
  }
  ```
- ファイル末尾には `// missing: <slug>` のようなコメント形式で alias 未追加の AA slug を Daily Refresh ログから拾って書き溜める
- alias **未登録**（key 自体が存在しない）の場合: 警告ログのみ、その AA エントリは `data/models.json` に **載るが params=null** で散布図上は表示されない。"気づき"のチャンスを残しつつビルドは止めない
- AA 掲載のオープン重みモデル総数は数百レベルなので、手書き運用で破綻しない
- HF 検索 API でファジー推測する案もあったが、誤マッチのリスク（v3 vs v3.1, base vs instruct）が高いので **採用しない**

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
