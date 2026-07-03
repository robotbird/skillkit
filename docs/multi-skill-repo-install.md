# 多 Skill 仓库安装（GitHub）需求文档

> 状态：**待实现**（根因已定位，方案已定稿，待排期）
> 最后更新：2026-07-03
> 适用范围：客户端（Electron，`apps/desktop`）

## 1. 背景与问题

skillkit 的「从 GitHub 安装」当前假设 **一个仓库 = 一个 skill**：仓库根（或 URL 里 `tree/<分支>/<子路径>` 指向的目录）有 `SKILL.md`，或其**一层**子目录里有**唯一**一个含 `SKILL.md` 的。

现实里有一类常见的「**多 skill 集合 / plugin 框架**」仓库不符合这个模型，典型例子是 [obra/superpowers](https://github.com/obra/superpowers)：

```
仓库根
├── .claude-plugin/  .codex-plugin/  …          ← 各 harness 的 plugin 清单
├── hooks/  scripts/  docs/  skills/
├── AGENTS.md  CLAUDE.md                         ← 入口文档，无 YAML frontmatter
└── skills/                                      ← 14 个 skill 子目录
    ├── brainstorming/SKILL.md
    ├── test-driven-development/SKILL.md
    ├── writing-plans/SKILL.md
    └── …（共 14 个）
```

用户贴 `https://github.com/obra/superpowers` 安装，skillkit 报 **「该路径未发现 SKILL.md（或子目录中也没有单一 SKILL.md）」**，无法安装。用户不理解为什么明明仓库里全是 skill 却装不了。

一句话：**让 skillkit 能识别「一个仓库里装了多个 skill」的结构，列出全部候选让用户多选批量安装。**

## 2. 根因（代码层）

涉及 `apps/desktop/electron/installer.ts` 与 `apps/desktop/electron/skill-md.ts`：

1. `installFromGithub`（`installer.ts:174`）：`skillDir` 取仓库根或 URL subpath；若 `readSkillMd(skillDir)` 为空，调 `findSingleSkillChild(skillDir)`（`:216`）。
2. `findSingleSkillChild` **只扫一层**直接子目录，且遇到**第二个**含 skill 的候选就 `return null`（`:222`，拒绝自动猜）。
3. `readSkillMd`（`skill-md.ts:55`）读 `SKILL.md` **或** `AGENTS.md`，但 `parseFrontmatter`（`:15`）要求文件**以 `---` 开头**才认，否则返回 `null`。
4. 对 superpowers：
   - 根 `AGENTS.md` 内容只有一行 `CLAUDE.md` 指针，根 `CLAUDE.md` 是正文 → 都**无 frontmatter** → `readSkillMd(根) = null`；
   - 真正的 `SKILL.md` 在 `skills/<name>/SKILL.md`（**两层深**），根的一层子目录里一个都没有 → `findSingleSkillChild` 找不到 → 命中 `:198` 报错；
   - 退一步说，就算扫进 `skills/`，14 个候选也会触发「多候选拒绝」。

结论：**模型不匹配**——skillkit 把仓库当一个 skill，而这类仓库是「skill 集合」。

## 3. 目标 / 非目标

### 目标

- **G1**：GitHub URL 指向「多 skill 仓库」时，自动枚举出仓库内所有可装 skill（`skills/<name>/SKILL.md` 等常见布局），列出清单让用户**多选 + 批量安装**到所选工具。
- **G2**：**不破坏**现有「单 skill 仓库」「带 tree subpath 的 URL」行为，保持零回归。
- **G3**：错误提示友好——检测到「这其实是个 plugin 框架仓库（含 `.claude-plugin` / `.codex-plugin` 等）」时，引导用户走对应 harness 的原生 plugin 安装，而不是甩一句「没有 SKILL.md」。

### 非目标

- **N1**：**不支持完整 plugin 框架**（session-start hooks、bootstrap、跨 skill 自动编排）。那是各 harness 的 plugin 系统职责，skillkit 不接管。
- **N2**：不重新实现 plugin 清单解析（`.claude-plugin/plugin.json` 等）；仅在 UI 层做识别与引导。
- **N3**：不改 market（skills.sh）链路——本需求只管「GitHub URL」入口。

## 4. 方案设计

### 4.1 检测：把「仓库」当「skill 集合」来扫

新增主进程函数 `collectRepoSkills(extractedRoot): SkillCandidate[]`（放 `installer.ts`）：

- 先按现有逻辑判断「单 skill」（根/subpath 本身就有 frontmatter）——命中则**走原流程**，零行为变化。
- 否则在仓库内**广度优先**搜集所有「自身目录含 `SKILL.md`（有效 frontmatter）」的目录，去重。优先识别两种常见布局：
  - `skills/<name>/SKILL.md`（superpowers、anthropics/skills 等）；
  - 根下任意深度的含 `SKILL.md` 目录（兜底，但限制深度 ≤ 3，跳过 `.git`/`node_modules`/`tests`/`docs`/`.github` 等噪声目录）。
- 返回候选清单。空清单 → 保留原「未发现 SKILL.md」错误，但若同时检测到 plugin 清单目录（见 4.4），改返回更友好的引导错误。

> 复用现有 `readSkillMd` 做 frontmatter 校验，不引入新解析逻辑。

### 4.2 数据模型（`shared/types.ts`，desktop 专用）

```ts
/** 多 skill 仓库里扫到的一个候选 skill。 */
export interface RepoSkillCandidate {
  name: string;            // 取自 frontmatter.name，兜底用目录名
  description: string | null;
  subpath: string;         // 相对仓库根的路径，如 "skills/test-driven-development"
}

/** 列举仓库内的 skill 候选；单 skill 仓库返回单元素数组。 */
// SkillkitApi 上新增：
listGithubSkills(url: string): Promise<{ kind: 'single' | 'multi'; skills: RepoSkillCandidate[] }>;
/** 按 subpath 安装仓库内某个具体 skill（单 skill 仓库 subpath 留空）。 */
installGithubSkillAt(url: string, subpath: string, targets: Tool[]): Promise<InstallResult[]>;
```

> `installFromGithub`（旧）保留向后兼容：等价于先 `listGithubSkills`，`kind==='single'` 时直接装。

### 4.3 IPC + UI 流程

三处协调编辑（`ipc.ts` handler / `preload.ts` 方法 / `shared/types.ts` 签名）：

- 新增 IPC：`github:listSkills`、`github:installAt`。
- 渲染层 `InstallView.tsx` 的 GitHub 分支改为两步：
  1. 输入 URL 点「列出 skill」→ 调 `listGithubSkills`；
  2. `kind==='multi'` → 弹**多选清单**（复用 `ToolPicker` 的弹窗骨架，新增一个 `RepoSkillPicker`：列出候选 name + description + 复选框 + 全选）→ 用户勾选 + 选目标工具 → 逐个调 `installGithubSkillAt` 安装，结果用现有 `summarize` 汇总。
  3. `kind==='single'` → 走原「直接装」路径（保留现有 UX）。

### 4.4 plugin 框架识别（引导，不接管）

`collectRepoSkills` 检测到仓库根含 `.claude-plugin` / `.codex-plugin` / `.cursor-plugin` / `.kimi-plugin` / `.opencode` 等目录，且 skills 候选 ≥ 1 时：UI 在多选清单顶部加一条**提示条**：「这看起来是一个 plugin 框架（{name}），完整体验请用 {harness} 的 plugin 安装；这里也可以单独装其中某个 skill，但不会自动触发/编排。」让用户知情选择。

## 5. 边界与约束

- **只认有效 frontmatter**：`SKILL.md`/`AGENTS.md` 必须有 `---` frontmatter 才算 skill（与 `parseFrontmatter` 一致），避免把 `CLAUDE.md`/`README.md` 类入口文档误判为 skill。
- **单装不完整要明示**：superpowers 这类 skill 互相协作且依赖 bootstrap；装成普通 skill 后 agent 能手动调用，但不会自动串起来。UI 提示到位（见 4.4）。
- **扫描成本**：广度搜集要限深度、跳噪声目录，避免在大仓库（含 `node_modules`/`evals/` 等）里耗时过久。
- **不改 market / share 链路**。

## 6. 验证

| 场景 | 期望 |
|---|---|
| `https://github.com/obra/superpowers` | 列出 14 个 skill；多选若干 → 装到所选工具；顶部有 plugin 框架提示条 |
| `https://github.com/obra/superpowers/tree/main/skills/test-driven-development` | 仍**直装**该单个 skill（subpath 命中，不进多选流程） |
| 现有单 skill 仓库（根有 SKILL.md） | 行为**不变**，直接装 |
| 一个「根有 SKILL.md + skills/ 下也有多个」的仓库 | 根优先视为单 skill（不强制多选） |
| 纯文档/空仓库 | 友好报错，不再甩「没有 SKILL.md」 |

端到端验证用 superpowers 实测；回归用本地 zip 安装用例 + 一个已知单 skill 仓库。

## 7. 后续可演进（不在本期）

- 识别 plugin 清单（`.claude-plugin/plugin.json`）并展示 plugin 元信息（版本、作者），进一步引导。
- market 集成：把多 skill 仓库作为「合集」上架 skills.sh。
- 安装时记录 `source: github-multi:<repo>#<subpath>`，便于「我的 Skill」里区分来源。
