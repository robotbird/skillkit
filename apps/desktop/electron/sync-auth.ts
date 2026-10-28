import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function isCredentialError(raw: string): boolean {
  // GitHub deliberately also returns 404 when a private repository is not accessible.
  return /Authentication failed|could not read (?:Username|Password)|terminal prompts disabled|Permission denied|publickey|403|Repository not found|404/i.test(raw);
}

/** Only use GitHub CLI for GitHub HTTPS after system credentials fail; explicit PATs remain authoritative. */
export function githubCredentialFallback(url: string | undefined, hasToken: boolean, raw: string): string[] | null {
  if (hasToken || !url || !isCredentialError(raw)) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com' || parsed.port || parsed.username || parsed.password) return null;
  } catch {
    return null;
  }
  const dirs = [...(process.env.PATH || '').split(path.delimiter),
    '/opt/homebrew/bin', '/usr/local/bin', path.join(os.homedir(), '.local', 'bin'),
    ...(process.platform === 'win32' ? [
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'GitHub CLI'),
      path.join(os.homedir(), 'scoop', 'shims'),
    ] : []),
  ].filter(Boolean);
  const executable = process.platform === 'win32' ? 'gh.exe' : 'gh';
  for (const dir of new Set(dirs)) {
    const candidate = path.resolve(dir, executable);
    try {
      if (!fs.statSync(candidate).isFile()) continue;
      fs.accessSync(candidate, process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK);
      // Git runs ! helpers through its shell (also on Windows); quote the executable, never a token.
      const quoted = "'" + candidate.replaceAll('\\', '/').replaceAll("'", "'\\''") + "'";
      return ['-c', 'credential.https://github.com.helper=',
        '-c', `credential.https://github.com.helper=!${quoted} auth git-credential`];
    } catch {
      // Try other standard locations: GUI PATH often does not include Homebrew.
    }
  }
  return null;
}

export function credentialErrorMessage(raw: string, url: string | undefined, hasToken: boolean, write: boolean): string | null {
  if (!isCredentialError(raw)) return null;
  if (/Repository not found|404/i.test(raw)) {
    return '仓库不存在或无权访问：请核对地址；私有仓库需在这台电脑填写有访问权限的 PAT 并保存，或配置 GitHub CLI / 系统 Git 凭据';
  }
  if (url && /^(ssh:\/\/|git@)/.test(url)) {
    return '认证失败：请在这台电脑配置有权访问该仓库的 SSH 密钥，或改用 HTTPS 地址并填写 PAT';
  }
  const permission = write ? '推送需 Contents 读写权限' : '拉取和测试连接只需 Contents 读取权限';
  return hasToken
    ? `认证失败：请检查本机保存的 PAT 是否过期、是否已选择该仓库（${permission}）`
    : `认证失败：这台电脑没有可用的仓库访问凭据。请填写 PAT 后保存配置，或先运行 gh auth login（${permission}）；另一台电脑的凭据不会随 Skill 同步`;
}


/** execFile reports a timeout as a killed process, often without stderr. Keep that cause visible. */
export function gitFailureDetails(error: unknown, timeoutMs: number, token?: string | null): string {
  const failure = error as { stderr?: string; stdout?: string; message?: string; killed?: boolean; signal?: string; code?: string | number } | null;
  const output = [failure?.stderr, failure?.stdout, failure?.message].filter(Boolean).join('\n');
  let details: string;
  if (failure?.killed && failure.signal === 'SIGTERM') {
    details = `Git 操作超时（已等待 ${Math.ceil(timeoutMs / 1000)} 秒）：下载或上传未能在时限内完成，请检查网络或代理后重试。\n${output}`;
  } else if (failure?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
    details = `Git 输出超过缓冲区限制，请重试或检查 Git 调试输出配置。\n${output}`;
  } else if (failure?.signal) {
    details = `Git 进程被信号 ${failure.signal} 终止。\n${output}`;
  } else {
    details = output || `Git 执行失败${failure?.code ? `（退出码 ${failure.code}）` : ''}`;
  }
  if (token) {
    for (const secret of [token, Buffer.from(`x-access-token:${token}`).toString('base64')]) {
      details = details.split(secret).join('[REDACTED]');
    }
  }
  return details;
}
