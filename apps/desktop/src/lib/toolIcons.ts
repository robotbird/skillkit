import type { Tool } from '@shared/types';
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

/** 工具 → 图标；ToolPicker / ToolStack / MySkillsView 共用单源。 */
export const TOOL_ICON: Record<Tool, string> = {
  claude: claudeIcon,
  codex: codexIcon,
  cursor: cursorIcon,
  trae: traeIcon,
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
