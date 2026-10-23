# 重构进度与边界

## 已完成

- pnpm workspace + Turbo，单一根 lockfile；前端 apps/web、数据应用 apps/data-pipeline、共享包 packages/*。
- 原 Step 1–4 业务源码全部迁入数据应用，依赖合并；不再依赖旧目录、旧 package.json 或兼容启动壳。
- 按 catalog/details/translation/publish 聚合配置和业务流程；根 CLI 保持独立执行路径，不自动串联。
- 所有测试移至根 test；前端通过 workspace package 访问商品类型，不跨应用访问源码。
- DuckDB、checkpoint、.env、认证、Google credential、DeepL pool 和报告移至忽略的 runtime；业务任务集合与进度不清空。
- 发布支持 plan/run/status/retry：固定任务集、规范化 filter 哈希、内容版本、原子领取、租约、提交后确认、失败重开和中断恢复。
- 批量发布与持久发布共用 SQL/payload，保留原产品映射和清理结果。
- 不改变前端路由、翻译字段、provider、Redis namespace 或数据库结构；不自动执行正式任务。

## 尚未统一的业务机制

物理目录统一不等于进度格式统一：

| 模块        | 当前恢复机制                                                |
| ----------- | ----------------------------------------------------------- |
| catalog     | 本地 checkpoint + MongoDB _sync                             |
| details     | filter collection / retry version / 最大 productId 独立路径 |
| translation | FILTER + COMPLETE_MARK / pending / failed 独立路径          |
| publish     | 新持久任务，或显式批量覆盖路径                              |

抓取与翻译接入统一任务引擎、旧进度导入/对账，以及重复详情发布路径的退休，仍应单独实施。未经验证不删除历史状态，不把目录重构当作重新抓取或付费重译的授权。

## 验收约束

1. 重构不改变 source/detail、productId → products.id、译文 (product_id,lang) 和字段排除规则。
2. 保持运行文件和断点；较小未完成 ID 不因较大成功 ID 被跳过。
3. 发布 SQL 成功后确认，确认失败可幂等重放；不宣称跨库 exactly-once。
4. DeepL key pool 仍由同项目 Redis 锁保护，内部 worker 不竞争改写。
5. 测试不调用付费翻译或发布正式数据；真实 MongoDB 测试仅在显式 opt-in 下使用随机隔离库。
6. 前端 lint、类型检查、生产构建与数据测试均需通过；既有警告单独披露。

旧各项目的依赖目录和已退休 manifest/lockfile 在本机临时备份中保留，不参与 workspace。正式代码历史仍可由 Git 恢复。
