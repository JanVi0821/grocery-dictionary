# Catalog：Grocer 基础数据

实现位于 apps/data-pipeline/src/catalog，配置位于 lib/config.ts，SQL 位于 apps/data-pipeline/sql/catalog。业务运行目录为 runtime/catalog，.env、DuckDB 和 .grocer-* 进度文件随本次迁移保留。

从仓库根目录执行：

```sh
pnpm data catalog:import
pnpm data catalog:refresh
pnpm data catalog:bootstrap
pnpm data catalog:publish
```

- import：下载/导入全量快照；未指定目标数据库时沿用按奥克兰日期命名的默认库，也可用 --database 指定。保留原全量断点。
- refresh：比较最新快照，把增量变更写入 MongoDB，并保留批次 checkpoint；不自动抓取详情或翻译。
- bootstrap：首次导入基础商品，沿用 barcode 有效性检查及原 migration checkpoint，不是日常详情发布入口。
- publish：消费 MongoDB 中标记的基础商品变更；Supabase 提交后才确认 _sync，失败可重复执行。

参数和环境变量语义未改动。服务端模板位于 apps/data-pipeline/env/catalog.env.example。基础导入映射与详情阶段 productId → products.id 的映射职责不同，不要将 grocer_id 当作详情/译文的主键。

数据库进度与本地文件仍采用原有机制；新发布任务不能用于恢复 catalog checkpoint。不要清空 runtime/catalog 或并发启动同一 catalog 流程。
