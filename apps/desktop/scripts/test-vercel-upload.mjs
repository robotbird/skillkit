#!/usr/bin/env node
// 诊断脚本:能否把本地文件上传到 Vercel(apps/server)。分两段独立测试:
//
//   A) 直接用 @vercel/blob 的 put() 上传
//      —— 验证「Blob 存储 + BLOB_READ_WRITE_TOKEN」本身通不通(完全绕开 HTTP / 路由)
//      —— 需要 BLOB_READ_WRITE_TOKEN 环境变量;没有就跳过 A。
//
//   B) 通过 HTTP POST {SHARE_BASE_URL}/share 上传
//      —— 验证线上分享接口端到端(Next.js route handler + 存储)
//      —— 这是桌面客户端 shareSkill 实际走的路径。
//
// 用法:
//   node apps/desktop/scripts/test-vercel-upload.mjs [本地文件路径]
//   BLOB_READ_WRITE_TOKEN=xxx node apps/desktop/scripts/test-vercel-upload.mjs        # 跑 A 段需要
//   SHARE_BASE_URL=https://skillkit.net node apps/desktop/scripts/test-vercel-upload.mjs   # B 段目标(默认 skillkit.net)
//
// 结论速读:
//   A 成功 + B 失败    → Blob 存储没问题,卡在 HTTP / 路由层
//   A 失败             → Blob 存储或 token 有问题(如 private/public store 不匹配、token 无效)
//   A 成功 + B 成功    → 全通了

import { put, head, del } from '@vercel/blob';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SHARE_BASE_URL = (process.env.SHARE_BASE_URL || 'https://skillkit.net').replace(/\/$/, '');
const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const fileArg = process.argv[2];

// ---- 准备一个要上传的文件(用本地文件,或造一个测试 zip) ----
let uploadFile;
if (fileArg) {
  uploadFile = path.resolve(fileArg);
  if (!fs.existsSync(uploadFile)) {
    console.error(`✗ 找不到文件: ${uploadFile}`);
    process.exit(1);
  }
} else {
  // 造一个最小 zip(同 PK 头),够当 application/zip 上传
  uploadFile = path.join(os.tmpdir(), 'skillkit-upload-test.zip');
  // 用内建的 zip 打包一个小 SKILL.md
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillkit-test-'));
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '# upload test\n');
  const { execSync } = await import('node:child_process');
  try {
    execSync(`cd "${dir}" && zip -q "${uploadFile}" SKILL.md`);
  } catch {
    // 没有 zip 命令就退化为纯文本
    fs.writeFileSync(uploadFile, `skillkit upload test ${new Date().toISOString()}`);
  }
}
const buf = fs.readFileSync(uploadFile);
console.log(`本地文件: ${uploadFile} (${buf.length} bytes)\n`);

// ============ A) 直接 @vercel/blob 上传 ============
console.log('━━━ A) 直接 @vercel/blob put() ━━━');
if (!TOKEN) {
  console.log('⏭  跳过:未设置 BLOB_READ_WRITE_TOKEN(想跑 A 段:BLOB_READ_WRITE_TOKEN=xxx node ...)\n');
} else {
  const testPath = `skillkit-upload-test-${Date.now()}.bin`;
  try {
    console.log(`put(${testPath}, ${buf.length} bytes, { access: 'public' }) ...`);
    const blob = await put(testPath, buf, {
      access: 'public',
      contentType: 'application/zip',
      addRandomSuffix: false,
    });
    console.log(`✓ 上传成功`);
    console.log(`  url:       ${blob.url}`);
    console.log(`  pathname:  ${blob.pathname}`);
    console.log(`  size:      ${blob.size}`);

    const h = await head(testPath).catch((e) => ({ error: e.message }));
    console.log(`  head():    ${'error' in h ? '✗ ' + h.error : '✓ 存在, size=' + h.size}`);

    const r = await fetch(blob.url);
    console.log(`  公开读取:  HTTP ${r.status} ${r.ok ? '✓' : '✗'}`);

    await del(testPath);
    console.log(`  已清理(del)`);
  } catch (e) {
    console.error(`✗ A 段失败: ${e?.name || ''} ${e?.message || e}`);
    if (e?.message) console.error(e);
  }
  console.log('');
}

// ============ B) HTTP POST /share ============
console.log('━━━ B) HTTP POST {SHARE_BASE_URL}/share ━━━');
const form = new FormData();
form.append('name', 'upload-test');
form.append('description', 'diagnostic upload');
form.append('sourceTool', 'claude');
form.append('file', new Blob([buf], { type: 'application/zip' }), 'upload-test.zip');

const url = `${SHARE_BASE_URL}/share`;
console.log(`POST ${url} ...`);
try {
  const res = await fetch(url, { method: 'POST', body: form, signal: AbortSignal.timeout(60000) });
  console.log(`  HTTP ${res.status}`);
  const text = await res.text();
  console.log(`  body: ${text.slice(0, 300)}`);
  if (res.ok) {
    try {
      const data = JSON.parse(text);
      console.log(`  ✓ 成功! id=${data.id} url=${data.url}`);
    } catch {
      console.log(`  ✓ HTTP 2xx`);
    }
  } else {
    console.log(`  ✗ 非 2xx`);
  }
} catch (e) {
  console.error(`  ✗ 请求失败: ${e?.message || e}`);
}
