import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import ts from 'typescript';

const moduleUrl = (source) => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText).toString('base64');
const filesUrl = moduleUrl(fs.readFileSync(new URL('../electron/sync-files.ts', import.meta.url), 'utf8'));
const authUrl = moduleUrl(fs.readFileSync(new URL('../electron/sync-auth.ts', import.meta.url), 'utf8'));
const { credentialErrorMessage, githubCredentialFallback } = await import(authUrl);
const { writeSnapshot, restoreSnapshot } = await import(filesUrl);
const directoryLinkType = process.platform === 'win32' ? 'junction' : 'dir';
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'skillkit-sync-test-'));
function skill(root, content) {
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'SKILL.md'), `---\nname: same-name\n---\n${content}`);
  fs.writeFileSync(path.join(root, 'scripts', 'run.sh'), content, { mode: 0o755 });
  return root;
}

async function loadSync() {
  const keys = Object.fromEntries(['syncRepoUrl', 'syncAuto', 'syncAuthToken', 'syncGitName', 'syncGitEmail', 'syncLastTime', 'syncLastStatus'].map(k => [k, k]));
    let code = fs.readFileSync(new URL('../electron/sync.ts', import.meta.url), 'utf8');
    const mocks = {
      electron: 'export const safeStorage = {isEncryptionAvailable: () => false};',
      './db.js': 'export const metaGet = k => globalThis.__syncTest.meta.get(k); export const metaSet = (k,v) => globalThis.__syncTest.meta.set(k,v);',
      './global-repo.js': 'export const globalRepoRoot = () => globalThis.__syncTest.root; export const scanGlobalRepo = () => [];',
      './scan.js': 'export const scanTool = () => globalThis.__syncTest.scans;',
      './tools.js': "export const allToolIds = () => ['codex']; export const getToolConfig = () => ({installRoot: globalThis.__syncTest.tools}); export const isGlobalAgentsOnlyTool = () => false; export const listCustomToolsMeta = () => [];",
      '../shared/types.js': `export const SETTING_KEYS = ${JSON.stringify(keys)};`,
    };
    // Transpile first to remove type-only imports before replacing runtime dependencies.
    code = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    for (const [specifier, source] of Object.entries(mocks)) code = code.replaceAll(`'${specifier}'`, JSON.stringify(moduleUrl(source)));
    code = code.replaceAll("'./sync-files.js'", JSON.stringify(filesUrl));
    code = code.replaceAll("'./sync-auth.js'", JSON.stringify(authUrl));
    return import(moduleUrl(code));
}

