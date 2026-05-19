# UI specification

「ミニマル」を本気で守る。AAより**情報を減らす**ことが価値。ただし切替は素早く、状態の遷移は気持ちよく。

## 1. レイアウト

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ridge   Index: [AA Intelligence Index ▾]  ◤Active│Total│Compare◢   ⓘ │ ← header (56px)
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┊┄┄┄┄┄┄┄┄┄┄┄┄ GPT-5.5 (xhigh) ┄┄┄┄┄┄┄┄┄┄┄┄┄┄                          │ ← クローズド横線
│   ┊                                                                      │
│   ┊┄┄┄┄┄┄┄┄┄┄┄┄ Claude Opus 4.7 (max) ┄┄┄┄┄┄                            │
│   ┊                                                                      │
│   ┊             ●━━━━━━●━━━━━━●                                          │ ← Pareto frontier
│   ┊         ●          (open)                                            │
│   ┊                                                                      │
│   ┊   ○  ○                                                               │ ← non-frontier (薄)
│   ┊                                                                      │
│   └─────────────────────────────────────────────                X: active params (log)
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│  [Apache/MIT] [<10B] [<30B] [reasoning] [vision]                         │ ← chip filters (48px)
└──────────────────────────────────────────────────────────────────────────┘
```

`ⓘ` ボタンで「データソース・更新時刻・methodology」のモーダルを出す。

## 2. ヘッダ要素の詳細

ヘッダは4要素のみ。左から:

### 2.1 ブランドマーク `ridge`

- Geist Mono lowercase 16px、tracking -0.02em
- 色は `--fg-default`
- クリックで現状の view state を保ったまま `/` にナビゲート（履歴ノイズ最小）

### 2.2 Index dropdown — Y軸ベンチマーク選択

ラベル `Index:` を Geist Mono 11px small caps、`--fg-muted` で前置:

```
Index: [AA Intelligence Index ▾]
```

- トリガ: ラベル+選択中ベンチ名+chevron。padding 4px 8px、border-radius 6px、idle 背景なし、hover で `--bg-elevated`
- クリックで dropdown 展開（後述）

### 2.3 X軸 segmented control — Active / Total / Compare

ラベル無し。3単語が自明:

```
◤ Active │ Total │ Compare ◢
```

- 外周コンテナ: 高さ 32px、1px border `--fg-subtle`、border-radius 8px、内部背景なし
- 仕切り線なし（slide pill の視覚を邪魔する）
- 選択中 pill: `--bg-elevated` 塗り、border-radius 6px、内側 4px margin
- pill は **translateX で滑らかに移動**: `transition: transform 200ms cubic-bezier(0.4, 0, 0.2, 1)`
- 文字色: selected `--fg-default`、非選択 `--fg-muted`、hover で `--fg-default`
- 各セル幅: ラベル文字長 + 左右 14px padding
- フォント: Geist Sans 13px medium

### 2.4 Info icon `ⓘ`

- 16x16 glyph、`--fg-muted`、hover `--fg-default`
- クリックで「データソース・更新時刻・methodology」モーダル

## 3. Index dropdown の詳細

```
┌────────────────────────────────────────┐  ← container (--bg-elevated, 1px border --fg-subtle, radius 8px)
│  🔍  Search benchmarks…                │  ← 検索入力 (autofocus)
├────────────────────────────────────────┤
│  AGGREGATE                             │  ← category header (Geist Mono 11px small caps, --fg-muted)
│  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓  │  ← selected pill (--bg-high, radius 6px)
│  ┃  AA Intelligence Index           ┃  │
│  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛  │
│     AA Coding Index                    │
│     AA Math Index                      │
├────────────────────────────────────────┤
│  KNOWLEDGE & REASONING                 │
│     MMLU-Pro                           │
│     GPQA Diamond                       │
│     HLE                                │
├────────────────────────────────────────┤
│  CODE                                  │
│     LiveCodeBench                      │
│     SciCode                            │
├────────────────────────────────────────┤
│  MATH                                  │
│     AIME                               │
│     Math-500                           │
└────────────────────────────────────────┘
```

### 3.1 サイズ

- 幅 320px、最大高 480px（超えたら内部スクロール）
- 各項目: 高さ 32px、padding 6px 10px、内側左右に 6px margin（pill が container 端に触れない）

### 3.2 状態定義（**統一ルール**: 選択 = 容器より1段上の elevation）

| 状態 | 背景 | テキスト | コーナー | 補助 |
|---|---|---|---|---|
| selected | `--bg-high` | `--fg-default` | 6px rounded | — |
| hover (非選択) | `--bg-high` を 50% 透過 | `--fg-default` | 6px rounded | — |
| idle | 透明 | `--fg-muted` | — | — |
| keyboard-focused (非選択) | hover と同じ | `--fg-default` | 6px rounded | 1px outline `--accent` |
| keyboard-focused + selected | selected と同じ | `--fg-default` | 6px rounded | 1px outline `--accent` |

transition: 80ms ease on background-color。

### 3.3 検索挙動

- 入力中は **カテゴリヘッダを非表示** にしてフラット結果
- Fuzzy match on `name + category`（"code" で LiveCodeBench / SciCode 両方ヒット）
- ヒット数 0 の場合: "No benchmarks match." を `--fg-muted` で中央表示

### 3.4 キーボード

| キー | 動作 |
|---|---|
| `↑` / `↓` | focused 項目を移動（selected は変えない） |
| `Enter` | focused 項目を選択して dropdown を閉じる |
| `Esc` | 選択変更せず閉じる |
| `Tab` | 検索欄から最初の項目へ。ヘッダはスキップ |

dropdown を開いた直後の focused は **selected と同じ位置**。

## 4. 散布図の仕様

### 4.1 軸

- **Y軸**: `Index:` dropdown で選んだベンチマークスコア
  - 既定: AA Intelligence Index
  - 選択肢: §3 参照
- **X軸**: segmented control の選択に依存
  - `Active`: アクティブパラメータ (log10)
  - `Total`: 総パラメータ (log10)
  - `Compare`: アクティブパラメータ基準 (log10) + Barbell 表示

### 4.2 点・Barbell・frontier の見せ方

| Segment | 点の表現 | Frontier |
|---|---|---|
| **Active** | 単一点（active params 位置） | 1本（active 基準、実線 `--frontier`） |
| **Total** | 単一点（total params 位置） | 1本（total 基準、実線 `--frontier`） |
| **Compare** | **MoE: Barbell** (`active` 実点 → 細線 → `total` 開円)<br>**Dense: 単一点** (active=total) | 2本: active 基準 = 実線 `--frontier`、total 基準 = 同色 50% 透過の点線 |

#### Barbell 表現の詳細（Compare 時）

```
     ●━━━━━━━━━○   ← MoE: 塗り潰し円 (active) + 細線 + 開円 (total)
     ●               ← dense: 単独点
