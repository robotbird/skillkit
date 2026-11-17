import { ALL_TOOLS, TOOL_LABELS, type BuiltinTool } from '@shared/types';
import claudeIcon from '../assets/agents/claude.svg';
import codexIcon from '../assets/agents/codex.svg';
import cursorIcon from '../assets/agents/cursor.svg';
import traeIcon from '../assets/agents/trae.svg';
import workbuddyIcon from '../assets/agents/workbuddy.svg';
import qoderIcon from '../assets/agents/qoder.svg';
import grokIcon from '../assets/agents/grok.svg';
import opencodeIcon from '../assets/agents/opencode.svg';
import geminiIcon from '../assets/agents/gemini.svg';
import antigravityIcon from '../assets/agents/antigravity.svg';
import windsurfIcon from '../assets/agents/windsurf.svg';
import augmentIcon from '../assets/agents/augment.svg';
import codebuddyIcon from '../assets/agents/codebuddy.svg';
import piIcon from '../assets/agents/pi.svg';
import kiroIcon from '../assets/agents/kiro.svg';
import hermesIcon from '../assets/agents/hermes.svg';
import openclawIcon from '../assets/agents/openclaw.svg';
import clineIcon from '../assets/agents/cline.svg';
import warpIcon from '../assets/agents/warp.svg';
import kimiIcon from '../assets/agents/kimi.svg';
import doubaoIcon from '../assets/agents/doubao.svg';
import qwenworkIcon from '../assets/agents/qwenwork.svg';
import zcodeIcon from '../assets/agents/zcode.svg';
import deepseekHarnessIcon from '../assets/agents/deepseek-harness.svg';
import globalIcon from '../assets/agents/global.svg';

/** 内置工具 → 图标；自定义 agent 的图标由 toolCatalog 用首字母兜底合成。 */
export const TOOL_ICON: Record<BuiltinTool, string> = {
  claude: claudeIcon,
  codex: codexIcon,
  cursor: cursorIcon,
  trae: traeIcon,
  doubao: doubaoIcon,
  qwenwork: qwenworkIcon,
  zcode: zcodeIcon,
  'deepseek-harness': deepseekHarnessIcon,
  workbuddy: workbuddyIcon,
  qoder: qoderIcon,
  grok: grokIcon,
  opencode: opencodeIcon,
  gemini: geminiIcon,
  antigravity: antigravityIcon,
  windsurf: windsurfIcon,
  augment: augmentIcon,
  codebuddy: codebuddyIcon,
  pi: piIcon,
  kiro: kiroIcon,
  hermes: hermesIcon,
  openclaw: openclawIcon,
  cline: clineIcon,
  warp: warpIcon,
  kimi: kimiIcon,
};

/** 「全局仓库 ~/.agents/skills」伪目标的地球图标（不入 ICON_CHOICES，仅供安装目标展示）。 */
export const GLOBAL_ICON = globalIcon;

/**
 * 图标选择器数据源：复用内置品牌 SVG（按 ALL_TOOLS 顺序）。
 * 自定义 Agent / 项目登记时从这里挑图标；不新增图标资源。
 */
export const ICON_CHOICES: { key: BuiltinTool; label: string; url: string }[] = ALL_TOOLS.map(
  (key) => ({ key, label: TOOL_LABELS[key], url: TOOL_ICON[key] }),
);
