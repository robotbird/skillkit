-- 移除团队管理功能:删除 Team/TeamMember/TeamSkill 表与相关枚举。
-- 顺序:先子表(TeamSkill/TeamMember 引用 Team)再 Team;最后删枚举类型。

DROP TABLE IF EXISTS "TeamSkill";
DROP TABLE IF EXISTS "TeamMember";
DROP TABLE IF EXISTS "Team";

DROP TYPE IF EXISTS "TeamRole";
DROP TYPE IF EXISTS "TeamSkillSourceType";
