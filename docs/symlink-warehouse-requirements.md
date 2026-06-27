# Skillkit 软链接 + 仓库模型 重构需求文档

> 状态：**需求评审中**（待用户确认 → 转入规划）
> 最后更新：2026-06-24
> 适用范围：skillkit 客户端（Electron，macOS）
> 关联文档：`docs/skill-pack-design.md`（技能包，独立特性，不受本次重构影响）

---

## 0. TL;DR（一句话）

把 skillkit 从「**下载 → 复制进各工具全局目录**」的拷贝模型，升级为「**仓库里放原件 → 用软链接把原件挂到项目/全局 → 一处更新处处生效、改 bug 直接反哺上游**」的软链接模型；**复制安装作为兼容能力保留**。

对应你描述的三步：

| 你的描述 | skillkit 承担 |
|---|---|
| 第一步：把开源 Skills 项目下载到统一的 `~/GitHub` | **仓库管理**：App 内 clone / 纳入已 clone 目录、一键 pull 更新 |
| 第二步：项目内 `.agents/skills/<name>` 软链到原件 | **项目级软链接** |
| 第三步：`.claude/skills` → `.agents/skills` 桥接 | **工具桥接**（四工具各自） |
| 三、不用记命令，让 App/Agent 干 | skillkit 把上述全部封装成按钮，不再敲命令 |
| 四、一处更新 + 反哺上游 | **更新零成本**（软链天然生效）+ **原件优先编辑** |

---

## 1. 背景与动机

### 1.1 现状（全局复制模型）

当前 skillkit 的安装 = 把 skill **复制**进各工具的**全局用户目录**（`~/.claude/skills/<name>`、`~/.codex/skills/<name>`、`~/.cursor/skills/<name>`、`~/.trae/skills/<name>`）。扫描时「文件系统是真相、DB 是缓存」。

来源（市场 / GitHub tarball / zip / 分享短链）全部走下载 → 复制。

### 1.2 痛点

1. **更新要重复 N 次**：开源 skill 更新后，每个装了它的工具、每个项目里的副本都要重新下载覆盖；副本之间互不同步。
2. **改了 bug 无法反哺**：复制出来的副本和上游 git 仓库脱钩，本地修了也没法方便地提交回去。
3. **多项目重复占用**：同一份 skill 在多个项目里各放一份拷贝。

### 1.3 新模型的价值（软链接 + 仓库）

- **一处更新，处处生效**：所有「挂载点」都软链到仓库里的同一份原件；上游一更新（git pull），全局/所有项目立刻是最新版，无需重新链接。
- **改 bug 直接反哺**：软链让编辑落在原件上；原件是 git 仓库，可直接提交/PR 回开源社区。
- **项目隔离又共享**：每个项目用 `.agents/skills` 作为自己的技能池，按需挂载原件；四工具通过桥接共享同一池。

---

## 2. 核心概念

> 全部沿用你描述的术语，便于对齐。

| 概念 | 定义 | 举例 |
|---|---|---|
| **仓库（Warehouse / Vault）** | 统一存放 git clone 来的「原件」的根目录，可配置，默认 `~/GitHub` | `~/GitHub` |
| **仓库项目（Repo）** | 仓库里的一个 git 仓库，内含一个或多个 skill 原件 | `~/GitHub/baoyu-skills`、`~/GitHub/baoyu-design` |
| **原件（Original / Source Skill）** | 仓库项目里一个含 `SKILL.md`（或 `AGENTS.md`）的目录，是单一真相源 | `~/GitHub/baoyu-skills/skills/baoyu-comic` |
| **软链接（Link）** | 从某个挂载点指向原件的符号链接，由 skillkit 创建 | 见下两种作用域 |
| **项目（Project）** | 用户选定的一个工作目录，在其中挂载项目级 skill | `~/GitHub/baoyu-writing` |
| **项目技能池** | 项目内统一的 skill 挂载目录 | `<project>/.agents/skills/` |
| **桥接（Bridge）** | 让某个工具发现项目技能池的软链：`<project>/<工具项目技能目录>` → `<project>/.agents/skills` | `.claude/skills → .agents/skills` |
| **复制安装（Copy Install）【保留】** | 现有模型：下载并复制进工具全局目录 | 市场安装/zip/分享链接 |

