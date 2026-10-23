# 发布任务：创建、续跑与重试

统一任务机制先接入详情和译文的发布。所有源码已迁入 apps/data-pipeline；抓取与翻译仍保持自己的状态机制，filter collection、translation pending 和完成标记不自动导入或删除。

## 配置和命令

发布配置集中在 `apps/data-pipeline/src/publish/config.ts`，持久任务与批量覆盖共用。`FILTER` 对应原文详情，`TRANSLATION_FILTER` 对应译文；这是 MongoDB 查询语法，日期必须是 Date，操作符使用 `$gte` 等。

新 plan 固定叠加 `needsReview: false`；译文还固定要求 `translation.status: completed`，自定义 filter 不能覆盖这些前提。空 filter 读取所有满足这些前提的记录；非法 detail 在任务中记为 blocked，不发布到目标表。旧 sync 的历史筛选语义不变。

```sh
# 创建完整固定任务集：只写 MongoDB 任务，不连接 PostgreSQL、不发布结果。
pnpm data publish:details:plan --batch october-22
pnpm data publish:translations:plan --batch october-22

# 使用 plan 输出的完整 job 集合名；这里的占位符需替换。
pnpm data jobs:status --job 'pipeline_publish_details_<hash>'
pnpm data jobs:run --job 'pipeline_publish_details_<hash>' --limit 100

# 再次执行同一 run 跳过 succeeded，继续 pending。
pnpm data jobs:run --job 'pipeline_publish_details_<hash>' --limit 100

# 仅将 failed 重开为 pending；不会立即发布，也不动成功项和 blocked。
pnpm data jobs:retry --job 'pipeline_publish_details_<hash>'
pnpm data jobs:run --job 'pipeline_publish_details_<hash>' --limit 100
```

未指定 `--batch` 时默认 `default`。相同配置和 batch 重复 plan 复用原集合，不追加新商品；需要新输入时明确使用新 batch。plan 不接受 limit，必须完整建立任务集；limit 仅限制单次 run 领取总数。

## 数据和进度

集合名为 `pipeline_publish_details_<SHA-256>` 或 `pipeline_publish_translations_<SHA-256>`。哈希包含业务、连接身份、源数据库/集合、目标表、filter、语言、规则版本、batch。对象键排序，EJSON 保留 Date/ObjectId 类型；连接身份不含密码，换密码不重置任务，同 pooler 上不同项目不会共用任务。

同集合的 manifest 保存配置、初始化游标和运行租约；task 保存源 `_id`、productId、发布 payload 哈希、状态、尝试次数和错误，**不存放补全/翻译的业务结果**。源 `_id` 目前要求 ObjectId，productId 要求唯一正整数；重复映射会阻止初始化完成，先清理源重复数据后建立新批次。

plan 分批读取源集合，批量任务落库后才推进初始化游标，中断可安全重放。manifest 的 ready 仅表示初始化完成，不表示所有任务成功；消费只能在 ready 后进行。任务状态说明：

| 状态      | 含义                              | 后续操作                                     |
| --------- | --------------------------------- | -------------------------------------------- |
| pending   | 等待执行                          | run 领取                                     |
| running   | 已领取、结果尚未确认              | 当前进程处理；中断后下次 run 恢复            |
| succeeded | 目标写入及任务确认都完成          | 相同任务不再执行                             |
| failed    | 单条发布执行失败                  | 修复原因后 retry，再 run                     |
| blocked   | 源数据非法、缺失或 payload 已变化 | 修复数据后新建 batch，旧任务不自动改输入版本 |

同一任务集只运行一个消费者，原子领取并由 120 秒租约保护，每 40 秒续期。正常退出主动释放；强杀后需等租约过期。旧进程失去租约后不能确认新实例的任务。不要手工清空 running 或修改 lease。不同任务集若写同一商品仍是最后一次提交生效，**不要并发运行覆盖同一商品的不同批次，也不要与旧 sync 同时执行**。

## 写入与异常

直接复用旧迁移的 payload 转换和 SQL：详情按 productId 对应 products.id，完整替换 detail，不创建商品、不修改 name/brand 等基础字段；译文按 product_id + lang upsert，完整替换 name/detail。任务状态不写入 Supabase 或业务结果集合。

执行前重新读取源记录并核对发布 payload 哈希。忽略对象键顺序和本来不会发布的 at/attempts 等元数据；业务内容变化会 blocked，不能把旧任务静默换成新输入。源数据在执行过程中再次发生变化仍需新批次发布，本机制不是跨库实时订阅。

SQL 成功后才确认 succeeded。两者不是分布式事务：SQL 成功而 MongoDB 确认失败时停止，下一次重放同一个幂等写入，保证至少一次执行，不宣称 exactly-once。源记录不更新、不写完成标记；未来更换 batch 会重新计算当前输入版本。

- 普通单条执行错误记录 failed 后继续其它 pending。
- **找不到 products.id 时按既有约定，记录 failed 并立即停止，不创建残缺商品。**修复基础商品映射后 retry，再 run。
- 认证、权限、连接、数据库结构或租约错误停止本次 run，未确认的 running 留待恢复，不批量误标失败。
- Ctrl+C/SIGTERM 停止领取，完成当前商品后关闭连接并释放租约。强杀无法执行清理，但任务不会误标成功。
- 当前 worker 单进程逐商品提交事务，优先隔离失败和可靠确认；与旧批量 SQL 相比吞吐较低。后续批提交优化必须保留逐条状态和提交后恢复保证。

## 验证

`pnpm test` 默认运行离线任务状态测试；真实 MongoDB 集成测试仅在显式设置 `PIPELINE_TEST_MONGO_URI` 时启用。它只创建随机 `pipeline_test_<UUID>` 隔离库，结束后清理，不访问既有业务集合、不连接 PostgreSQL。覆盖初始化中断、快照复用、limit 续跑、源版本变化、失败重试、SQL 后确认失败、租约竞争和唯一映射。
