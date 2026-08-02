# Design

> 「在り来り」を避けるための方針。実装の前にここで言語を固めてから手を動かす。

## 1. 方針（Option A 確定）

**Framer でモックアップだけ作り、実装は Astro + Solid + Observable Plot に翻訳する**。

- Framer は無料 tier で十分（公開しないので framer.website ブランディングは無関係）
- モックの目的は **配色 / タイポ / 余白 / モーション言語** を確定すること。1枚画面のスクリーン状態が3〜5パターン作れれば十分
- 実装段階に入ったら Framer を見ながら手書きで再現。Framer の HTML エクスポートは使わない（在り来り JS が混入する）

## 2. デザイン参照

「polished だが在り来りではない」帯にいる先行事例。配色・タイポ・余白の言語をここから盗む。

### 一次参照

| 出典                                                                              | 盗む要素                                                                    |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [Linear](https://linear.app)                                                      | OKLCH ベースのダーク系配色、タイポのウェイト階段、アクセントカラーの抑制    |
| [Vercel](https://vercel.com)                                                      | Geist フォント、罫線の引き方、データ表現のミニマリズム                      |
| [Resend](https://resend.com)                                                      | グラデーションを使わない polished、コントラスト管理                         |
| [Observable Plot ギャラリー](https://observablehq.com/@observablehq/plot-gallery) | チャート自体の Bostock 美学（軸・ラベル・色）                               |
| [The Pudding](https://pudding.cool)                                               | データ可視化の "見せる" 美学（ただし本件は1画面なのでナラティブは借りない） |
| [Stripe Press](https://press.stripe.com)                                          | タイポ階層、長文ではない短文の品位                                          |

### 避ける参照（在り来りの源泉）

- "Framer ルック": ダーク + 巨大タイポ + グラデブロブ + scroll fade
- "shadcn を素のまま": ボタン・カードの定型を流用すると Vercel/Next.js テンプレ感
- "Plotly デフォルト": 科学計算ツール臭。配色・フォントが20年前
- Material/Bootstrap 系の影付きカード

## 3. デザイントークン（候補）

実装に落とす前の暫定。Framer モックで詰めて確定する。

### 配色

OKLCH ベース、ダーク優先（prefers-color-scheme でライト切替）。Framer は OKLCH を直接解釈しないため、プロンプト用の hex 近似値を併記。

| トークン        | OKLCH                   | hex 近似  | 用途                                                 |
| --------------- | ----------------------- | --------- | ---------------------------------------------------- |
| `--bg-base`     | `oklch(0.18 0.01 270)`  | `#1A1B22` | ページ背景                                           |
| `--bg-elevated` | `oklch(0.22 0.01 270)`  | `#20222A` | カード・dropdown 容器・segmented control の選択 pill |
| **`--bg-high`** | `oklch(0.28 0.01 270)`  | `#2A2D34` | dropdown 内の選択 pill、tooltip hover 行             |
| `--fg-default`  | `oklch(0.96 0.005 270)` | `#F2F2F5` | 本文・選択中ラベル                                   |
| `--fg-muted`    | `oklch(0.65 0.01 270)`  | `#9A9CA3` | サブテキスト・idle ラベル                            |
| `--fg-subtle`   | `oklch(0.40 0.01 270)`  | `#58595F` | 罫線・barbell 細線・frontier 外の点                  |
| `--accent`      | `oklch(0.78 0.15 195)`  | `#4DD3C7` | キーボード focus outline、interactive 強調           |
| `--frontier`    | `oklch(0.92 0.18 145)`  | `#BEEE7E` | Pareto frontier 線・frontier 上の点                  |
| `--closed`      | `oklch(0.70 0.10 35)`   | `#D89882` | クローズドモデル横線                                 |

#### Elevation rule（重要・統一ルール）

「**選択中 = 容器より1段上の elevation**」を全UIで一貫適用:

| 容器                            | 選択 pill                                       |
| ------------------------------- | ----------------------------------------------- |
| `--bg-base` (ページ)            | `--bg-elevated` ← segmented control の選択 pill |
| `--bg-elevated` (dropdown 容器) | `--bg-high` ← dropdown 内の選択項目             |

このルールにより、横（segmented control）と縦（dropdown 選択項目）の選択表現が同じ視覚言語で揃う。

#### 色は3系統だけ

- **無彩色**（grayscale 5段）= UIシャシー
- **frontier 強調色** (`--frontier`) = Pareto 上の点と線
- **closed アンカー色** (`--closed`) = クローズド横線

これ以外の色を使わない。creator 別の色相分離は **やめる**（ノイズになる）。`--accent` は focus outline 等の interactive 状態専用で、データ表示には使わない。

### タイポ

- **本文 / UI**: [Geist Sans](https://vercel.com/font) または [Inter](https://rsms.me/inter/)
- **数値 / モノスペース**: [Geist Mono](https://vercel.com/font) または [Berkeley Mono](https://berkeleygraphics.com/typefaces/berkeley-mono/)（後者は有料、商用なら検討）
- **見出し**: 同フォントの semibold/medium で階段。display系の特殊フォントは入れない

サイズ階段（rem）: `0.75 / 0.875 / 1 / 1.125 / 1.5 / 2`。これ以上増やさない。

### 余白

8px ベースのグリッド。`--space: 0.5rem`。`gap-1` 〜 `gap-12` までの離散値で済ませる。

### モーション

- **point hover**: 80ms ease-out で透明度/サイズ変化
- **filter toggle**: 120ms ease-in-out で透明度
- **frontier 線描画**: 初回ロード時のみ 600ms ease-out で left→right stroke-dasharray アニメ
- **page transition**: なし（1ページなので不要）

派手なモーションは入れない。"気づくと動いていた" レベルに留める。

## 4. 散布図のビジュアル方針

ui.md と整合させつつ、デザイン観点で補足:

- **背景は塗らない**。`--bg-base` のまま、軸も最小限のティック表示
- **軸ラベルは隅に小さく**（"active params (log)" / "AA Intelligence Index"）。値ラベルはホバー時のみ詳細
- **Pareto 線**: 太さ 1.5px、フロンティア色、点と点の間は curveMonotoneX で滑らかに
- **frontier 外の点**: 透明度 0.25、color は `--fg-subtle`
- **frontier 上の点**: 通常時 6px、ホバー時 9px、ストロークなし
- **closed アンカー線**: 1px 点線、右端に小さいラベル。`--closed` 色
- **グリッド**: 描かない（X軸は log なので主要桁の刻みだけ）

## 5. ツールチップ

ui.md の内容を踏襲しつつ:

- **ガラス感**（`backdrop-filter: blur(12px)`）+ 半透明背景
- 影は薄く、または無し
- 入りは fade + 4px slide、80ms
- カーソル追従ではなく、点の右上に固定位置で展開（jitter 防止）

## 6. Framer モック作成の手順

Framer の AI 系機能は2系統あり、ワークフローを使い分ける:

- **Wireframer**: ページ全体の骨格を1プロンプトで生成（style-neutral）
- **Workshop** (`⌘K`): コンポーネント単位で生成、canvas のトークンを継承

実プロンプト本文は [framer-prompts.md](./framer-prompts.md) に保管。手順:

1. 新規 framer project（無料 tier）
2. **トークンを先に手動登録**（Workshop はこれを継承する）:
   - Fonts: Geist Sans / Geist Mono を upload
   - Color tokens: 上記 hex 一覧を Framer の color variable に登録
3. **Wireframer** をキャンバスで起動し、`framer-prompts.md` の Wireframer プロンプトを投入してページ骨格を生成
4. **Workshop** で個別コンポーネント生成（filter chip / index dropdown / axis segmented control / info icon / tooltip card）
5. 生成された 1 frame を 3つ複製、各状態に手動で詰める:
   - **A. Default (Active)**: segmented control = Active、frontier 線 + 点 + クローズド横線3本
   - **B. Hover with tooltip**: いずれかの frontier 上の点に tooltip card を配置
   - **C. Compare with filter**: segmented control = Compare、Apache-only chip on、Barbell + dual frontier
6. 派手なアニメは入れない（"気づくと動いていた" の最小単位だけ）
7. スクショ or Framer 共有リンクを `prototype/design-refs/` に保存し、実装時の正解として参照

### Framer に頼らず手で詰める部分

- **散布図本体**（点・Barbell・frontier 線・closed 横線）: Wireframer が生成する空 rectangle のまま放置。後で Figma で SVG モック or Observable Plot の仮レンダ画像を import
- **状態 A/B/C のフレーム複製とその差分編集**: Wireframer は単一状態しか出さないので必ず手動

## 7. 実装段階での翻訳ルール

Framer モック → Astro/Solid に翻訳する際:

- **CSS変数で配色を定義**し Tailwind の `theme.extend.colors` に紐付け
- Tailwind UI / shadcn のコンポーネントは **使わない**。テンプレ感が出る
- ボタン・チップ・ツールチップは Solid で 30行以下のコンポーネントとして自前
- Observable Plot のデフォルトを Plot 側オプション（`color`, `style`, `marks`）で上書き
- 足りない部分（hover アニメ、frontier 描画アニメ）は D3 / 生 SVG で重ねる

## Open

- フォントの最終選定（Geist が無料で安全だが、自分の手癖と合うか）
- ライトモードの色組（ダークを軸に決めて反転で済むか、別途設計が必要か）
- creator 別色相分離を**本当に**やめていいか（pareto 上に同 creator が連続したとき混乱しないか実機検証）
- モバイル時の axis ラベル/ティックの簡略化方針
