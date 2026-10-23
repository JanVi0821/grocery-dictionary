# Publish：按 filter 批量覆盖

发布配置统一在 apps/data-pipeline/src/publish/config.ts。源码 bulk-details.ts 和 bulk-translations.ts 保留原批量覆盖行为；SQL 写入统一复用 packages/pipeline-infra/src/publish.ts，payload 统一复用 product-model。

```sh
pnpm data publish:details --limit 100
pnpm data publish:translations --limit 100
```

FILTER 控制原文集合，TRANSLATION_FILTER 控制译文集合，都是 MongoDB 查询。{} 表示不追加自定义条件；批量路径不额外叠加完成状态。limit 只限制本次读取数量；重复执行从全部匹配项重新开始、覆盖原有结果，不是持久断点。不要与重叠的任务批次或 details:sync 同时运行。

详情只按 productId → products.id 更新已有 detail，不新增商品、不更新基础字段；缺失映射立即报错。译文按 (product_id, lang) upsert，完整替换 name/detail。JSON 清理保持迁移前的字段规则，不保存任务进度副本。

需要逐条断点时，使用[持久发布任务](publication-jobs.md)中的 plan/run/status/retry。运行时默认复用 runtime/catalog/.env；本地报告位于 runtime/publish。既有 SQL 历史文件在 apps/data-pipeline/sql/publish，不会由脚本自动应用。
