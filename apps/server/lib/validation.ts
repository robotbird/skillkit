import { z } from 'zod';

// 所有 API 入口的 zod schema。.strict 拒绝多余字段,字段限长防滥用。

const email = z.email({ message: '邮箱格式不正确' });

export const registerSchema = z
  .object({
    email,
    password: z.string().min(8, '密码至少 8 位').max(72, '密码最多 72 位'),
    name: z.string().trim().min(1).max(40).optional(),
  })
  .strict();

export const loginSchema = z
  .object({
    email,
    password: z.string().min(1, '请输入密码'),
  })
  .strict();

export const updateMeSchema = z
  .object({
    name: z.string().trim().max(40).nullable(),
  })
  .strict();

export const createTeamSchema = z
  .object({
    name: z.string().trim().min(1, '团队名不能为空').max(60, '团队名最多 60 字'),
  })
  .strict();

// 团队 skill 的 sourceRef 校验:
//  - github: 须为 https://github.com/<owner>/<repo>(...) 形态
//  - share : 须为 6 字符 base32(与 lib/id.ts 的 newShareId 同字符表)
const GITHUB_URL = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\/[\w.-]*)*$/;
const SHARE_ID = /^[23456789abcdefghijkmnpqrstuvwxyz]{6}$/;

export const createSkillSchema = z
  .object({
    name: z.string().trim().min(1, '名称不能为空').max(80),
    description: z.string().trim().max(280).optional(),
    sourceType: z.enum(['github', 'share']),
    sourceRef: z.string().trim().min(1).max(500),
  })
  .strict()
  .refine(
    (d) => (d.sourceType === 'github' ? GITHUB_URL.test(d.sourceRef) : SHARE_ID.test(d.sourceRef)),
    { message: '来源链接格式不正确(github 须为 https://github.com/... ;share 须为 6 位分享码)' },
  );

export const updateSkillSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(280).nullable().optional(),
  })
  .strict();
