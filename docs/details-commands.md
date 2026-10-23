# Details：详情抓取与维护

源码：apps/data-pipeline/src/details。运行目录：runtime/details。结果统一写 data_completion；filter collection 只保存任务领取和进度，不保存第二份抓取结果。

```sh
pnpm data details:run --limit 100
pnpm data details:retry:unmatched --limit 100
pnpm data details:retry:invalid --limit 100
pnpm data details:incremental --limit 100
```

四条路径保持独立入口，不通过模式标志耦合：

- run：filter-crawl-config.ts 中配置 Supabase filter；固定要求 detail=null 且至少一个有效 barcode。规范化 filter JSON 的哈希对应一个任务 collection，完整初始化后消费；相同 filter 复用，结果写入成功后才确认任务。
- retry:unmatched：选择 needsReview=true 且未具有当前 retryAllVersion 的数据。按 retry-config.ts 的版本记录每次 retry 结束，包括未匹配结果。
- retry:invalid：只处理非法非空 detail，并使用独立 retryInvalidDetailVersion；不是普通未匹配重试。
- incremental：目标最大 productId 后继续，不适合补齐较小 ID 或更新历史商品。

使用 barcode 去掉前缀零后按既有平台/门店 fallback 顺序查询，首个成功匹配终止后续请求。不恢复名称业务匹配，不写 query/score。内层详情字段清理由 product-model 共用。

认证文件已迁至 runtime/details/auth/new-world 和 paknsave；parse-curl.ts 从这里读取，真实认证不再存放源码目录。浏览器和认证有效性仍受平台限制，目录迁移不重新认证。

维护命令：

```sh
pnpm data details:clean
pnpm data details:sync --limit 100
```

clean 创建备份并清理 MongoDB 的旧字段，是实际写入。sync 按 supabase-sync-config.ts 的 filter 仅更新已有 products.detail，不新增商品；重复执行完整覆盖匹配结果，无持久断点。推荐常规发布使用 publish:details:plan 与 jobs:run；不要并发运行覆盖同一商品的多个发布路径。
