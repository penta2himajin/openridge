# Framer prompts

[design.md](./design.md) の方針 (Option A: Framer モック → Astro 手翻訳) を実行するための、Framer AI 系機能に渡す実プロンプト本文。

## 前提: トークンを先に設定

Framer の AI（Wireframer / Workshop）は canvas のトークン（フォント・色）を継承する。**プロンプトを投入する前に** 以下を Framer プロジェクトに登録しておく:

### Fonts

- **Geist Sans** (本文 / UI)
- **Geist Mono** (数値・ブランド・small caps ラベル)

### Color tokens (hex)

- `--bg-base` `#1A1B22` / `--bg-elevated` `#20222A` / `--bg-high` `#2A2D34`
- `--fg-default` `#F2F2F5` / `--fg-muted` `#9A9CA3` / `--fg-subtle` `#58595F`
- `--accent` `#4DD3C7` / `--frontier` `#BEEE7E` / `--closed` `#D89882`

詳細は [design.md §3](./design.md) を参照。

## Wireframer プロンプト（ページ骨格、1本）

ページ全体の骨格を生成。マーケティング pages 向けに最適化された Wireframer に対し、「これは tool であって marketing page ではない」と明示的に伝えることが重要。

```
Create a single-screen data visualization tool for developers and ML engineers
who self-host open-source LLMs. The screen lets them see the Pareto-efficient
frontier of those models on a single scatter plot of model parameters vs an
intelligence benchmark. This is a tool, not a marketing page — one screen,
no scroll, no hero, no pricing, no testimonials, no footer.

Layout (top to bottom):

- Top bar (56px tall, 1px bottom border in #58595F). Four elements arranged
  on a single row with generous gaps:
  1. Far left: brand mark "ridge" in Geist Mono lowercase 16px, tracking
     -0.02em, color #F2F2F5.
  2. Then: a dropdown trigger labeled "Index: AA Intelligence Index ▾". The
     "Index:" prefix is in Geist Mono 11px small caps color #9A9CA3. The
     value "AA Intelligence Index" is in Geist Sans 13px medium color
     #F2F2F5. A small chevron glyph follows. Padding 4px 8px, border-radius
     6px, no background by default, hover background #20222A.
  3. Then: a segmented control with three cells "Active", "Total",
     "Compare" — outer container is 32px tall with a 1px border in
     #58595F and border-radius 8px, no internal dividers, no background.
     The currently selected cell ("Active" by default) is filled with a
     #20222A rounded pill (border-radius 6px) inset 4px from the container,
     and its label is #F2F2F5; unselected labels are #9A9CA3. Cell font is
     Geist Sans 13px medium. The selected pill must look like it could
     slide horizontally between cells.
  4. Far right: a 16x16 ⓘ info icon in #9A9CA3.

- Main canvas (fills remaining viewport): an empty full-bleed rectangle that
  will hold a scatter plot. Faint axis labels: "active parameters (log)"
  small caps Geist Mono 11px in #9A9CA3 at bottom-right of the canvas;
  "intelligence index" same style top-left, rotated -90deg. Do not draw the
  chart itself.

- Bottom strip (48px tall, sits flush above the bottom edge): a
  left-aligned horizontal row of toggle chips with 12px gap. Chips:
  "Apache/MIT", "<10B", "<30B", "<100B", "reasoning", "vision". Pill
  shape (border-radius 999px), 28px tall, 1px outline in #58595F,
  transparent fill when off, label in #9A9CA3 Geist Sans 13px medium.
  When on: fill #20222A, outline #58595F, label #F2F2F5.

Aesthetic:

- Dark only. Background #1A1B22. Elevated surfaces #20222A. Highest
  elevation (for selected items inside elevated containers) #2A2D34.
  Text #F2F2F5. Muted #9A9CA3. Subtle lines/borders #58595F.
- Three accent colors, used sparingly:
  - #4DD3C7 (cyan) for keyboard focus outlines and interactive states.
  - #BEEE7E (lime green) reserved for the Pareto frontier line and points
    sitting on it.
  - #D89882 (warm muted orange) reserved for closed-model horizontal
    anchor lines that will appear inside the chart area.
- No gradients. No glow. No drop shadows. No glassmorphism except a
  single faint backdrop-blur on hover tooltips (added later as a separate
  component).
- Typography: Geist Sans for all UI text. Geist Mono for the brand mark
  and every numeric value. Sizes: 24 / 18 / 14 / 13 / 12 / 11.

Tone reference: in the style of Linear's app surfaces, Vercel's
dashboards, and Stripe Press book pages — restrained, confident, no
marketing tropes.

Avoid: oversized rounded buttons, gradient hero blobs, scroll-triggered
fades, dark+neon combos, "AI startup" visual clichés, emoji bullets,
testimonial cards, social proof logos, CTA banners.

Keep it ultra-minimal — this is a tool, not a marketing page. One screen,
no scroll.
```

