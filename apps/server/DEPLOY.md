# Skillkit server 部署指南

## 部署形态

两种:

1. **Vercel**(默认):连接 Vercel Postgres,share 文件存 Vercel Blob。详见根目录 `CLAUDE.md`。
2. **自托管 / 私有化**(本文重点):任意 Node 服务器或容器;Postgres 自建;share 文件存本地持久卷。

## 前置

- Node.js 20.19+(推荐 22+)
- PostgreSQL 14+
- pnpm

## 1. 环境变量

复制 `.env.example` 为 `.env` 并填写:

| 变量 | 必填 | 说明 |
|---|---|---|
| `DATABASE_URL` | 是 | Postgres 连接串,如 `postgresql://user:pass@host:5432/skillkit` |
| `AUTH_SECRET` | 是 | JWT 签名密钥,用 `openssl rand -base64 32` 生成,务必强随机 |
| `SHARE_STORE` | 是 | 私有化用 `local`(文件系统) |
| `SHARE_LOCAL_DIR` | 否 | share 文件目录,默认 `<cwd>/data`,建议指向持久卷 |
| `CRON_SECRET` | 否 | `/sweep` 清理接口的 Bearer 密钥(见第 4 节) |

## 2. 安装与数据库迁移

```bash
pnpm install --filter server...
pnpm --filter server db:generate                 # 生成 Prisma client
DATABASE_URL="postgresql://..." pnpm --filter server prisma migrate deploy
```

> 首次需要先生成迁移文件:在开发机执行
> `DATABASE_URL="postgresql://..." pnpm --filter server prisma migrate dev --name init`,
> 产出 `prisma/migrations/` 提交到仓库;之后生产环境只跑 `migrate deploy`(不交互、不重置数据)。

## 3. 构建与启动

```bash
pnpm --filter server build      # next build(已开 output: 'standalone')
pnpm --filter server start      # next start,默认 :3000
```

`output: 'standalone'` 已开启,可基于 `.next/standalone` 打包成最小镜像。端口用 `PORT`
(如 `PORT=8080 pnpm --filter server start`),建议前置 Nginx / Caddy 做反代与 TLS。

## 4. 定时清理(替代 Vercel cron)

share 链接 7 天过期,`/sweep` 负责清理。Vercel 用内置 cron;自托管用系统 cron:

```cron
# 每天 03:17 调一次(若设了 CRON_SECRET 则带 Bearer)
17 3 * * * curl -fsS -X GET "http://127.0.0.1:3000/sweep" -H "Authorization: Bearer $CRON_SECRET"
```

> 读时已校验过期(过期返回 410),sweep 仅省存储,不跑也不影响正确性。

## 5. 私有化注意

- 认证为邮箱 + 密码,不依赖任何外部服务(OAuth / 邮件)。
- 桌面端默认连 `https://skillkit.net`;私有化后需让桌面端指向自建服务地址
  (通过 `SKILLKIT_SHARE_BASE_URL` 覆盖;桌面端配套支持待后续版本)。
- `AUTH_SECRET` 务必强随机且不泄露;丢失会导致所有 session 失效(用户需重新登录,数据不丢)。
- 数据库建议定时备份(Postgres `pg_dump`)。
