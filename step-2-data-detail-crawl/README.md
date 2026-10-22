# 商品详情抓取

## 将抓取结果迁移到 Supabase

在 `src/supabase-sync-config.ts` 配置独立的 MongoDB `SUPABASE_SYNC_FILTER`（默认 `{ needsReview: false }`，可添加 productId、at、重试标记等；`{}` 不附加筛选），执行：

```sh
npm run sync:supabase
npm run sync:supabase -- --limit 100
```

使用当前项目 `.env` 的 `MONGODB_URI` 指定的原业务集合（默认 data_completion），以及 `SUPABASE_URL` / `SUPABASE_SECRET_KEY`。不读取 filter 任务集合、不启动浏览器，也不需要 `SUPABASE_DB_URL`。`SUPABASE_SYNC_BATCH_SIZE` 控制 MongoDB 每批读取数量，`--limit` 控制单次总量；无预览模式。

按 `productId → products.id` 逐条完整替换 `products.detail`，其中 payload 保持 step-4 格式（包含 source、嵌套 detail 等），复用 step-4 外层字段剔除及当前抓取的 detail 清理规则。不修改 products 的 name、brand、barcodes 等基础字段，也不修改 MongoDB。重复执行会覆盖同 ID 的旧 detail，不合并 JSON、不新增重复记录；同批出现重复 productId 时，按 productId/_id 升序依次覆盖，最后一条生效。

这里是已存在商品的详情同步，并非创建完整商品的 INSERT upsert：MongoDB 补全数据缺少 grocer_id、unit 等必需字段，因此 products.id 不存在时明确报错停止，不伪造商品。非法 productId、非对象 detail 或 API 错误也会停止。每条打印开始及写入日志，先前已成功写入的结果保留；没有独立断点，重跑相同 filter 会重新更新匹配数据，相同 limit 会再次处理前 N 条。

## 按 Supabase filter 重抓（新增或更新的商品）

独立命令：`npm run crawl:filter -- --limit 100 --rate 2`。配置位于 `src/filter-crawl-config.ts`：

```ts
export const FILTER = {
  deleted_from_grocer: { eq: false },
  update_at_from_grocer: {
    gte: "2026-10-20T00:00:00Z",
    lt: "2026-10-21T00:00:00Z",
  },
};
```

filter 是 Supabase/PostgREST 字段条件，不是 MongoDB filter。操作符可用 eq、neq、gt、gte、lt、lte、is、in 等 `.filter()` 支持的原始操作符，多个条件以 AND 组合；in 的值使用 `"(1,2,3)"`。创建任务固定要求 Supabase `products.detail IS NULL` 且 `barcodes` 数组至少有一个元素（非 NULL、非空数组）；自定义 filter 仅叠加条件，不能覆盖这两个前提。`{}` 表示所有满足前提的商品，不自动限制 Grocer 更新时间。日期字段实际叫 `update_at_from_grocer`。

- 规范化 filter JSON（字段和操作符排序）后计算 SHA-256，集合名为 `data_completion_filter_<64位哈希>`。哈希只取决于 filter，键顺序不影响标识；相同 filter 直接复用同一数据库内的集合，不重复建表或导入。
- 首次按 id 升序、每批最多 100 条，将同时满足固定前提和 filter 的商品 id/name/brand/barcodes 导入任务集合。每条任务 `_id` 为商品 id，`product` 保存抓取所需的原始商品快照，`status` 初始为 pending。`--limit` 只限制本次抓取数量，不限制首次导入数量；`{}` 会完整导入所有满足固定前提的商品。
- 同集合中 `_id: "manifest"` 的元数据记录保存原始 filter、初始化状态 seeding/ready 和导入游标 seedAfterId。只在整批写入后推进导入游标，导入中断后续跑并通过 upsert 去重；全部导入成功才开始抓取。此游标仅用于初始化，不代表抓取进度，不再创建独立 progress collection，也没有本机进度文件。
- 后续只从该集合按 `_id` 升序读取 pending/failed 商品，不再查询 Supabase。复用现有条码、全门店抓取流程，覆盖业务集合中同 productId 的结果或新增记录。业务结果成功保存后才将任务标记 completed，记录 finishedAt、needsReview；无匹配的 needsReview=true 也算抓取已完成，后续仍可使用 retry:all 重试。
- 异常任务标记 failed 并保存 lastError，Crawlee 保留现有自动重试。中断或重试耗尽后再次执行，会继续 pending/failed，跳过 completed。业务结果保存后、任务标记前中断，最多重做最后一条，业务写入通过 productId upsert 去重。
- ready 集合是固定任务集：同 filter 再执行不会加入后来新增或更新的商品；需要新批次时配置新的 filter（例如新的日期范围）。首次分批导入并非 Supabase 事务快照，导入期间应避免修改该批次的源数据。已有的旧 progress collection 不再读取，也不会自动删除。
- 固定前提只在初始化读取 Supabase 时生效；此前已建立的任务集合不会自动重新筛选或清理，旧集合若包含不符合前提的任务，应先单独处理再继续，不要直接重跑旧任务集。
- 同一 filter 同时只运行一个命令实例；不同 filter 的任务标记互相隔离，但如果抓取同一商品，业务结果仍是最后一次写入。保持同一 MongoDB 数据库与 Supabase 项目的对应关系：同 filter 不会按来源项目另建集合。

