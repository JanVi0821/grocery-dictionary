# 商品详情抓取

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
