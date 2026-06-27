# 技能包（Skill Pack）设计文档

> 状态：**待实现**（架构已定稿，产品决策已锁定）
> 最后更新：2026-06-24
> 适用范围：客户端（Electron）+ 分享服务（Hono，Vercel / 阿里云双部署）

## 1. 概述

支持把**多个已安装的 skill** 打包成一个「技能包」，生成一条短链；接收方点开链接（或深链唤起客户端）可**一键把整包批量安装**到自己选的 agent 工具。

一句话：**多选 skill → 生成包短链 → 接收方批量安装。**

## 2. 核心架构决策（最关键）

**每个 skill 仍是独立的 zip / 独立的 share；「包」只是一层「清单集合」，本身不打包字节。**

| 层 | 形态 |
|---|---|
| 单个 skill | 沿用现有 `/share`：一个 zip（≤4MB）+ 一份 meta，有独立 id |
| 技能包 | 一份**只有 meta、无 zip** 的记录，内含 `skills[]` 清单，每项指向一个 skill share 的 id |

### 为什么这样设计

- **规避 4MB 上传上限**：每次上传的都是单个 skill（本就 ≤4MB）；包本身只是一份几 KB 的 JSON 清单，完全不碰体积红线。无需做大包/分片上传。
- **最大化复用**：创建 = 调 N 次现有 `shareSkill`；安装 = 调 N 次现有 `installFromShare`。整个特性是单 skill 分享之上的一层薄编排，风险低。
- **过期细粒度**：每个 skill 独立过期；安装时逐个解析，挂了的报错、其余照装。

## 3. 数据模型

新增到 `shared/types.ts`，并**同步子集**到 `api/lib/types.ts`（`api/` 不能 import `shared/`，见 CLAUDE.md）。

```ts
// 包内单个 skill 条目（指向一个已存在的 skill share）
interface PackSkillEntry {
  id: string;              // 该 skill 的独立 share id（对应 /share/<id>）
  name: string;
  description: string | null;
  sourceTool: Tool;        // 打包时的来源工具（取分组视图的 primary）
  sizeBytes: number;
}

// 技能包 meta（与 ShareMeta 用 kind 判别字段区分）
interface PackMeta {
  id: string;
  kind: 'pack';
  name: string;            // 包名
  description: string | null;
  skills: PackSkillEntry[];
  sizeBytes: number;       // 所有 skill 体积合计（展示用）
  createdAt: number;
  expiresAt: number;       // 7 天 TTL（SHARE_TTL_MS）
}

interface PackCreateResult { id: string; url: string; expiresAt: number; }
interface PackSourceInfo { meta: PackMeta; exists: boolean; } // exists=false 表示过期/不存在
```

`SkillkitApi` 新增方法：

```ts
// items: 要打包的 skill（tool+name），取各自分组 primary
createPack(items: { tool: Tool; name: string }[], packName: string, description?: string | null): Promise<PackCreateResult>;
inspectPack(input: string): Promise<PackSourceInfo>;
// selectedSkillIds 缺省=包内全部
installPack(input: string, targets: Tool[], selectedSkillIds?: string[]): Promise<InstallResult[]>;
// onDeepLink 已存在，渲染层需识别 skillkit://pack/<id>
```

## 4. 缓存策略（复用 `share_links`，零新增）

**包和单分享共用同一条 `shareSkill` 路径、同一份 `share_links` 缓存。** 打包创建时对每个 skill 调 `shareSkill`，其链接+meta 自动写入 `share_links`；之后单个分享同一 skill 命中同一缓存。

- 链接存活且内容未变 → 直接返回缓存链接，**0 打包、0 上传**。
- 展示 meta（name/description/sourceTool）取自 `installed_skills`（扫描已缓存），不在 `share_links` 重复存。

**不缓存 zip 字节**（曾考虑 `zip_blob`，已否决）。无新表、无 schema 改动。

> 固有约束：`share_links` 链接 7 天过期、服务端清掉后，再分享需重新打包+上传（缓存未命中）。这是「分享记录缓存」的既有语义，可接受。

## 5. 服务端改动（`api/lib/` + Vercel 函数文件）

