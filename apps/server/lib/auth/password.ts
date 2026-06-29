import { hash, verify } from '@node-rs/argon2';

// argon2id 哈希/校验。@node-rs/argon2 默认即 argon2id(抗 GPU/ASIC),参数用库推荐默认
// (memoryCost≈19MiB, timeCost=2, parallelism=1):既有安全性,又不会在 serverless 冷启动下过慢。

/** 哈希明文密码(注册时用)。 */
export async function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

/** 校验明文密码是否匹配哈希(登录时用);任何异常都返回 false(不泄露原因)。 */
export async function verifyPassword(plain: string, digest: string): Promise<boolean> {
  try {
    return await verify(digest, plain);
  } catch {
    return false;
  }
}