### 2.1 两种软链接作用域

**① 项目级链接（对应你描述的第二步）**

```
<project>/.agents/skills/baoyu-comic   ──软链──▶  ~/GitHub/baoyu-skills/skills/baoyu-comic   （原件）
<project>/.claude/skills               ──软链──▶  <project>/.agents/skills                  （桥接，让 Claude Code 发现）
<project>/.cursor/skills               ──软链──▶  <project>/.agents/skills                  （桥接，让 Cursor 发现）
…（codex / trae 同理）
```

工具顺着 `.<tool>/skills` → `.agents/skills` 这条桥接，就能看到池里所有挂载的 skill。

**② 全局级链接（软链版的「复制安装」，彻底替代复制）**

```
~/.claude/skills/baoyu-comic   ──软链──▶  ~/GitHub/baoyu-skills/skills/baoyu-comic   （原件）
~/.codex/skills/baoyu-comic    ──软链──▶  ~/GitHub/baoyu-skills/skills/baoyu-comic
…（cursor / trae 同理）
```

工具本就读取各自的全局 `~/.<tool>/skills`，挂的是软链即可，无需桥接。这是「软链为主」对旧复制模型的直接替代。

### 2.2 概念关系图

```
              ┌──────────────── 仓库 ~/GitHub ────────────────┐
              │  baoyu-skills/  (repo, git)                     │
              │    └─ skills/baoyu-comic/  ←── 原件（真相源）    │
              │    └─ skills/baoyu-translate/ ← 原件            │
              │  baoyu-design/   (repo, git)                    │
              │    └─ skills/baoyu-design/   ← 原件             │
              └────────────────────────────────────────────────┘
                         ▲              ▲
           ┌─────────────┘              └──────────────┐
   项目级软链（写进项目）                      全局级软链（写进工具全局目录）
           │                                              │
   <project>/.agents/skills/baoyu-comic          ~/.claude/skills/baoyu-comic
   <project>/.agents/skills/baoyu-design         ~/.cursor/skills/baoyu-comic
           │
   桥接：<project>/.claude/skills → .agents/skills
        <project>/.cursor/skills → .agents/skills  …
```

---

## 3. 目标与非目标

### 3.1 目标（本期）

1. 新增**仓库管理**：配置仓库根目录；按 GitHub 地址 clone、纳入已 clone 目录、一键 pull 更新、移除。
2. 新增**原件发现**：扫描仓库内所有 repo，枚举出每个含 `SKILL.md` 的原件。
3. 新增**项目级软链接** + **工具桥接**（四工具），按当前项目挂载/卸载原件。
4. 新增**全局级软链接**（四工具全局目录），作为软链版安装。
5. 落实**更新零成本**（pull 后所有软链自动生效）与**原件优先**（编辑/打开原件、可选 git 状态展示）。
6. **保留复制安装**全部现有能力（市场/GitHub tarball/zip/分享短链）。
7. **卸载安全**：卸载软链只删链接、绝不删原件；删除原件/仓库前提示并清理悬空链接。

### 3.2 非目标（本期不做）

- Windows / Linux 的软链接与权限适配（skillkit 当前仅 macOS）。
- 跨仓库的 skill 依赖解析、skill 版本锁定/多版本并存。
- 仓库内 skill 的「就地改名/迁移」等重构操作。
- 反向同步（把仓库改动自动 push 到上游）——本期仅提供「打开原件 + git 状态」便于手动提交，不做自动 push。
- 技能包（pack）特性——独立文档，不在本重构范围。

---

