# UI specification

「ミニマル」を本気で守る。AAより**情報を減らす**ことが価値。ただし切替は素早く、状態の遷移は気持ちよく。

## 1. レイアウト

```
┌──────────────────────────────────────────────────────────────────────────┐
│  OpenRidge  Index: [AA Intelligence Index ▾]  ◤Active│Total│Compare◢ ⓘ│ ← header (56px)
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

### 2.1 ブランドマーク `OpenRidge`

ロゴは 2 つのスパンを連結した typesetting:

- **`Open`**: Geist Sans, regular weight, `--fg-muted`
- **`Ridge`**: Geist Mono, medium weight, `--fg-default`
- サイズはどちらも 16px、tracking -0.02em
- ベースライン揃え (`items-baseline`)、空白なしで密着
- クリックで現状の view state を保ったまま `/` にナビゲート（履歴ノイズ最小）

意味分担: `Open` は修飾語（open-weight, open data）として控えめに、`Ridge` は固有名として強調する。design.md §3 の「Mono = 数値・ブランド」方針と整合し、現状の `--frontier`（lime）・`--closed`（warm orange）のアクセント色とは別レイヤとして 2 種のタイプフェイスをブランディング上のシグナルに使う。

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

### 7.1 ブレークポイント

Tailwind デフォルトを踏襲:

- `< 640px` (sm-) = **モバイル** （タッチ前提、片手親指リーチ想定）
- `≥ 640px` = **デスクトップ／タブレット** （マウス/トラックパッド前提）

中間タブレットを独立扱いしない（情報密度の核は変わらないので 2-tier で十分）。

### 7.2 タップターゲット

WCAG 2.5.5 (AAA) は 44×44 CSS px、Apple HIG が 44pt、Material が 48dp を要求。本サイトはモバイル時に次へ昇格:

| 要素 | デスクトップ | モバイル |
|---|---|---|
| segmented control セル | 32px tall | **40px tall** |
| dropdown 項目 | 32px tall | **44px tall** |
| フィルタ chip | 28px tall | **36px tall** |
| ⓘ icon hit-area | 16×16 視覚 / 24×24 hit | **44×44 hit** |
| 散布図の点 hit-area | 9px visible / 16px hit | **6px visible / 28px hit** (透明 hit-circle 重畳) |

視覚サイズは保ち、SVG/HTML の `pointer-events` 領域だけを広げて密集帯のタップを担保する。

### 7.3 ヘッダ

- デスクトップ: 1 行 (brand · Index dropdown · Active/Total/Compare · ⓘ)
- モバイル: 1 行のまま。`Index:` プレフィックスを省略、segmented control のセル幅を auto から `flex-1` に切替えてスペースに収まるようにする
- 360px 未満の極小幅: 2 行レイアウト
  - row 1: brand + ⓘ
  - row 2: Index dropdown (flex-1) + segmented control (flex-1)
- 安全領域: `padding-top: env(safe-area-inset-top)` を `<body>` ではなく header に当てる（chart 領域を侵食させない）

### 7.4 Index dropdown のモバイル変形

デスクトップ仕様の 320px 浮動パネル（§3）は狭い画面では収まらない。モバイルでは **ボトムシート** に切り替え:

- スクリーン下端から slide-up、高さは viewport の 60-80%
- 上端に grab handle (36×4px、`--fg-subtle`、center)
- 検索入力は上部に sticky、項目リストはスクロール
- 背景に半透明オーバーレイ (`--bg-base` 60%)
- 閉じる: handle を下スワイプ / オーバーレイをタップ / Esc
- focus trap + `aria-modal="true"`
- アニメ: 240ms `cubic-bezier(0.4, 0, 0.2, 1)` で translateY

実装方針: Material 3 / iOS の bottom sheet パターンを踏襲し、独自の見た目を作らない（テンプレ感ではなく "OS なじみ" のほうがミニマル文脈と合致）。

### 7.5 散布図

#### 7.5.1 アスペクト比

- デスクトップ: 残り viewport を全部使う (横長になりがち)
- モバイル: 概ね 1:1 (ヘッダ + チップ行を引いた残り)。極端な縦長を防ぐため、`min-height: 360px` を確保

#### 7.5.2 X 軸ティック（log scale）

- デスクトップ: 主要桁 (10⁹, 10¹⁰, 10¹¹) + 中間 (3×) も薄く表示
- モバイル: **主要桁のみ**。中間ティックは描かない
- ラベル書式: `1B / 10B / 100B / 1T`（フル数字は出さない）

#### 7.5.3 Y 軸ティック

- デスクトップ: 主要 5-7 個
- モバイル: 主要 4 個前後（密度を下げる）
- ラベルは数値そのまま (`24.5`, `60`)

#### 7.5.4 closed アンカー横線

- 線自体は同じ描画
- 右端ラベル:
  - デスクトップ: `GPT-5.5 (xhigh)` フル表記
  - モバイル: `GPT-5.5` のみ。mode は省略し、タップで tooltip 展開
  - 字サイズ: デスクトップ 12px / モバイル 10px
- 線が密集して読みにくいとき: default は frontier-touching Top 3 のみ、"Show all closed" トグルで全展開（§4.4 既定）。モバイルではこの絞り込みをより強く（Top 3 固定、トグルで Top 8）

### 7.6 ツールチップ

- デスクトップ: 点の右上に固定位置（§4.5 既定）
- モバイル:
  - **タップで表示**、点の真上ではなく **chart 上端に anchor** （親指で隠さない）
  - 幅は `min(280px, viewport - 32px)`
  - 入りは下から 8px slide + opacity、120ms ease-out
  - 閉じる: chart 内の空白をタップ / 別の点をタップで切替 / Esc / 4 秒タイムアウト（任意）
  - 影で chart を覆い隠さない（半透明 + backdrop-blur のまま）

### 7.7 フィルタチップ行

- デスクトップ: wrap or 1 行で全 chip
- モバイル: 1 行に固定し、横スクロール（`overflow-x-auto`、scroll-snap なし）
- chip 間 gap: 8px (mobile) / 12px (desktop)
- 下端 padding に `env(safe-area-inset-bottom)` 加算

### 7.8 オリエンテーション

- portrait: §7.5.1 の縦長アスペクト
- landscape on phone (< 640px width のまま): desktop ルール適用。height < 480px の場合は header の 2 行を強制せず単行を保つ（縦余裕を確保）

### 7.9 グラフライブラリ

- 描画ベースは **[Observable Plot](https://observablehq.com/plot)**
- 足りない部分 — hover/tap アニメ、frontier 線の演出、tooltip 位置制御、barbell 描画、透明 hit-circle — は **D3 / 手書き SVG** を上に重ねる
- Solid から `ref` 経由で Plot 出力 DOM に介入する方針
- ResizeObserver で viewport 変化に再描画追従 (debounce 80ms)
- 詳細は [design.md](./design.md) と [architecture.md](./architecture.md)

### 7.10 参照したベストプラクティス

統合した外部知見:

- [Material Design 3 — Bottom sheets](https://m3.material.io/components/bottom-sheets/overview): モバイルでの dropdown は bottom sheet 化
- [Smashing — Accessible Tap Target Sizes](https://www.smashingmagazine.com/2023/04/accessible-tap-target-sizes-rage-taps-clicks/): スクリーン下部は 12mm / 上部は 11mm 推奨、内部は 7mm まで許容
- [Flourish — Mobile-friendly visualizations](https://help.flourish.studio/article/90-how-to-create-mobile-friendly-visualizations): モバイル用に別アスペクト比を持つ
- WCAG 2.5.5 (AAA): 44×44 CSS px のタップ標的
- [BoundEv — Mobile chart design best practices](https://www.boundev.com/blog/mobile-data-visualization-design-guide): 重要データの優先表示、サムリーチゾーンに置く

これらと「§6: しないこと」（サイドバー禁止・テーブルビュー禁止・パラレル別チャート禁止）が衝突しないよう、bottom sheet と horizontal-scroll chip 行のみを追加採用。tab bar / FAB / pull-to-refresh などモバイル流儀の汎用 UI は採用しない。

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