## Workshop プロンプト（コンポーネント単位）

各コンポーネントは `⌘K` で個別に生成。トークンは canvas から自動継承される前提で、hex を再指定しなくてよい場合は色名のみで指示。

### Filter chip

```
Function: a toggle chip used in a horizontal filter row. Two states:
off (default) and on. Clicking flips the state and emits an onChange
event with the new boolean.

Interactions: click to toggle; spacebar/enter when focused; visible
:hover and :focus-visible states; 120ms ease-in-out transition on
background, border, and label color.

Visual: pill shape (border-radius 999px), height 28px, padding 0 12px,
label centered. Off state: transparent fill, 1px border in the
canvas's subtle-line color, label in muted color. On state: filled
with canvas's elevated surface color, same 1px border, label in
default text color. Hover (off): label shifts to default color.
Font: Geist Sans 13px medium, inherit canvas tokens.

Property controls: `label` (string, default "Apache/MIT"),
`defaultOn` (boolean, default false), `onChange` (event handler).
```

### Index dropdown (Y-axis benchmark selector)

```
Function: a dropdown that selects which benchmark to plot on the Y axis
of a scatter chart. Trigger button sits in a top bar; clicking it
opens a floating panel below. Items are grouped by category.

Trigger button: text reads "Index: <selected name> ▾". The prefix
"Index:" is in Geist Mono 11px small caps in muted color; the
selected value is in Geist Sans 13px medium in default text color; a
small chevron glyph follows. Padding 4px 8px, border-radius 6px, no
background by default, hover background = elevated surface color.

Floating panel (opens directly below the trigger, left-aligned to it):
- Width 320px, max-height 480px (internal scroll if exceeded).
- Container background = elevated surface color (#20222A), 1px border in
  subtle-line color, border-radius 8px.
- Top row: a search input with a magnifying-glass glyph, placeholder
  "Search benchmarks…", autofocus on open. No border, just a 1px
  bottom divider in subtle-line color separating it from the list.
- Below: a vertical list of items grouped under category headers.
  Category headers in Geist Mono 11px small caps tracking-wide, color
  muted, padding 12px 12px 4px. Categories separated by 1px subtle-line
  dividers.
- Items: height 32px, font Geist Sans 13px medium, color muted by
  default, padding 6px 10px. Each item has 6px horizontal inset from
  the container edge so its background pill never touches the border.
- Selected item: background filled with the highest-elevation color
  (#2A2D34), border-radius 6px, label color = default text color.
- Hover item (non-selected): same shape, background = highest-elevation
  at 50% opacity, label color shifts to default text color.
- Keyboard-focused item: hover style PLUS a 1px outline in the cyan
  accent color (#4DD3C7).
- Background transitions are 80ms ease.

Initial categories and items (configurable via property control):
- AGGREGATE: "AA Intelligence Index" (default selected), "AA Coding
  Index", "AA Math Index"
- KNOWLEDGE & REASONING: "MMLU-Pro", "GPQA Diamond", "HLE"
- CODE: "LiveCodeBench", "SciCode"
- MATH: "AIME", "Math-500"

Interactions:
- Click trigger: toggle open/closed.
- Open: focus moves to the search input.
- Type in search: hide category headers, flatten the list, fuzzy match
  on `name + category` (so typing "code" matches "LiveCodeBench" and
  "SciCode").
- Arrow Up / Down: move keyboard focus through items (skip category
  headers); does not commit the selection.
- Enter: commit the focused item as the new selection, close the panel.
- Esc: close without committing.
- Click outside: close without committing.

When the panel opens, keyboard focus lands on the currently selected
item.

Property controls: `selected` (string), `categories` (array of
`{name: string, items: string[]}`), `onChange` (event handler).
```

### X-axis segmented control (Active / Total / Compare)

