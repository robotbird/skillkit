import fs from 'node:fs';
import path from 'node:path';

export interface SkillMd {
  name?: string;
  description?: string;
  license?: string;
  raw: Record<string, string>;
}

/**
 * 极简 YAML frontmatter 解析。SKILL.md 只用扁平 key: value，
 * 描述可能跨多行（YAML 中以 `|` / `>` 标识），但实践中都是单行字符串。
 */
export function parseFrontmatter(text: string): SkillMd | null {
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end < 0) return null;
  const block = text.slice(3, end).replace(/\r\n/g, '\n');
  const out: Record<string, string> = {};

  let currentKey: string | null = null;
  for (const lineRaw of block.split('\n')) {
    const line = lineRaw.replace(/\s+$/g, '');
    if (!line.trim()) continue;
    // 续行：以 2+ 空格开头且当前已经有 key
    if (currentKey && /^\s+\S/.test(line)) {
      out[currentKey] += ' ' + line.trim();
      continue;
    }
    const m = line.match(/^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let value = m[2].trim();
    // 去掉首尾引号
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
    currentKey = key;
  }

  return {
    name: out.name,
    description: out.description,
    license: out.license,
    raw: out,
  };
}

/** 读取 SKILL.md 或 AGENTS.md 中的 frontmatter；找不到则返回 null。 */
export function readSkillMd(skillDir: string): SkillMd | null {
  const candidates = ['SKILL.md', 'AGENTS.md'];
  for (const file of candidates) {
    const full = path.join(skillDir, file);
    if (!fs.existsSync(full)) continue;
    try {
      const text = fs.readFileSync(full, 'utf8');
      const md = parseFrontmatter(text);
      if (md) return md;
    } catch {
      // ignore unreadable file
    }
  }
  return null;
}
