# Skillkit 桌面端 —— 样式 / 组件 / 架构规范

本文件是 shadcn 引入后样式与组件的 **single source of truth**。
决策依据见 `.claude/plans/shadcn-spec.md`。

---

## 一、技术架构

### CSS 三层职责

| 层 | 文件 | 职责 | 边界约束 |
|---|---|---|---|
| 品牌层 | `src/styles/theme.css` | 配色变量、暖色暗/亮主题、背景特效、所有原生组件视觉 | **冻结新增**——新控件视觉不往这加 |
| 桥接层 | `src/styles/globals.css` | shadcn 语义 token → theme.css 变量映射；`@layer base` 兜底；Tailwind v4 import | **只放映射**，不放组件样式 |
| 控件层 | `src/components/ui/*.tsx` | shadcn 源码（Radix + cva + Tailwind utility） | **只装 `shadcn add` 产物**，不手写业务 |

新增控件：`pnpm dlx shadcn@latest add <name>`（`components.json` 已配 new-york / neutral / lucide）。

### Tailwind 边界
- 仅 renderer bundle（`vite.config.ts` 的 `tailwindcss()` 只接 renderer）；main/preload 无 CSS。
- Tailwind v4 按内容自动扫描 `src`，新增文件无需配 content。
- 故意跳过 `tailwindcss/preflight`（保护现有原生 CSS）；`:where(button/input)` 用 specificity 0 兜底，永不盖过原生类。

### 别名（renderer 三个）
- `@/` → `src`（shadcn 约定：`ui/*`、`lib/utils`）
- `@shared` → `shared`（IPC 类型桥）
- `@skillkit/types` → 跨端类型（workspace symlink + `exports`，无需 tsconfig paths）

### shadcn 控件层边界（核心判定准则）

> **控件交互用 shadcn，布局/品牌视觉用原生 CSS。**

- ✅ 用 shadcn：Button / Input / Field / Label / Toggle / ToggleGroup / Separator / Card；未来 Dialog / Select / Tooltip / Popover / DropdownMenu / Tabs
- ❌ 不用 shadcn（继续原生 CSS）：背景特效、顶栏 `.topbar`、标签栏 `.tab`、搜索框 `.search`、暖色玻璃卡片 `.card`、毛玻璃遮罩 `.modal-mask`、`.kv-card`、`.settings-rail`
- 存量原生按钮（`.btn-primary`/`.btn-ghost`/`.btn-link`）保留为 legacy；**新代码一律用 shadcn `Button`**

---

## 二、样式规范

### 配色单一来源
- 所有颜色走 CSS 变量，**禁止硬编码 hex/rgba**。
- shadcn 组件禁止 `bg-[#xxx]` 裸色，必须用语义 token（`bg-primary`/`bg-accent`/`text-muted-foreground`）。
- token 三层映射，**禁止跨层**：`theme.css` 语义变量 → `globals.css` shadcn 映射（`--background: var(--bg-0)`）→ 组件 utility（`bg-primary`）。

### 主题切换
- 统一 `[data-theme]`（`useTheme` 落 `<html>`）；shadcn dark variant 已映射到 `[data-theme="dark"]`。
- **禁止**组件内用 `.dark` class 或自判主题。

### z-index 层级

| 用途 | 值 |
|---|---|
| 背景 `.bg` | 0 |
| 主体 `.main` / 工具栏槽 | 1 |
| 顶栏 `.topbar` | 2 |
| 浮层（kebab 菜单等） | 30 |
| 卡片菜单打开抬升 | 40 |
| 模态遮罩 `.modal-mask` | 100 |
| Toast `.toast` | 200（高于模态，确保弹窗内可见） |

新增浮层取相邻档位，勿随意造新值。

### transition
- 时长档：fast `0.15s` / normal `0.18s` / slow `0.2s`（现有主要聚集档）。
- easing 默认 ease（待统一 `--ease` 变量）。

### 圆角 / 间距
- 三档圆角：`--radius-pill` 999 / `--radius-card` 16 / `--radius-input` 12。
- 间距用 Tailwind scale（`gap-2`/`gap-4`）；原生 CSS 继续 px。

---

## 三、组件规范

### 按钮
- 统一 shadcn `Button`（variant: `default`/`outline`/`ghost`/`link`/`destructive`；size: `default`/`sm`/`xs`/`lg`/`icon`）。
- 语义对照：`default`≈`.btn-primary`、`outline`≈`.btn-ghost`/`.btn`、`ghost`≈`.icon-btn`、`link`≈`.btn-link`、`destructive`≈`.btn-danger`。
- 分段控件新代码用 `ToggleGroup`；`.seg`/`.seg-btn` 保留（顶栏标签用）。

### 模态
- 统一 `ModalPortal` + `.modal-mask`(z100) + `.modal`。
- **关闭三通道齐全**：Esc 键 + 遮罩点击（带 `!busy` 保护）+ ✕/取消按钮。
- 4 个弹窗（SettingsDialog / ShareDialog / ToolPicker / RepoSkillPicker）均须实现 Esc。

### 表单
- 统一 shadcn `Field`/`FieldLabel`/`FieldError`/`Input`。
- 校验错误走 `FieldError`（带 `role="alert"` + `text-destructive`）。
- busy 态：`disabled` + 文案切换 + `spinner`。

### 状态反馈
- **Toast**：统一 `useToast()` + `toast.show(msg, kind, ms)`；kind: `info`/`success`/`error`。
- **spinner**：统一 `.spinner`（`spin 0.8s linear`）。
- **空状态**：统一 `.empty` + spinner 或文案。
- **错误态**：表单内走 `FieldError`，全局走 `Toast`；废弃散落的 `.share-error`/`.install-hint.error`/`.settings-error`。

### 可访问性
- `focus-visible` ring（shadcn 已带）；`aria-label`；`label.htmlFor` + `input.id` 关联；弹窗 Esc + 焦点管理。

### 国际化
- 所有可见文案走 `t()`；key 点分命名（`settings.nav.account`）。
- zh 真相源，en 必须 `Record<keyof typeof zh, string>` 同构；占位符 `{name}`。
- 当前仅 TopBar + SettingsDialog 全量 i18n；其余分批补齐。

---

## 四、技术债与排除项
- 存量原生按钮 / 表单不强制迁移（新代码用 shadcn）。
- `theme.css` 保留（暖色品牌视觉，不重写）。
- **已知硬编码颜色保留为品牌特例**（无对应语义变量，机械替换会改外观，待视觉重构统一变量化）：`.modal` 渐变 `#2a2018/#1f1611` + 圆角 `18px` + border `rgba(255,200,140,0.16)`；`.tab:hover` `rgba(255,255,255,0.04)`；`.update-btn:hover` `rgba(255,177,74,0.12)`。
- transition 时长现混用 0.15/0.18/0.2s；已加 `--ease` 变量 + 时长档约定，新代码对齐，存量逐步替换。
- 不引入 shadcn 主题切换器（用现有 `useTheme`）。
