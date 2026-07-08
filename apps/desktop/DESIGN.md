# Skillkit Desktop 视觉设计系统（DESIGN.md）

> 本文档定义 Skillkit 桌面端的**视觉设计语言与配色 token**。
> CSS 分层/架构规则见 [`STYLES.md`](./STYLES.md)；**配色 live source of truth 是 [`src/styles/theme.css`](./src/styles/theme.css)**（本文档为人类可读镜像，改动以 theme.css 为准）。

## 1. 设计方向

Skillkit 桌面端采用**双主题、双气质**策略（有意为之，非缺陷）：

| 主题 | 气质 | 状态 |
|---|---|---|
| **浅色（light）** | **Codex 中性**：冷中性近白画布 / 近黑文字 / 发丝边框 / 不透明表面 / 近黑胶囊选中 / 极轻阴影 / 仅保留少量点缀橙 | 2026-07 重构定稿 |
| **深色（dark，默认）** | **暖棕品牌**：深暖底 / 暖橙强调 / 半透明毛玻璃卡片 / 暖阴影 / 暖色径向渐变 | 品牌层，长期稳定 |

设计参考：[Codex 设计语言](https://www.typeui.sh/design-skills/codex) ——「满铺白画布、黑色作唯一填充色、排版主导层次、胶囊形控件、无阴影/无渐变/无装饰」。Skillkit 在浅色态**采纳其中性克制**，但**保留品牌点缀橙**与卡片化布局（非纯黑白），在「去暖奶油/去毛玻璃/拍平」与「保留 skillit 辨识度」之间取平衡。

### 浅色态五大原则

1. **画布即环境** —— 满铺冷中性近白 `#fafafa`，无暖奶油、无橙色径向光晕、无分段色块。
2. **近黑承载主交互** —— 选中态（Tab/导轨/ToggleGroup）与主按钮为近黑 `#1a1a1a` 胶囊 + 白字。
3. **发丝边框取代阴影** —— 卡片/分隔靠 `rgba(0,0,0,.08)` 发丝线与留白建立层次，阴影极轻中性。
4. **不透明表面** —— 卡片/胶囊背景不透明白 `#ffffff`；`backdrop-filter` 属性保留（不透明底色下视觉自然失效，达成「去玻璃」而无需删属性）。
5. **橙色仅作点缀** —— 只在更新点 / 聚焦环 / builtin 标签 / 复选框 / spinner / 拖拽态 / 文本选区出现；**主按钮不用橙**。

## 2. 浅色调色板（token）

> live 值在 `theme.css` 的 `[data-theme="light"]` 块。下表为镜像参考。

| 变量 | 值 | 用途 |
|---|---|---|
| `--bg-0` | `#fafafa` | 画布（冷中性近白） |
| `--bg-1` | `#f2f2f3` | 次级面板 |
| `--ink` | `#1a1a1a` | 主文字（近黑） |
| `--ink-soft` | `rgba(26,26,26,.72)` | 次级文字 |
| `--ink-mute` | `rgba(26,26,26,.5)` | 弱化文字/元信息 |
| `--line` | `rgba(0,0,0,.08)` | 发丝线 |
| `--line-strong` | `rgba(0,0,0,.14)` | 强调边框 |
| `--pill-bg` | `#ffffff` | 胶囊/输入/搜索底（不透明） |
| `--pill-bg-hover` | `#f4f4f5` | 胶囊悬停 |
| `--pill-active-bg` | `#1a1a1a` | 选中态填充（近黑） |
| `--pill-active-ink` | `#ffffff` | 选中态前景（白） |
| `--card-bg` | `#ffffff` | 卡片底（不透明） |
| `--card-bg-hover` | `#fafafa` | 卡片悬停 |
| `--card-line` | `rgba(0,0,0,.08)` | 卡片发丝边框 |
| `--accent` | `#c9761a` | **点缀橙（保留）** |
| `--accent-soft` | `rgba(201,118,26,.14)` | 橙色软底 |
| `--danger` | `#d24a38` | 危险/破坏性 |
| `--shadow-pill` | `0 1px 2px rgba(0,0,0,.05)` | 胶囊阴影（极轻中性） |
| `--shadow-card` | `0 1px 2px rgba(0,0,0,.04)` | 卡片阴影（极轻中性） |

### 不在浅色块覆盖、需注意的语义色（继承 `:root`）

- `--success #4ade80`、`--danger-soft/--danger-ink/--success-soft/--success-ink`（toast 状态色，浅底深字、暗亮通用）。

## 3. 点缀橙策略（保留 vs 中性化）

浅色态下橙色 `--accent #c9761a` **保留**于以下「点缀」位置（勿改成中性）：

- **更新小红点** `.update-dot`（`#ffb24d`）+ 脉冲动画
- **聚焦环/聚焦边** `--ring`（→ 各 shadcn 控件 focus）、`.install-input input:focus`、`.search-toggle:focus-within`、`.search:focus-within`
- **builtin 标签** `.skill-tag.tag-builtin`
- **复选框** `.modal .opts input { accent-color: var(--accent) }`
- **spinner** 边框顶部
- **拖拽态** `.dropzone.is-drag`
- **picker 选中高亮** `.modal .opts label.checked`
- **文本选区** `::selection`
- 更新按钮图标色 `.update-btn` 及其 hover

其余曾经的暖色（卡片图标底 `.skill-ico`/`.install-icon`、`.tag-multi`、`.btn-primary` 暖渐变、`.kebab-menu` 深色渐变、`.bg` 暖径向渐变、暖阴影等）**一律中性化**。

> `.tag-official` 紫 `#c9b3ff` 是 official 语义色，非暖色，**不在中性化范围**。

## 4. 设置弹窗 Codex 化（浅色 + 深色双主题）

设置弹窗（`.modal.settings-dialog` + `.settings-*`）是**双主题都采用 Codex 设置侧栏规范**的区域（深色态亦去暖）：

- **左导轨 `.settings-rail`**：去底色、与内容同面（`background: transparent`），仅靠右侧 `1px solid var(--line)` 发丝线分割，不用独立 tinted 面板。
- **导航项 `.settings-nav`**：未选中文字弱化 `var(--ink-mute)`；hover → 全色 `var(--ink)` + 柔和底（浅色 `rgba(0,0,0,.04)` / 深色 `rgba(255,255,255,.06)`）。
- **选中态 `.settings-nav.is-active`**：**柔和灰胶囊 + 全色文字 + semibold**（浅色底 `rgba(0,0,0,.07)` / 深色底 `rgba(255,255,255,.1)`），`box-shadow: none`。属 Codex「低强调导航选中态」（weight + 柔和 fill + 全色，不只靠颜色），**不用**强反相填充（浅色近黑 / 深色暖白）。
- **关闭按钮 `.settings-close`**：hover 全色 + 柔和底（同 nav hover）。
- 弹窗外壳沿用各主题 `.modal` 表面（浅色纯白、深色暖近黑），不单独改外壳背景。

> 该规范**仅作用于设置弹窗**；其余深色界面仍维持暖棕品牌主题。若日后要把整站深色也 Codex 化，另开 scope。

## 5. 反模式（浅色态禁止）

- ❌ 暖奶油 / 暖棕背景（`#f5f0e8`、`#efe8db`、`rgba(120,90,50,*)`、`rgba(60,40,20,*)`）
- ❌ 橙色径向渐变 / 暖色暗角 vignette
- ❌ 半透明 + `backdrop-filter` 的毛玻璃卡片观感（底色必须不透明）
- ❌ 暖色阴影
- ❌ 主按钮用橙色（主按钮 = 近黑胶囊）
- ❌ 半透明白 `rgba(255,255,255,*)` 作悬停/边框（白底不可见）→ 用 `rgba(0,0,0,*)`
- ❌ 深色硬编码字面量（`#2a2018`/`#1f1611` 深渐变、`rgba(255,200,140,*)` 暖边）漏进浅色而无 `[data-theme="light"]` 覆盖

## 6. 改动约束

- **配色改动**：优先改 `theme.css` 的 `[data-theme="light"]` 变量块；个别硬编码暖色/不可见字面量，以**新增 `[data-theme="light"]` 前缀覆盖**方式处理，**不动原深色规则**。
- **不动**：布局 / 结构 / 圆角 / `backdrop-filter` 属性 / 功能逻辑 / 深色主题（`:root`）/ `globals.css`（纯变量桥接，自动跟随）。
- **新增控件视觉**走 shadcn 控件层（`src/components/ui/*`），不进 `theme.css` 品牌层（见 STYLES.md）。

## 7. 验证要点

切到浅色态（设置 → 外观 → 浅色）后：画布冷中性近白、卡片不透明白 + 发丝边框、毛玻璃消失、Tab/主按钮选中近黑、设置弹窗白底中性、点缀橙仅出现在上述保留位；切回深色应**完全无变化**。