test('portable snapshots preserve distinct same-name tool skills, assets and custom project paths', () => {
  const dir = temp();
  try {
    const root = path.join(dir, 'repo'); fs.mkdirSync(root);
    const a = skill(path.join(dir, 'a'), 'claude');
    const b = skill(path.join(dir, 'b'), 'codex');
    const link = path.join(dir, 'link'); fs.symlinkSync(a, link, directoryLinkType);
    writeSnapshot(root, [
      { tool: 'claude', relative: 'same', source: link },
      { tool: 'codex', relative: 'same', source: b },
      { tool: 'custom:project', label: 'project', kind: 'project', relative: '.claude/skills/same', source: a },
    ]);
    fs.rmSync(a, { recursive: true }); fs.rmSync(b, { recursive: true });
    const result = restoreSnapshot(root, (e) => path.join(dir, 'new-computer', e.tool.replace(':', '-')));
    assert.equal(result.restored, 3); assert.deepEqual(result.warnings, []);
    assert.equal(fs.readFileSync(path.join(dir, 'new-computer/codex/same/scripts/run.sh'), 'utf8'), 'codex');
    assert.equal(fs.readFileSync(path.join(dir, 'new-computer/claude/same/scripts/run.sh'), 'utf8'), 'claude');
    assert.equal(fs.lstatSync(path.join(dir, 'new-computer/claude/same')).isSymbolicLink(), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('restore rejects traversal and payload symlinks before writing tool files', () => {
  const dir = temp();
  try {
    const root = path.join(dir, 'repo'); fs.mkdirSync(root);
    writeSnapshot(root, [{ tool: 'codex', relative: 'safe', source: skill(path.join(dir, 'a'), 'a') }]);
    const manifestPath = path.join(root, '.skillkit-sync/manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.entries[0].relative = '../outside';
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    assert.throws(() => restoreSnapshot(root, () => path.join(dir, 'dest')), /路径或格式/);
    manifest.entries[0].relative = 'safe';
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    fs.symlinkSync(path.join(dir, 'a'), path.join(root, '.skillkit-sync', manifest.entries[0].payload, 'unsafe'), directoryLinkType);
    assert.throws(() => restoreSnapshot(root, () => path.join(dir, 'dest')), /软链/);
    assert.equal(fs.existsSync(path.join(dir, 'dest')), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('unknown custom tools stay backed up; cycles fail without replacing previous snapshot', () => {
  const dir = temp();
  try {
    const root = path.join(dir, 'repo'); fs.mkdirSync(root);
    const source = skill(path.join(dir, 'a'), 'a');
    writeSnapshot(root, [{ tool: 'custom:a', label: 'A', relative: 'a', source }]);
    const before = fs.readFileSync(path.join(root, '.skillkit-sync/manifest.json'), 'utf8');
    assert.equal(restoreSnapshot(root, () => undefined).warnings.length, 1);
    fs.symlinkSync(source, path.join(source, 'cycle'), directoryLinkType);
    assert.throws(() => writeSnapshot(root, [{ tool: 'codex', relative: 'b', source }]), /循环/);
    assert.equal(fs.readFileSync(path.join(root, '.skillkit-sync/manifest.json'), 'utf8'), before);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('real Git: push on computer A, restore and distribute on B, then push to remote default branch', async () => {
  const dir = temp();
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const state = { root: path.join(dir, 'A'), tools: path.join(dir, 'toolsA'), meta: new Map(), scans: [] };
  globalThis.__syncTest = state;
  try {
    const remote = path.join(dir, 'remote.git'); fs.mkdirSync(remote); git(remote, 'init', '--bare', '-b', 'main');
    state.meta.set('syncRepoUrl', remote);
    state.scans = [{ path: skill(path.join(state.tools, 'only-codex'), 'first'), isBuiltin: false }];
    fs.writeFileSync(path.join(state.scans[0].path, '.gitignore'), '*.sh\n');
    const api = await loadSync();
    assert.equal((await api.syncNow()).ok, true);
    const manifest = JSON.parse(git(remote, 'show', 'main:.skillkit-sync/manifest.json'));
    assert.equal(manifest.entries[0].relative, 'only-codex');
    assert.equal(git(remote, 'show', `main:.skillkit-sync/${manifest.entries[0].payload}/scripts/run.sh`), 'first');
    assert.equal((await api.syncNow()).pushed, false);
    state.root = path.join(dir, 'B'); state.tools = path.join(dir, 'toolsB'); state.scans = [];
    const restored = await api.restoreFromRemote();
    assert.equal(restored.ok, true, JSON.stringify(restored)); assert.equal(restored.restored, 1);
    assert.equal(fs.readFileSync(path.join(state.tools, 'only-codex/scripts/run.sh'), 'utf8'), 'first');
    assert.equal(git(state.root, 'branch', '--show-current'), 'main');
    state.scans = [{ path: path.join(state.tools, 'only-codex'), isBuiltin: false }];
    git(state.root, 'branch', '-m', 'different-local-name');
    fs.writeFileSync(path.join(state.tools, 'only-codex/scripts/run.sh'), 'second');
    assert.equal((await api.syncNow()).ok, true);
    assert.equal(git(remote, 'for-each-ref', '--format=%(refname)', 'refs/heads'), 'refs/heads/main');
    const before = git(remote, 'rev-parse', 'main');
    assert.equal((await api.configureSync({ repoUrl: 'https://github.com/example/skills.git', auto: false })).ok, true);
    assert.equal(git(remote, 'rev-parse', 'main'), before);
  } finally { delete globalThis.__syncTest; fs.rmSync(dir, { recursive: true, force: true }); }
});


test('restore replaces a target symlink without changing its external source or unrelated skills', () => {
  const dir = temp();
  try {
    const root = path.join(dir, 'repo'); fs.mkdirSync(root);
    const source = skill(path.join(dir, 'source'), 'new');
    const external = skill(path.join(dir, 'external'), 'old');
    const destination = path.join(dir, 'tools'); fs.mkdirSync(destination);
    fs.symlinkSync(external, path.join(destination, 'same'), directoryLinkType);
    skill(path.join(destination, 'unrelated'), 'keep');
    writeSnapshot(root, [{ tool: 'codex', relative: 'same', source }]);
    assert.equal(restoreSnapshot(root, () => destination).restored, 1);
    assert.equal(fs.readFileSync(path.join(external, 'scripts/run.sh'), 'utf8'), 'old');
    assert.equal(fs.readFileSync(path.join(destination, 'same/scripts/run.sh'), 'utf8'), 'new');
    assert.equal(fs.readFileSync(path.join(destination, 'unrelated/scripts/run.sh'), 'utf8'), 'keep');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});


test('authentication errors explain new-computer credentials and distinguish read/write access', () => {
  const raw = "fatal: could not read Username for 'https://github.com': terminal prompts disabled";
  assert.match(credentialErrorMessage(raw, 'https://github.com/a/b.git', false, false), /这台电脑.*读取权限/);
  assert.match(credentialErrorMessage(raw, 'https://github.com/a/b.git', true, true), /PAT.*读写权限/);
  assert.match(credentialErrorMessage('Repository not found', 'https://github.com/a/b.git', false, false), /私有仓库/);
  assert.match(credentialErrorMessage('Permission denied (publickey)', 'git@github.com:a/b.git', false, false), /SSH 密钥/);
  assert.equal(credentialErrorMessage('Connection timed out', undefined, false, false), null);
});

test('GitHub CLI helper uses shell-safe paths and does not override explicit PAT, SSH or other hosts', () => {
  const dir = temp();
  const oldPath = process.env.PATH;
  try {
    const bin = path.join(dir, "bin with ' quote"); fs.mkdirSync(bin);
    const executable = path.join(bin, process.platform === 'win32' ? 'gh.exe' : 'gh');
    fs.writeFileSync(executable, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    process.env.PATH = bin;
    const args = githubCredentialFallback('https://github.com/a/b.git', false, 'Authentication failed');
    assert.equal(args.length, 4);
    assert.match(args[3], /auth git-credential$/);
    if (process.platform !== 'win32') execFileSync('/bin/sh', ['-c', args[3].slice(args[3].indexOf('!') + 1)]);
    for (const url of ['https://example.com/a/b', 'https://github.com.evil.test/a/b', 'git@github.com:a/b.git', 'https://github.com:8443/a/b', 'https://user:pass@github.com/a/b']) {
      assert.equal(githubCredentialFallback(url, false, 'Authentication failed'), null);
    }
    assert.equal(githubCredentialFallback('https://github.com/a/b', true, 'Authentication failed'), null);
    assert.equal(githubCredentialFallback('https://github.com/a/b', false, 'Connection timed out'), null);
  } finally { process.env.PATH = oldPath; fs.rmSync(dir, { recursive: true, force: true }); }
});


test('real authenticated HTTP Git: candidate and saved PAT support test, push, fetch and distribution', async () => {
  const dir = temp();
  const token = 'skillkit-test-only-token';
  const expected = 'Basic ' + Buffer.from('x-access-token:' + token).toString('base64');
  const requests = [];
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const state = { root: path.join(dir, 'A'), tools: path.join(dir, 'toolsA'), meta: new Map(), scans: [] };
  globalThis.__syncTest = state;
  const server = createServer((req, res) => {
    if (req.headers.authorization?.replace(/^basic /i, 'Basic ') !== expected) {
      req.resume();
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="skillkit-test"' });
      res.end(); return;
    }
    const url = new URL(req.url, 'http://localhost');
    requests.push(url.pathname);
    const child = spawn('git', ['http-backend'], {
      env: { ...process.env, GIT_PROJECT_ROOT: dir, GIT_HTTP_EXPORT_ALL: '1',
        PATH_INFO: url.pathname, QUERY_STRING: url.search.slice(1), REQUEST_METHOD: req.method,
        CONTENT_TYPE: req.headers['content-type'] || '', CONTENT_LENGTH: req.headers['content-length'] || '',
        REMOTE_USER: 'x-access-token', REMOTE_ADDR: '127.0.0.1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const chunks = [];
    child.stdout.on('data', chunk => chunks.push(chunk));
    child.stderr.resume();
    child.stdin.on('error', () => {});
    req.pipe(child.stdin);
    child.on('error', () => { res.writeHead(500); res.end(); });
    child.on('close', () => {
      const output = Buffer.concat(chunks);
      const headerEnd = output.indexOf('\r\n\r\n');
      if (headerEnd < 0) { res.writeHead(500); res.end(); return; }
      const headers = {};
      let status = 200;
      for (const line of output.subarray(0, headerEnd).toString().split('\r\n')) {
        const colon = line.indexOf(':');
        if (colon < 0) continue;
        const name = line.slice(0, colon); const value = line.slice(colon + 1).trim();
        if (name.toLowerCase() === 'status') status = Number.parseInt(value, 10);
        else headers[name] = value;
      }
      res.writeHead(status, headers); res.end(output.subarray(headerEnd + 4));
    });
  });
  try {
    const remote = path.join(dir, 'repo.git'); fs.mkdirSync(remote);
    git(remote, 'init', '--bare', '-b', 'main');
    git(remote, 'config', 'http.receivepack', 'true');
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const repoUrl = `http://127.0.0.1:${server.address().port}/repo.git`;
    const api = await loadSync();
    // Exercise the actual Git process, not a stub: Git must parse the key and send the header.
    const candidate = await api.testRemote(repoUrl, token);
    assert.equal(candidate.ok, true, candidate.error);
    assert.equal((await api.configureSync({ repoUrl, auto: false, token })).ok, true);
    assert.equal((await api.testRemote(repoUrl)).ok, true);
    state.scans = [{ path: skill(path.join(state.tools, 'http-skill'), 'authenticated'), isBuiltin: false }];
    const pushed = await api.syncNow();
    assert.equal(pushed.ok, true, pushed.error);
    assert.ok(requests.some(p => p.endsWith('/git-receive-pack')));
    state.root = path.join(dir, 'B'); state.tools = path.join(dir, 'toolsB'); state.scans = [];
    const pulled = await api.restoreFromRemote();
    assert.equal(pulled.ok, true, pulled.error);
    assert.equal(pulled.restored, 1);
    assert.equal(fs.readFileSync(path.join(state.tools, 'http-skill/scripts/run.sh'), 'utf8'), 'authenticated');
    assert.ok(requests.some(p => p.endsWith('/git-upload-pack')));
    assert.equal(fs.readFileSync(path.join(state.root, '.git/config'), 'utf8').includes(token), false);
  } finally {
    await new Promise(resolve => server.close(resolve));
    delete globalThis.__syncTest;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