## 4. 已锁定的产品决策（来自需求确认）

| # | 决策点 | 结论 |
|---|---|---|
| D1 | 新软链模型与旧复制模型的关系 | **并存**：软链为主推工作流，复制安装保留 |
| D2 | 软链工作流支持的工具 | **四个全支持**（Claude Code / Codex / Cursor / Trae） |
| D3 | 仓库来源 | **两者都支持**：App 内 clone，也能纳入已 clone 的目录 |
| D4 | 软链作用域 | **项目级 + 全局级都支持** |

由以上推导的二级决策（建议，待规划期最终确认）：

- **项目技能池目录** = `<project>/.agents/skills/`（采用你示例的社区约定；是否可配置见 §11）。
- **桥接目标** = 各工具的**项目级** skills 发现目录。Claude Code = `.claude/skills`（示例确认）；Codex / Cursor / Trae 的项目级发现目录需在规划期**逐一核实**（见 §11 Q3）。
- **「原件」身份键** = 其在仓库内的绝对路径（一个原件可被多处挂载，但身份唯一）。
- **全局级挂载点** = 现有 `TOOLS[*].installRoot`（`~/.<tool>/skills`），与复制安装共用同一目录，软链与拷贝可能共存于同一目录。

---

## 5. 功能需求

> 编号 FR = Functional Requirement。每条标注优先级 P0/P1。

### 5.1 仓库管理（Warehouse）

- **FR-1 [P0] 仓库根目录配置**：设置仓库根目录（默认 `~/GitHub`），持久化；可更改；不存在则提示创建。
- **FR-2 [P0] 添加仓库项目（clone）**：输入 GitHub 地址（复用现有 `parseGithubRef`，支持 https / git@ / owner/repo / tree URL），skillkit 执行 `git clone` 到 `<仓库根>/<repo 名>`；克隆后自动扫描出原件。
- **FR-3 [P0] 纳入已有仓库项目（adopt）**：选择一个已存在的本地目录（用户已手动 clone），skillkit 登记为受管 repo，读取其 git remote，不重复 clone；同样扫描出原件。
- **FR-4 [P0] 拉取更新（pull）**：对受管 repo 执行 `git pull`（或 fetch + 快进）；展示「有上游更新可用」状态；pull 成功后刷新原件清单。
- **FR-5 [P0] 移除仓库项目**：从受管列表移除；可选「同时删除本地克隆」（默认**不删**，仅解绑）；删除前扫描并提示受影响的软链会变悬空。
- **FR-6 [P1] 仓库总览**：列出所有受管 repo：名称、remote、本地路径、原件数量、上次更新时间、是否落后上游。

### 5.2 原件发现（Original discovery）

- **FR-7 [P0] 枚举原件**：扫描仓库内每个 repo，递归找出所有含 `SKILL.md` / `AGENTS.md` 的目录作为原件（复用 `readSkillMd`，但需从「找单个」泛化为「列出全部」）。
- **FR-8 [P0] 原件信息**：展示原件名称、描述（frontmatter）、所在 repo、相对仓库路径、体积、git 状态（是否落后/有本地改动，P1）。
- **FR-9 [P0] 打开原件**：在 Finder 中定位原件目录（复用 `revealInFinder`）。
- **FR-10 [P1] 单 repo / 单原件维度的 git 状态**：落后上游 / 本地已改未提交，支撑「反哺」场景。

### 5.3 项目管理（Project）

- **FR-11 [P0] 选择当前项目**：提供「当前项目」选择器（最近项目列表 + 选择目录）；持久化最近项目；切换项目即切换「项目级技能池」视图。
- **FR-12 [P0] 项目技能池**：当前项目的 `<project>/.agents/skills/` 作为池；不存在则按需创建。
- **FR-13 [P1] 多项目记忆**：记住多个项目及其各自挂载状态，快速切换。

### 5.4 软链接 · 项目级（Project links）