### 5.1 路由（与 `/share` 同构，加在 `app.ts`）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/pack` | **JSON body**：`{packName, description, skills:[{id,name,description,sourceTool,sizeBytes}]}`。生成包 id，存包 meta（无 zip），返回 `{id,url,expiresAt}` |
| GET | `/pack/:id` | 包接收页 HTML |
| GET | `/pack/:id/meta` | `PackMeta` JSON |

P0 **不提供** `/pack/:id/zip`（包没有单一 zip；整包打包下载见 §10 未来项）。

### 5.2 存储接口小改（`ShareStore`）

包是「meta-only」记录，现有接口假定「每个 id 都有 zip」，需放宽：

- `has(id)`：当前 `metaExists && zipExists` → 改为**只判 meta 是否存在**（zip 可选；读 meta 区分 kind）。
- 新增 `writePackMeta(meta: PackMeta)`（只写 meta JSON，不写 zip），或把 `writeShare` 的 zip 参数设为可选。
- `getZip(id)`：对包 id 返回 `null`（路由层处理）。
- `writeShare` 的 meta 类型放宽为 `ShareMeta | PackMeta`。
- **sweep 无需改动**：按 `expiresAt` 过期、kind 无关，包 meta 自动被清。

### 5.3 Vercel 函数文件（严格遵循 CLAUDE.md 踩坑规则）

按路由深度一文件一个、**不用 catch-all**，每个都是 Web-API `fetch` 导出：

```
api/pack/index.ts        # POST /pack
api/pack/[id].ts         # GET /pack/:id (HTML)
api/pack/[id]/meta.ts    # GET /pack/:id/meta
```

每个文件体：
```ts
export const config = { runtime: 'nodejs', maxDuration: 60 };
export const fetch = (req: Request) => app.fetch(req);
```
import `app` 时按深度调整相对路径（`../lib/app.js` 等）。

### 5.4 `vercel.json`

新增 rewrite：`/pack/:path*` → `/api/pack/:path*`（与现有 `/share` rewrite 同形）。**不要**为 `/api/*` 加 catch-all。

### 5.5 部署注意（沿用现有）

- Settings → Framework Preset 必须为 **"Other"**（非 Vite）。
- `api/lib/types.ts` 同步新增 `PackMeta` / `PackSkillEntry` / `PackCreateResult` 子集。
- 包 meta 公开可读（与单 share 一致，内容本就公开）。

## 6. 客户端：创建流程

入口在「我的 Skill」**多选模式**（见 §8 决策 3）。

1. 进入多选模式，卡片出现复选框，选中 ≥1 后底部浮出 `生成技能包（N）`。
2. 弹 **PackCreateDialog**：预填包名（如「我的技能包 · 日期」，可改）+ 可选描述。
3. 主进程 `createPack(items, name, desc)`：
   - 对每个 item 调 `shareSkill(tool, name)`（命中 `share_links` 缓存则秒过），收集 `{id, name, description, sourceTool, sizeBytes}`。
   - 组装清单 → `POST /pack`（JSON）→ 拿到 `{id, url, expiresAt}`。
4. 成功弹结果窗：展示 `https://skillkit.net/pack/<id>` + 复制按钮 + 剩余天数（复用 `ShareDialog` 样式）。

## 7. 客户端：安装流程

入口：① 粘贴 pack 链接；② 接收页「从 Skillkit 打开」深链唤起。

1. `inspectPack(input)` → `GET /pack/:id/meta` → `PackMeta`。
2. **包安装对话框**：包名/描述 + 包内 skill 列表（可逐个勾选/取消）+ 工具选择器（整包装到选中的工具）。
3. `installPack(input, targets, selectedIds?)`：对每个选中 skill 的 id 调 `installFromShare(skillId, targets)`，汇总结果。
   - `installFromShare` 已处理单 skill 的拉 zip + 安装 + 错误；这里只做循环编排。
   - 结果需带 **skill 维度归属**（现有 `InstallResult` 只有 tool 维度）。P0 可用汇总 toast（成功 N 个、失败列出），或扩展返回 `{skillName, tool, ok, error}[]`。

> 链接解析：把 `parseShareId` 泛化为 `parseShareRef`，识别 `pack/<id>` 与 `share/<id>`，返回 `{kind, id}`。

## 8. 已锁定的产品决策

