import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const moduleUrl = (source) => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText).toString('base64');
const filesUrl = moduleUrl(fs.readFileSync(new URL('../electron/sync-files.ts', import.meta.url), 'utf8'));
const { writeSnapshot, restoreSnapshot } = await import(filesUrl);
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'skillkit-sync-test-'));
function skill(root, content) {
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'SKILL.md'), `---\nname: same-name\n---\n${content}`);
  fs.writeFileSync(path.join(root, 'scripts', 'run.sh'), content, { mode: 0o755 });
  return root;
}

test('portable snapshots preserve distinct same-name tool skills, assets and custom project paths', () => {
  const dir = temp();
  try {
    const root = path.join(dir, 'repo'); fs.mkdirSync(root);
    const a = skill(path.join(dir, 'a'), 'claude');
    const b = skill(path.join(dir, 'b'), 'codex');
    const link = path.join(dir, 'link'); fs.symlinkSync(a, link, 'dir');
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
    fs.symlinkSync(path.join(dir, 'a'), path.join(root, '.skillkit-sync', manifest.entries[0].payload, 'unsafe'), 'dir');
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
    fs.symlinkSync(source, path.join(source, 'cycle'), 'dir');
    assert.throws(() => writeSnapshot(root, [{ tool: 'codex', relative: 'b', source }]), /循环/);
    assert.equal(fs.readFileSync(path.join(root, '.skillkit-sync/manifest.json'), 'utf8'), before);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('real Git: push on computer A, restore and distribute on B, then push to remote default branch', async () => {
  const dir = temp();
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const keys = Object.fromEntries(['syncRepoUrl', 'syncAuto', 'syncAuthToken', 'syncGitName', 'syncGitEmail', 'syncLastTime', 'syncLastStatus'].map(k => [k, k]));
  const state = { root: path.join(dir, 'A'), tools: path.join(dir, 'toolsA'), meta: new Map(), scans: [] };
  globalThis.__syncTest = state;
  try {
    const remote = path.join(dir, 'remote.git'); fs.mkdirSync(remote); git(remote, 'init', '--bare', '-b', 'main');
    state.meta.set('syncRepoUrl', remote);
    state.scans = [{ path: skill(path.join(state.tools, 'only-codex'), 'first'), isBuiltin: false }];
    fs.writeFileSync(path.join(state.scans[0].path, '.gitignore'), '*.sh\n');
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
    const api = await import(moduleUrl(code));
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
    fs.symlinkSync(external, path.join(destination, 'same'), 'dir');
    skill(path.join(destination, 'unrelated'), 'keep');
    writeSnapshot(root, [{ tool: 'codex', relative: 'same', source }]);
    assert.equal(restoreSnapshot(root, () => destination).restored, 1);
    assert.equal(fs.readFileSync(path.join(external, 'scripts/run.sh'), 'utf8'), 'old');
    assert.equal(fs.readFileSync(path.join(destination, 'same/scripts/run.sh'), 'utf8'), 'new');
    assert.equal(fs.readFileSync(path.join(destination, 'unrelated/scripts/run.sh'), 'utf8'), 'keep');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