- **FR-14 [P0] 挂载原件到当前项目**：选中一个原件 → 创建 `<project>/.agents/skills/<name>` → 原件 的软链。`<name>` 取原件 frontmatter name 或目录名，做安全清洗（沿用现有命名规则）。
- **FR-15 [P0] 批量挂载**：可多选原件一次性挂载。
- **FR-16 [P0] 卸载项目链接**：删除 `<project>/.agents/skills/<name>` 软链；**只删链接，绝不触碰原件**。
- **FR-17 [P0] 已挂载检测/去重**：池中已有同名挂载时提示（覆盖/跳过）；已是软链且指向同一原件则视为已挂载（幂等）。

### 5.5 工具桥接（Bridge）

- **FR-18 [P0] 创建桥接**：为当前项目的每个**启用工具**创建 `<project>/.<tool项目技能目录>` → `<project>/.agents/skills` 软链。
- **FR-19 [P0] 冲突保护**：目标位置若已存在**真实目录**（非软链、非空），**不得直接覆盖**；提示用户处理（合并/改名/放弃）后再建桥接。
- **FR-20 [P0] 桥接幂等**：已是正确软链则跳过；指向错误目标则提示。
- **FR-21 [P1] 单独管理桥接**：可按工具开关桥接（某项目只给 Claude Code 桥接，不给 Cursor）。

### 5.6 软链接 · 全局级（Global links，软链版安装）

- **FR-22 [P0] 全局挂载原件**：选中原件 + 选择目标工具 → 在 `~/.<tool>/skills/<name>` 创建 → 原件 的软链。
- **FR-23 [P0] 替换既有副本**：目标位置若已有**复制副本**（真实目录），提示「替换为软链」：先备份再建软链，失败回滚（沿用现有备份回滚策略）。
- **FR-24 [P0] 全局卸载软链**：删除该软链，**不删原件**；区分于「卸载复制副本」（删真实目录）。
- **FR-25 [P0] 跨工具复制→软链迁移（P1）**：对已存在的复制副本，提供「转为软链」一键迁移。

### 5.7 更新与反哺（Update & contribute）

- **FR-26 [P0] 更新零成本**：repo pull 后，所有指向其原件的软链（全局 + 各项目）自动指向新内容，无需重新挂载。
- **FR-27 [P0] 更新入口**：仓库总览提供「全部更新」与逐 repo 更新；展示更新结果摘要。
- **FR-28 [P1] 反哺辅助**：对有本地改动的原件，提供「在 Finder 打开原件」「显示 git 状态/diff 摘要」便于手动提交；不做自动 push。

### 5.8 卸载与安全（Safety）

- **FR-29 [P0] 软链删除安全**：任何「卸载/移除」操作，对软链只删链接本身；**禁止对软链目标做递归删除**。
- **FR-30 [P0] 删除原件/仓库的前置检查**：删除 repo 或原件前，扫描所有指向它的软链（全局 + 已知项目），列出受影响项并要求二次确认；删除后清理悬空链接。
- **FR-31 [P0] 悬空链接处理**：扫描发现指向不存在原件的软链时，标记为「断链」，提供清理。

### 5.9 与现有功能的关系（映射）

| 现有能力 | 演进策略 |
|---|---|
| 安装（市场/GitHub tarball/zip/分享短链）→ 复制 | **保留**。GitHub 安装额外提供「克隆到仓库并软链」新选项（推荐路径） |
| 复制到其他工具（copyToTools） | 保留；新增「软链到其他工具」 |
| 卸载（删真实目录） | 保留用于复制副本；软链走 §5.8 的安全卸载（只删链接） |
| 分享（shareSkill，打包上传） | **基本不变**：打包时跟随软链读取原件内容即可（现有 `zip.addLocalFolder(skill.path)` 已跟随软链）。分享缓存键不变 |
| 市场（skills.sh）浏览 | 不变 |
| 扫描（scanAll） | **扩展**：除现有工具全局 roots 外，新增扫描仓库原件、当前项目技能池、各桥接；并在结果中区分「原件/软链/复制副本」与软链目标 |