```

- 実点 (active 側): 通常 6px 塗り潰し円、frontier 上なら `--frontier`、外なら `--fg-subtle` で透明度 0.5
- 細線: `--fg-subtle`、1px、active→total を結ぶ
- 開円 (total 側): 6px、border 1px、塗り潰しなし、color は実点と同じ
- dense は active=total なので barbell が描けない → 単一点として表示
- 2本目の frontier（total 基準）は **active frontier と交差し得る** → active を z-index 上に
- hover は **MoE の場合 active 点をホバーすると barbell 全体が強調** される（細線太く、開円塗り潰し相当の色合い）

### 4.3 点の共通仕様

- **Pareto frontier 上**: 6px 塗り潰し円、`--frontier` 色、border なし
- **Frontier 外**: 同サイズ・`--fg-subtle` 色・透明度 0.25
- **モデル族（creator）別の色相分離はやめる**（実機検証で必要性が出れば revisit）
- ホバー時: 9px に拡大、80ms ease-out

### 4.4 クローズドモデル横線

- 水平点線 + 右端にラベル
- mode 別に別線（`GPT-5.5 (xhigh)`, `(high)`, `(medium)`）
- デフォルト表示は **frontier に交わる Top-3〜5本のみ**。"Show all closed" トグルで全展開
- 1px 点線、`--closed` 色
- ラベル: Geist Mono 12px、右端 padding 8px、`--closed` 色

### 4.5 ホバーカード（ツールチップ）

```
┌────────────────────────────────┐
│  Qwen3-235B-A22B               │
│  Qwen · Apache-2.0             │
│  ──────────────────────────    │
│  Active   22.0 B               │
│  Total   235.1 B               │
│  ──────────────────────────    │
│  AA Intelligence  64           │
│  GPQA 75.2 · LCB 58.1          │
│  ──────────────────────────    │
│  HF · Pareto (active)          │
└────────────────────────────────┘
```

- 幅 240px、auto height
- 背景 `--bg-elevated` 92% 透過 + `backdrop-filter: blur(12px)`
- 1px border `--fg-subtle`、border-radius 8px、padding 12px 14px
- セクション間は 1px subtle divider、10px 縦余白
- 数値は Geist Mono 13px `--fg-default`、ラベルは Geist Sans 11px small caps `--fg-muted`
- 入りは opacity 0→1 + translateY 4px→0、80ms ease-out
- 位置: カーソル追従ではなく **点の右上に固定**（jitter 防止）
- フッタ "Pareto (active)" / "Pareto (total)" / "Pareto (both)" は segment 状態で出し分け
- クリックで HF リポにジャンプ

## 5. フィルタ（チップ式）

シングルクリックでON/OFF切替、複数ON可能:

- **ライセンス**: Apache/MIT/その他オープン/商用制限あり
- **サイズ**: <10B / <30B / <100B / ≥100B（active params基準、Compare 時も active 基準で固定）
- **能力タグ**: reasoning / vision / multilingual（HF tagsから抽出可能なもの）
- **Modality**: text-only / multimodal

フィルタはURLに反映 (`?index=intelligence&view=compare&license=apache,mit&size=lt30b`) してリンク共有可。

## 6. インタラクションで**しないこと**

これがミニマル設計の本体:

- ❌ サイドバー（フィルタはチップで）
- ❌ ソート可能なテーブルビュー（散布図 + ホバーで十分）
- ❌ 価格・速度のグラフを並列表示（AAでやればいい。ここは "intelligence vs params" 専用）
- ❌ ベンチマーク詳細ページ
- ❌ レビュー・コメント・スター機能
- ❌ ログイン
- ❌ Cookie バナー以外のモーダル
- ❌ 「AIが答えます」的なチャット導線

## 7. レスポンシブ

- デスクトップ: 散布図全画面、フィルタは下部固定
- モバイル: 散布図はそのまま縦に圧縮、フィルタは底部 sticky。ホバーは tap で表示
- ヘッダ: モバイルでは Index dropdown が幅圧迫するので、ラベル `Index:` を省略
- グラフライブラリは **[Observable Plot](https://observablehq.com/plot) をベース**に、足りないインタラクション（hover アニメ、frontier 線の演出、tooltip 位置制御、barbell 描画）は D3 / 手書き SVG で重ねる。Solid から `ref` 経由で Plot 出力 DOM に介入する方針 → 詳細は [design.md](./design.md) と [architecture.md](./architecture.md)

## 8. アクセシビリティ

- 色のみに依存しない（Pareto は太さでも区別、closed は線種でも区別、barbell の active/total は形でも区別）
- キーボードで点を辿れる、segmented control / dropdown も完全キーボード対応
- prefers-color-scheme で dark/light
- dropdown とモーダルは focus trap + `aria-modal`

## Open

- 「同じモデルの quantization 違いをどう扱うか」: 表示しない（quant別の VRAM計算はcanirun.aiの守備範囲）。FP16/BF16 ベースラインのみ
- 軸切替時の URL state 同期方針（クエリパラメータ命名）
- Barbell 線が密集帯（30〜80B active 付近）で交差して読みにくくなった時の対処
- ベンチ別 frontier の計算結果キャッシュ戦略（事前計算 vs クライアント計算）