1. **公开 URL**：独立 `/pack/<id>` + 深链 `skillkit://pack/<id>`（与单 skill 彻底解耦）。
2. **安装目标**：整包内勾选的 skill 统一装到**同一组目标工具**（`installFromShare` 直接 loop）。不做「每个 skill 单独选目标」。
3. **创建入口**：「我的 Skill」加**多选模式**，底部浮「生成技能包（N）」。不新增独立 Tab。

（体积上限问题已被 §2 架构规避，无需决策。）

## 9. 深链

- 注册/处理沿用现有 `skillkit://` 机制（`electron/main` 的深链 handler + `onDeepLink` 推给渲染层）。
- 渲染层收到 `skillkit://pack/<id>` → 调 `inspectPack` → 打开包安装对话框。
- `skillkit://share/<id>` 行为不变。

## 10. 边界与约束

| 场景 | 处理 |
|---|---|
| 单 skill 超 4MB | `shareSkill` 已有的上限校验，清晰报错 |
| 包内 skill 逐个过期 | 安装时逐个解析；过期/不存在的 skill 报失败，其余照装 |
| 同一 skill 被多个包引用 | 允许，share id 复用（缓存命中） |
| 包 meta 过期 | `/pack/:id` 返回 410，接收页与客户端友好提示 |
| 内置 skill 打包 | 允许（用户选择），安装按普通 skill |
| 跨工具来源 | 每个 skill 带 sourceTool，包内可混合 |
| 包内只选 1 个 | 仍走 pack（不强转 single） |

## 11. 分期

**P0（MVP）**
- 「我的 Skill」多选模式 + `生成技能包`
- `shareSkill` 复用缓存（已具备）
- `createPack` / `inspectPack` / `installPack`
- 服务端 `/pack` 全套 + Vercel 函数文件 + vercel.json rewrite
- 包接收页（列 skill + 深链 + 复制链接 + 逐个 skill zip 下载）
- `skillkit://pack/<id>` 深链

**P1（未来）**
- 整包打包下载（服务端按需把 N 个 skill zip 现拼流式 zip 返回——下载不受 4MB 限制）
- 「我创建的包」管理视图（列出/撤销包）
- 包级链接缓存（同一组成员复用同一包短链）
- 包内每个 skill 单独选目标工具

## 12. 涉及文件清单（实现时的 touch points）

**共享类型**
- `shared/types.ts`：新增 `PackMeta` / `PackSkillEntry` / `PackCreateResult` / `PackSourceInfo`；`SkillkitApi` 加 3 个方法
- `api/lib/types.ts`：同步上述子集

**服务端**
- `api/lib/app.ts`：新增 `/pack` 路由 3 条
- `api/lib/store.ts`：`has` 放宽 + `writePackMeta`（或 `writeShare` zip 可选）
- `api/lib/store-blob.ts`：同步 meta-only 支持
- `api/pack/index.ts`、`api/pack/[id].ts`、`api/pack/[id]/meta.ts`：新建（Vercel 函数）
- `vercel.json`：加 `/pack` rewrite
- `api/tsconfig.json`：若新文件需纳入（一般自动）

**客户端（Electron 主进程）**
- `electron/share.ts`：`createPack` / `inspectPack` / `installPack` + `parseShareRef`
- `electron/ipc.ts`：3 个新 IPC handler
- `electron/preload.ts`：`window.skillkit` 加 3 个方法
- `electron/main`（深链 handler）：确认 `skillkit://pack/<id>` 能透传给渲染层

**客户端（渲染层）**
- `src/views/MySkillsView.tsx`：多选模式 + `生成技能包` 入口
- `src/components/PackCreateDialog.tsx`：新建
- `src/components/PackInstallDialog.tsx`：新建（或复用 ToolPicker）
- `src/App.tsx`：深链 `pack/<id>` → 打开安装对话框
- `src/styles/theme.css`：多选复选框、底部操作条、包对话框样式

**三处协调**：任何主进程新能力都要同步改 `ipc.ts` + `preload.ts` + `shared/types.ts`（CLAUDE.md 既定规则）。

## 13. 设计要点速记

- 包 = 清单，不打包字节；规避 4MB。
- 全程复用 `shareSkill` / `installFromShare` / `share_links` 缓存。
- 存储层只需支持「meta-only」记录这一处小改。
- Vercel 部署严守「一文件一路由深度、无 catch-all、Web-API fetch 导出」。