抓取结果不再保存顶层 `query` 或匹配度字段；查询条码由 `attempts[].barcode` 记录。写库时也会删除旧记录中的这些顶层字段。向超市搜索 API 发送的 `query` 参数仍然保留，不影响正常查询。

## 历史 detail 清洗

`npm run clean:unused-detail-fields` 清理当前 `.env` 中 MONGODB_URI 指定的集合。复用 `src/detail-fields.ts` 的规则，按来源删除列出的 detail 字段及 Woolworths 嵌套 price 字段，同时删除 row 顶层 `query`、`score`、`wwScore`、`nwScore`、`pnsScore`（UNUSED_ROW_FIELDS）。不限制 needsReview，顶层字段清理也适用于空 detail 和未知来源；未知来源、null、字符串或数组 detail 本身保持原样，productId、source、at 等其它外层字段不修改。

每批最多 100 条，先将受影响记录的原始 detail、待清理顶层字段原值及删除路径备份到同一数据库的 `<collection>_detail_fields_backup_<时间戳>`，备份成功后才执行 `$unset`。若读取后相关字段被其它进程更新，该记录保持不变并报告 changedDuringCleanup，重新运行即可处理。命令可重复执行，已清理的记录不再写入；不会自动清理翻译集合。恢复时应参考备份的 removedPaths，仅恢复确实需要的字段，避免覆盖之后的新数据。

三个命令独立执行，不通过模式参数切换业务流程：

| 命令                           | 入口                                  | 任务范围与重复执行规则                                                                 |
| ------------------------------ | ------------------------------------- | -------------------------------------------------------------------------------------- |
| `npm run crawl:10000`          | `src/command/incremental.ts`          | 从 MongoDB 最大 productId 之后继续抓取，默认命令数量 10000                             |
| `npm run retry:all`            | `src/command/retry-all.ts`            | 仅处理 needsReview=true 且没有当前 retryAllVersion 的记录，命令数量 100000             |
| `npm run retry:invalid-detail` | `src/command/retry-invalid-detail.ts` | 仅处理非空、非对象 detail 且没有当前 retryInvalidDetailVersion 的记录，命令数量 100000 |

三个命令均可追加 `-- --limit 20 --rate 2 --foodstuffs-request-delay 150` 覆盖公共参数。不再支持 `--retry-needs-review`、`--retry-invalid-detail` 模式参数。`start` 和 `crawl` 使用普通增量入口。

`command/` 负责各自的参数和启动，`workflow/` 负责各自的数据查询、handler 注册及后续任务链；每个流程只注册自己的任务标签。`command/runtime.ts` 仅共享限速设置、错误处理和资源释放。`crawlers/task-runtime.ts` 共享条码匹配、全门店检索和抓取限速；`crawlers/retry-product.ts` 共享单条重试机制，不选择业务模式。

重试版本仍在 `src/retry-config.ts` 独立配置。重试正常结束（包括无匹配）或普通异常时写入对应版本；认证过期时停止且不写完成标记，修复认证后可继续。原商品缺失时写标记并跳过。整批重启后已具有当前版本的商品不会重复执行。