```
Function: a three-cell segmented control that switches between three
views of a scatter chart: focused on active parameters, focused on
total parameters, or a comparison view that shows both.

Visual: outer container is 32px tall with a 1px border in the
subtle-line color and border-radius 8px, no background. Three cells
labeled "Active", "Total", "Compare" in Geist Sans 13px medium. Each
cell auto-sizes to its label plus 14px horizontal padding. No internal
dividers between cells.

The currently selected cell is rendered as a rounded pill (border-
radius 6px) filled with the elevated surface color (#20222A), inset
4px from the outer container. Selected cell label color = default
text color. Unselected cell labels = muted color; on hover they shift
to default text color.

The selected pill must animate smoothly to its new position when the
user clicks a different cell — it slides horizontally, not fades.
Use `transform: translateX(...)` with `transition: transform 200ms
cubic-bezier(0.4, 0, 0.2, 1)`.

Interactions:
- Click a cell: select it.
- Arrow Left / Right when focused: cycle selection.
- Emit `onChange(value)` with one of "active" | "total" | "compare".

Property controls: `selected` ("active" | "total" | "compare", default
"active"), `onChange` (event handler).
```

### Info icon trigger

```
Function: a small info icon glyph in the far right of the top bar.
Click emits an onOpen event; the modal it opens is owned by a parent
and not part of this component.

Interactions: click → onOpen; hover → label color shift to default
text color; visible focus ring in accent color when focused via
keyboard.

Visual: ⓘ glyph 16x16, muted color by default, default text color on
hover. No background, no border, no padding box visible.

Property controls: `onOpen` (event handler), `ariaLabel` (string,
default "About this dataset").
```

### Tooltip card

```
Function: a floating detail card shown when a chart point is hovered.
Used for state-B mockups. Not interactive itself — purely display.

Visual: 240px wide, auto height. Background #20222A at 92% opacity
with a 12px backdrop-blur. 1px border in subtle-line color.
Border-radius 8px. Padding 12px 14px. Three logical sections,
separated by 1px subtle-line dividers with 10px vertical padding
between them:

1) Model name in default text color, Geist Sans 14px medium; below it
   on a second line, "creator · license" in muted color, Geist Sans
   12px.
2) A 2-column key-value grid:
     "Active"  in muted Geist Sans 11px small caps,
     "22.0 B"  in Geist Mono 13px default text color;
     "Total"   same label style,
     "235.1 B" same value style.
3) Benchmark rows:
     "AA Intelligence"  muted Geist Sans 11px small caps,
     "64"               Geist Mono 13px default text color.
   Below, an inline row of secondary benchmarks "GPQA 75.2 · LCB 58.1"
   in Geist Mono 12px muted color.

Footer line in Geist Mono 11px muted: "HF · Pareto (active)".

No close button. No drop shadow. Entry animation: opacity 0→1 and
translateY 4px→0 over 80ms ease-out.

Property controls: `name`, `creator`, `license`, `active`, `total`,
`indexLabel`, `indexValue`, `secondaryBenchmarks` (array of
`{label, value}`), `paretoFooter` (string, e.g. "Pareto (active)" /
"Pareto (total)" / "Pareto (both)").
```

## Framer に頼らず手で詰める部分

- **散布図本体**（点・Barbell・frontier 線・closed 横線）: Wireframer が生成する空 rectangle のまま放置。後で Figma で SVG モック or Observable Plot の仮レンダ画像を import
- **状態 A/B/C のフレーム複製**: 1 frame を `⌘D` で3つに複製し、それぞれ:
  - **A (Default, Active)**: segmented control = Active、frontier 線 + 点 + クローズド横線3本（チャート領域は画像 placeholder）
  - **B (Hover)**: A の状態に Tooltip card を散布図領域に配置、該当点を強調状態にする
  - **C (Compare + filter)**: segmented control の pill を Compare 位置へ移動、Apache/MIT chip を on 状態に切替、Barbell + dual frontier の placeholder 画像に差し替え
- **散布図のチャート内インタラクション**（hover、click、frontier 線描画アニメ）: Astro/Solid 実装側に持ち越す

## Notes

- Wireframer は **非決定的**。同じプロンプトで生成しても結果が異なる。3-5回試して一番素直な骨格を採用するのが現実的
- Workshop は npm import が experimental なので、外部チャートライブラリの埋め込みは期待しない（散布図はあくまで画像 placeholder）
- 「Framer ルック」を出さないコツ: Wireframer 出力をそのまま使わず、生成後に **手で余白を詰め、フォントサイズ階段を強制し、装飾を削る**。生成は出発点であって完成品ではない
