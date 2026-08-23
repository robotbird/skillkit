# 全局仓库 Git 同步(需求定稿)

> 状态:**已实现**(Round 1 用户确认 1A/2B/3A/4A+C/5A/6A;Round 2 按下表默认值实现,可推翻调整)。
> 目标:设置里配置 git 远程地址后,已安装 skills 自动同步到用户的 GitHub 仓库。

## Round 1 决策(用户已确认)

| # | 决策 | 选择 |
|---|------|------|
| Q1 | 同步范围 | **A** — 只同步全局仓库 `~/.agents/skills`(规范副本库;仅装到单工具、未提升全局仓的 skill 不在范围内,产品出口是"装为全局") |
| Q2 | 方向 | **B** — 单向推送(备份,按钮「推送到仓库」)+ 手动「拉取最新」(全量覆盖式,不做逐 skill 合并) |
| Q3 | 触发 | **A** — 安装/卸载/复制等变更后自动同步(防抖合并)+ 应用启动时一次;设置里有「自动同步」开关,手动「立即同步」按钮常驻 |
| Q4 | 认证 | **A+C,兼容 B** — git 地址支持 HTTPS/SSH;HTTPS 时提供可选 PAT 输入(存 safeStorage),未填 PAT 回落系统 git 凭据(osxkeychain / gh);不做 OAuth |
| Q5 | 实现 | **A** — 调系统 `git` 子进程(execFile),不引 isomorphic-git;检测不到 git 时设置页提示 |
| Q6 | 远程仓库 | **A** — 用户自建(可为空仓库),填 URL;不自动创建仓库 |

## Round 2 推导决策(默认值,待确认)

| # | 决策 | 默认值 | 理由 |
|---|------|--------|------|
| Q7 | 仓库形态 | `~/.agents/skills` **原地 `git init`**(目录即仓库,skills 在根,写 `.gitignore` 忽略 `.DS_Store` / `.bak-*` / `.skill-lock.json`) | 文件系统即真相的既有哲学;镜像目录需双向搬运,违背单一数据源。`.git` 点前缀,scanGlobalRepo 天然跳过 |
| Q8 | push 冲突 | 正常 push → 被拒则 `pull --rebase` 后重试 → 仍失败把错误显示在设置页,**不自动强推**,不提供强推按钮 | 备份语义下强推丢数据风险大;真正的分叉应提示用户手动处理 |
| Q9 | 恢复语义 | 「拉取最新」(原「从远程恢复」) = `fetch` + `reset --hard origin/<branch>` + `clean -fd`,**整量覆盖**(本地全局仓中未同步内容会丢),UI 二次确认弹窗明示 | Q2B 的直接推论;确认弹窗兜底误操作 |
| Q10 | commit 信息 | `sync: +N/-M skills <YYYY-MM-DD HH:mm>`(变更统计来自 `git status --porcelain` 前后差) | 人可读,远程仓库浏览友好 |
| Q11 | 分支 | 不暴露设置。init 用 `-b main`;远程已有内容时以远端 HEAD 为准(`push -u origin HEAD`) | 减少配置面 |
| Q12 | 首次同步 | 配置 URL 保存后立即跑一次完整同步(init + 首次 commit + push),让错误尽早暴露 | 「设置后可以自动同步」的直接兑现 |
| Q13 | UI 位置 | 设置弹窗新增「同步」section(位于「Skill 空间」与「更新」之间);不做 TopBar 常驻图标 | v1 聚焦设置页;自动同步失败仅在该 section 显示状态 |

## 行为规格

### 配置(设置 → 同步)
- 字段:git 远程地址(必填,HTTPS/SSH 均可)、PAT(可选,密码框)、自动同步开关(配置成功后默认开)。
- 「测试连接」:对远程 `git ls-remote`,即时反馈可达性/权限。
- 保存即触发首次同步(Q12)。清空地址 = 停用同步(保留 `.git`,不删数据)。

### 自动同步(Q3)
- 触发点:主进程所有引起全局仓/已装 skill 变化的 IPC handler(安装/卸载/复制/全局仓增删/更新应用,即 ipc.ts 中 scanAll() 的调用点)之后。
- 防抖 5s:连续变更合并为一次 push。
- 启动时(main.ts 启动扫描后)若已配置且自动开关开 → 同步一次。
- 同步进行中收到新触发 → 完成后补跑一次(不丢变更)。

### 单次同步流程(sync.ts)
1. `~/.agents/skills` 无 `.git` → `git init -b main` + 写 `.gitignore` + `remote add origin <url>`。
2. `git add -A` → 无变更则跳过 commit(仅启动触发的空跑)。
3. `git commit -m "sync: …"`。
4. `git push`;被拒(fetch head 落后)→ `pull --rebase` → 再 push;仍失败 → 状态记错误(Q8)。
5. 结果写 meta KV:时间、状态(ok/error+摘要)、上次 commit hash;渲染层打开设置页时读取展示。

### PAT 注入(不落盘)
- PAT 仅存 safeStorage(同 auth_token 模式,`enc:`/`plain:` 前缀)。
- 命令级注入:`git -c http.<repo-base>.extraheader="AUTHORIZATION: basic <b64(x-access-token:PAT)>" …`,凭据不进 `.git/config`、不进 argv 明文。
- SSH URL 或无 PAT → 直接走系统 git 凭据链。

### 提交身份(user.name/email,署名而非认证)
- 优先级:设置里存的「提交身份」(用户名+邮箱成对) → 系统 git 配置 → Skillkit 兜底(`Skillkit <skillkit@local>`);统一 `identityFallbackArgs()` 命令级 `-c` 注入,不落盘不污染全局配置。
- commit 与 rebase(重建提交)都需要身份,两处统一走该辅助;无身份机器不再报 Committer identity unknown。
- 设置页该字段默认收起;系统 git 无身份且设置里也没存时自动展开提示(邮箱与 GitHub 账号一致可计入贡献图)。

### 拉取最新(原「从远程恢复」,Q9)
- 仅手动:设置页按钮 → 二次确认(明示覆盖语义)→ fetch + reset --hard + clean -fd → scanAll() 刷新各视图。
- 恢复后软链不受影响(工具目录软链指向全局仓内路径,内容原地更新)。

## 涉及改动面(实现清单)

- `shared/types.ts`:`SyncConfig` / `SyncStatusInfo` 类型、`SETTING_KEYS` 增 `sync_repo_url` / `sync_auth_token` / `sync_auto` / `sync_last_time` / `sync_last_status`、`SkillkitApi` 增 5 个方法。
- `electron/sync.ts`(新):git execFile 封装、ensureRepo、syncNow、restoreFromRemote、testRemote、scheduleSkillSync(防抖)。
- `electron/ipc.ts`:`sync:status/configure/test/now/restore` handler;变更 handler 后挂 `scheduleSkillSync()`。
- `electron/preload.ts`:暴露对应方法。
- `src/components/SettingsDialog.tsx` + `src/i18n/messages.ts`:「同步」section(zh/en)。
- `electron/main.ts`:启动后自动同步一次。
