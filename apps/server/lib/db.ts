import { PrismaClient } from '@prisma/client';

// PrismaClient 单例。Next.js dev 热重载会反复 import 模块,若每次 new 一个 client 会堆积
// 数据库连接。照搬 lib/store.ts 的 getStore() 缓存思路:把实例挂在 globalThis 上跨重载复用。
// 生产(serverless)每个函数实例自然只 new 一次,无需额外处理。
const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma = prisma;
}
