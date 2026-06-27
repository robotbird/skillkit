# 本地分享存储(local store)

仅当 `SHARE_STORE=local`(本地开发,默认)时使用此目录存放分享的 `{id}.json`(元数据)与 `{id}.zip`。
生产环境(Vercel)走 BlobStore(`SHARE_STORE=blob`),不读写此目录。

内容已 .gitignore,仅本说明纳入版本管理。
