# Translation：增量翻译与重试

实现统一位于 apps/data-pipeline/src/translation；配置为 config/translation.ts，所有测试位于根 test/translation。运行目录为 runtime/translation，不再执行旧 Step 目录中的 npm 脚本。

```sh
pnpm data translation:run --limit 100 --provider deepl --concurrency 2
pnpm data translation:retry --limit 100 --provider deepl
pnpm data translation:incremental --limit 100 --provider google
```

## 独立执行路径与重复执行

- run 对应 command/incremental-translation-filtered.ts：从原集合按 FILTER 读取，自动排除已经具有当前 COMPLETE_MARK 的原文。以唯一 productId upsert 译文；成功写入后才写原表完成标记。不是依靠目标最大 ID 跳过商品，能处理较小 ID 回填。
- retry 对应 command/retry-failed.ts：从目标 translation.status=failed 领取，按 productId 重新读取原文，使用指定 provider 翻译并覆盖失败结果。源记录缺失或不合法时不能误记成功。
- incremental 对应 command/incremental-translation.ts：优先恢复 TASK_COLLECTION 中未完成待办，再从目标最大 productId 后读取新原文；先保存待办再并发处理，避免乱序完成丢失较小待办。不用于补齐游标之前的数据。

COMPLETE_MARK={} 时不更新原表，也关闭 filter 路径的完成标记跳过；此时重复 run 会按 FILTER 覆盖译文。调高 VERSION 本身不会重新选择数据或清除缓存。limit 限制本次处理总行数，不改变批次大小/筛选规则。

## 翻译内容与资源

按 source 对应类型逐字段翻译 detail 和外层 product_name；brand、productDisclaimerMessage 保持原文，attempts 不复制到译文。整行必要字段完成后才提交成功结果。Google 使用 V3；DeepL 保留商品基本信息和品牌不翻译的背景。失败重试会打印错误，接口重试耗尽停止任务。

短文本跨行缓存使用 Redis，各 provider 共用语言缓存，key 不区分大小写；长文本仍可在单行内去重。API_REQUEST_INTERVAL_MS 限制请求发起间隔，CONCURRENCY 控制单进程异步 worker。没有本地 JSON 缓存。

DeepL pool 位于 runtime/translation/deep-api-keys.ts；示例来自 src/translation/providers/deepl-api-keys/deep-api-keys.example.ts。Google 凭证 JSON 和 .env 同在 runtime/translation，可使用相对此目录的凭证路径。系统环境变量优先于根 .env，再优先于该目录 .env；前端不读取这些配置。

所有翻译命令按同一 pool 路径取得项目 Redis 运行锁，内部并发 worker 不并发改写 key 文件；耗尽 key 的持久化仍采用原子替换和内容校验。SIGINT/SIGTERM 停止领取，等待已开始任务与资源关闭；强杀不保证执行清理，重复执行按各路径的待办/标记恢复。

本次迁移只调整目录、依赖和资源定位，MongoDB pending 集合名、COMPLETE_MARK、Redis namespace、翻译字段与 provider 行为不变。未调用真实翻译 API。