---

## 6. 用户流程（典型路径）

### 流程 A：首次建立仓库并添加原件
1. 设置仓库根 = `~/GitHub`（默认即可）。
2. 「添加仓库」→ 粘贴 `baoyu/baoyu-skills` → skillkit clone → 列出 `baoyu-comic`、`baoyu-translate` 等原件。
   - 或「纳入已有目录」→ 选 `~/GitHub/baoyu-design` → 登记并列出 `baoyu-design` 原件。

### 流程 B：把原件挂到当前项目（你描述的第二步）
1. 选择当前项目 = `~/GitHub/baoyu-writing`。
2. 在原件 `baoyu-comic` 上「挂载到当前项目」→ 创建 `.agents/skills/baoyu-comic → 原件`。
3. 首次挂载时提示「为 Claude Code/Cursor/… 建立桥接？」→ 创建 `.<tool>/skills → .agents/skills`。

### 流程 C：全局挂载（软链版安装，替代复制）
1. 在原件 `baoyu-comic` 上「全局软链到…」→ 勾选 Claude Code、Cursor。
2. skillkit 在 `~/.claude/skills/baoyu-comic`、`~/.cursor/skills/baoyu-comic` 建软链；若已有复制副本则备份替换。

### 流程 D：更新（核心收益一）
1. 仓库总览 → `baoyu-skills` 显示「有上游更新」→「拉取更新」。
2. pull 完成；全局、`baoyu-writing`、其他所有项目里的 `baoyu-comic` 全部立即变最新，无需任何重挂载。

### 流程 E：修 bug 反哺（核心收益二）
1. 在项目里用漫画 skill 时发现问题 →「在 Finder 打开原件」→ 编辑（落在原件上）。
2. skillkit 显示 `baoyu-skills` 仓库「有本地改动」→ 用户自行 `git commit/push` 提交给开源社区。

### 流程 F：卸载/清理
1. 项目内卸载 `baoyu-comic` → 只删 `.agents/skills/baoyu-comic` 软链，原件不动。
2. 移除 `baoyu-design` 仓库 → 列出受影响软链（全局 1 个 + 项目 2 个）→ 确认 → 解绑并清理悬空链接。

---

## 7. 数据模型

> 原则不变：**文件系统是真相，DB 是缓存**。仓库配置、受管 repo、当前项目需持久化；原件、软链、桥接均由扫描推导。

### 7.1 需要持久化（新增）

- **`meta` KV（复用现有 meta 表）**：
  - `warehouse_root`：仓库根目录（默认 `~/GitHub`）。
  - `current_project`：当前项目路径。
  - `recent_projects`：最近项目（JSON 数组）。
- **新表 `repos`（受管仓库项目）**：
  - `id`、`name`、`local_path`（绝对路径）、`remote_url`、`added_at`、`last_pulled_at`、`last_known_head`。
  - （`adopt` 的目录 `remote_url` 可能为空，允许。）

### 7.2 由扫描推导（不持久化为真相）

- **原件（Original）**：扫描 `repos.local_path` 枚举含 `SKILL.md` 的目录。运行期对象，包含 repoId、绝对路径、frontmatter、git 状态。
- **全局软链**：扫描现有 `TOOLS[*].roots`，对 `lstat` 为符号链接的条目用 `readlink` 取目标 → 判定是否指向某原件。
- **项目软链**：扫描 `current_project/.agents/skills/*`，对每个软链取目标。
- **桥接**：扫描 `current_project/.<tool>项目技能目录`，判定是否为指向 `.agents/skills` 的软链。
- **断链**：软链目标不存在 → 标记 broken。

### 7.3 现有表的影响

- `installed_skills`：扫描时增加**条目类型**字段（`copy` / `symlink-global`）与**软链目标**（`link_target`）。软链条目的卸载走 §5.8 安全逻辑，不删原件。
- `share_links`、`market_skills`：**不受影响**。

