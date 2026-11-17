# 桌面端技能接入：豆包工作、千问办公、ZCode 与 DeepSeek Harness

本期只接入 macOS 上这四个应用的用户级 Skills，沿用 Skillkit 现有的技能导入、扫描和全局仓库流程。

| 工具 | 本机应用包 | Skillkit 中的管理方式 | 当前证据 |
| --- | --- | --- | --- |
| 豆包工作 | `Doubao.app` | 独立来源，扫描 `.skills` 与 `.user_skills`，安装到 `.user_skills` | 本机已有系统与用户技能。两个目录位于下文定义的豆包工作区。 |
| 千问办公 | `QwenWorkCN.app` | 独立来源，目录 `~/.qwenworkcn/skills` | 本机已有技能，[官方文档](https://docs.qwenwork.cn/features/skills)也明确了目录。 |
| ZCode | `ZCode.app` | 独立管理 `~/.zcode/skills`，同时读取 `~/.agents/skills` | 专用目录见 [ZCode 文档](https://zcode.z.ai/cn/docs/qa)，共享目录兼容性由用户确认。 |
| DeepSeek Harness | `DeepSeek Harness.app` | 全局仓库使用方 | [上游文件系统提供方](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/skill/skill-filesystem/README.zh.md)包含 `<agentsHome>/skills`，也支持其他根目录。本期只接共享路径，并验证当前桌面配置实际指向 `~/.agents/skills`。 |

## 改动范围

1. 在 `apps/desktop/shared/types.ts`、`apps/desktop/electron/tools.ts` 和前端图标目录注册四个稳定的内置工具 ID。沿用应用包探测，区分「应用已安装」和「技能目录存在」。千问和豆包接入独立安装目标。
2. Harness 复用 `isGlobalAgentsOnlyTool()`，应用探测与安装目标分开。全局仓库卡片可显示 ZCode 和 Harness 两个使用方。
3. ZCode 的 `roots` 和 `installRoot` 都指向 `~/.zcode/skills`，作为独立安装目标。全局仓库统一扫描和管理 `~/.agents/skills`。在 ZCode 中使用共享技能，由客户端直接读取全局仓库。同名技能分别标明「ZCode 专用」和「全局」，按实际目录执行更新和卸载。Harness 的自定义共享根保留用户配置。
4. 千问现有技能与新安装技能可能共处一目录，扫描不等于纳入管理。先确认官方预置技能能否可靠识别；首版对已有且未由 Skillkit 管理的技能仅展示，禁止覆盖或卸载。同目录已被登记成自定义工具时做路径去重，不迁移、不删除原文件。

## 豆包工作目录配置

工作区为 `~/Library/Application Support/Doubao/Default/.doubao/agent_mode/workspace`。用现有的 `appDataDir()` 加相对路径构建目录，首版匹配 macOS 的 `Default` 配置。

| 配置 | 值 |
| --- | --- |
| `roots` | 工作区下的 `.user_skills` 和 `.skills` |
| `installRoot` | `.user_skills` |
| `builtinRoot` | `.skills` |
| `detectRoots` | 豆包工作区 |
| `appBundles` | `Doubao.app` |

复用 Trae 的内置技能标记。系统技能可浏览，安装、更新和卸载只作用于用户目录。如果两个目录中存在同名技能，Skillkit 当前按工具和名称保留一条记录，优先展示用户技能。删除用户技能后，系统技能会重新显示。客户端的加载优先级通过实测确认。豆包工作区尚未初始化时提示先打开豆包工作。

## DeepSeek Harness 项目级技能目录

按本机提供的优先级从高到低记录如下。

| Rank | 来源 | 路径 |
| --- | --- | --- |
| 100 | 项目级 DSH | `<项目根>/.dsh/skills` |
| 200 | 项目级共享 | `<项目根>/.agents/skills` |

本期的全局仓库对应用户级 `~/.agents/skills`。项目级目录在后续接入项目扫描时使用，届时用同名测试技能验证当前 Harness 版本的实际加载顺序。

## 验收

- 用一个无脚本、名称唯一的测试技能，验证千问和豆包的发现、刷新及删除行为，仅删除测试文件。豆包额外验证系统技能只读，以及安装同名用户技能时系统文件不被覆盖。
- 将测试技能放入全局仓库一次，在 ZCode 和 Harness 会话的技能列表中核对发现、更新和移除。再将另一个测试技能安装到 ZCode 专用目录，验证独立安装和卸载。
- 确认每个共享技能只显示一条、写入一次。选择 ZCode 为安装目标时，写入专用目录。移除全局技能前提示会影响共享使用方。
- 确认仅有残留目录不算应用已安装；现有工具的安装、扫描及全局仓库行为保持一致。Windows、Linux 与项目级目录留待后续验证。