> 注：增加列属于 schema 迁移，沿用现有 `migrate()` 增量方式（`ALTER TABLE ADD COLUMN`）。

---

## 8. UI / 信息架构方向（提案，规划期定稿）

现有 Tab：`我的 Skill` /（`推荐 Skill` 暂隐）/ `安装 Skill`。软链接模型引入「仓库」「项目」两个新维度，建议重构为：

- **仓库（Warehouse）**：仓库根设置、受管 repo 列表（添加/纳入/pull/移除）、原件浏览（按 repo 分组）。
- **当前项目（Project）**：项目选择器置顶；展示该项目 `.agents/skills` 已挂载原件 + 各工具桥接状态；挂载/卸载原件、建/拆桥接。
- **我的 Skill（全局）**：沿用现有卡片视图，但卡片标注「原件软链 / 复制副本 / 内置」，并提供「全局软链到…」「转为软链」等动作。
- **安装 Skill**：保留 share/github/zip；GitHub 安装增加「克隆到仓库并软链」选项。

> 最终 IA、Tab 取舍、项目选择器位置（顶栏 vs 独立区）属规划期决策（见 §11 Q7）。

---

## 9. 非功能需求

- **NFR-1 软链安全（最高优先级）**：删除操作对软链只删链接节点，**绝不递归进入目标**；删原件/仓库前必须列出受影响软链并二次确认。
- **NFR-2 断链健壮**：扫描、卸载、分享等全流程对悬空软链容错，不崩溃，给出清晰提示。
- **NFR-3 相对 vs 绝对软链（建议）**：项目内软链若原件与项目同处仓库根下，优先用**相对路径**（项目目录可整体迁移）；全局软链与跨根目录场景用**绝对路径**。最终策略规划期定（见 §11 Q1）。
- **NFR-4 git 依赖**：skillkit 需要 git 能力。方案二选一（规划期定，见 §11 Q4）：① 依赖系统 `git`（要求用户已安装，shell out）；② 内嵌 `isomorphic-git`（无需系统 git，但 pull/clone 行为需验证）。
- **NFR-5 向后兼容**：现有复制副本与 `installed_skills`/`share_links` 数据全部兼容；DB 增量迁移，不动既有数据。
- **NFR-6 幂等**：重复挂载/建桥接为安全 no-op 或定向更新，不产生重复/坏链。
- **NFR-7 平台**：仅 macOS（现状）；软链用 `fs.symlinkSync(type:'dir')`。
- **NFR-8 性能**：仓库/原件扫描走 DB 缓存 + 手动刷新（沿用现有扫描刷新模式），避免每次切换都全量递归。

---

## 10. 跨进程契约影响（遵循 CLAUDE.md 三处协调规则）

新增主进程能力需同步改 `electron/ipc.ts` + `electron/preload.ts` + `shared/types.ts`。预计新增的 `window.skillkit` 方法（规划期细化）：

```
// 仓库
warehouse.get() / setRoot(path)
repo.addByUrl(url) / repo.adopt(dirPath) / repo.pull(repoId) / repo.remove(repoId, deleteClone?)
repo.list() / originals.list()                  // 枚举原件

// 项目
project.setCurrent(dirPath) / project.listRecent()

// 项目级软链 + 桥接
project.link(originalRef) / project.unlink(name) / project.scanLinks()
bridge.create(tool) / bridge.remove(tool) / bridge.scan()

// 全局级软链
globalLink.link(originalRef, tools[]) / globalLink.unlink(tool, name)

// 通用
original.reveal(originalRef)
scanAll()                                        // 扩展：含原件/软链/断链
```

> 这些是需求级签名草案，**非最终 API**；规划阶段确定参数与返回类型，并同步到 `shared/types.ts`。

---

## 11. 待确认 / 规划期决策（Open Questions）

| # | 问题 | 倾向 / 备注 |
|---|---|---|
| Q1 | 软链用相对还是绝对路径？ | 倾向：同仓库根内用相对（可迁移），跨根/全局用绝对 |
| Q2 | 项目技能池目录 `.agents/skills` 是否可配置？ | 倾向：默认 `.agents/skills`，提供设置项 |
| Q3 | Codex / Cursor / Trae 的**项目级** skills 发现目录各是什么？（Claude Code 已确认 `.claude/skills`） | 规划期需逐一核实官方文档/实际行为 |
| Q4 | git 方案：系统 git vs 内嵌 isomorphic-git？ | 倾向：系统 git（macOS 自带，行为标准），shell out |
| Q5 | 目标位置已有复制副本时，全局软链默认行为？ | 倾向：备份后替换为软链（与现有 install 备份回滚一致） |
| Q6 | 是否展示原件 git 状态（落后/已改）以支撑反哺？ | P1，倾向做轻量展示 |
| Q7 | UI 信息架构最终形态（Tab 划分、项目选择器位置）？ | 规划期出具体方案与低保真 |
| Q8 | GitHub 安装的「克隆到仓库并软链」是否作为默认推荐路径？ | 倾向：是（贴合新模型主推软链） |
| Q9 | 删除仓库默认是否删本地克隆？ | 倾向：默认仅解绑不删，需用户显式勾选 |

---

## 12. 分期建议

**P0（MVP — 跑通软链主链路）**
- 仓库根配置 + repo 添加(clone)/纳入/pull/移除（FR-1~5）
- 原件枚举与打开（FR-7、9）
- 当前项目选择 + 项目技能池（FR-11、12）
- 项目级软链 + 四工具桥接（含冲突保护）（FR-14~20）
- 全局级软链（含替换副本）（FR-22~24）
- 更新零成本（FR-26、27）
- 软链安全与断链处理（FR-29~31）
- 扫描扩展 + 类型区分（FR-9 映射）
- 保留全部复制安装能力

**P1（增强）**
- 仓库总览 git 状态、反哺辅助（FR-6、8、10、28）
- 多项目记忆、批量挂载、按工具开关桥接（FR-13、15、21）
- 复制副本「转为软链」一键迁移（FR-25）

---

## 13. 风险与注意

1. **误删原件**：软链删除与递归删除必须严格区分（NFR-1）。这是最高风险点，需专门测试。
2. **桥接覆盖真实目录**：FR-19 的冲突保护失败会丢用户数据，必须强制校验。
3. **四工具项目级目录不确定**（Q3）：若某工具不支持项目级 skills 发现，该项目工具的桥接无法生效，需在 UI 明确标注「该工具暂不支持项目级软链，可用全局软链替代」。
4. **git 依赖与网络**：clone/pull 依赖网络与 git 可用性；失败需清晰报错（沿用现有 fetch 超时/错误处理风格）。
5. **软链与复制副本同目录共存**：`~/.<tool>/skills` 下可能既有软链又有真实副本，扫描/卸载必须逐项判定类型，不能一刀切。
6. **相对软链的可移植性 vs 调试直观性**：相对链对人友好但调试时不直观，需在 UI 显示真实目标。

---

## 14. 验收标准（P0 摘要）

- [ ] 可在 App 内 clone / 纳入仓库，并正确枚举原件。
- [ ] 选定项目后，能把原件挂到 `.agents/skills`，并为四工具建桥接；工具能实际发现这些 skill。
- [ ] 能把原件全局软链到四工具全局目录；已有复制副本可安全替换。
- [ ] repo pull 后，所有已挂载软链指向的内容立即更新，无需重挂载。
- [ ] 卸载任何软链都**只删链接、原件完好**；删 repo 前提示受影响软链。
- [ ] 现有复制安装、分享、市场功能全部回归正常。
- [ ] `npm run build`（tsc 双工程）类型检查通过。
