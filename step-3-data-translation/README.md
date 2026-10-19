# 商品数据翻译 CLI

逐条读取 MongoDB `data_completion` 的 `{ needsReview: false }` 数据，按来源翻译 `detail` 字段，完整成功后写入同一数据库的 `data_completion_zh`。实际字段是 `needsReview`，不是 `need_review`。

## 运行

三个业务入口及其重复执行规则如下（均支持 `--concurrency 1–64`，默认 4）：

| 命令                            | 入口文件                                      | 处理范围                                                                | 再次执行时                                                              |
| ------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `translate:deepl` / `npm start` | `command/incremental-translation.ts`          | 源表 `needsReview=false` 且 `productId` 大于目标最大 `productId` 的记录 | 先恢复 pending 待办，再从目标最大 `productId` 继续                      |
| `retry:failed`                  | `command/retry-failed.ts`                     | 目标表 `translation.status=failed` 的记录，按 `productId` 回源表取原文  | 重新查询失败项；成功项不再匹配，仍失败的项再次尝试                      |
| `translate:filter`              | `command/incremental-translation-filtered.ts` | 源表匹配 `FILTER` 且尚未具有当前 `COMPLETE_MARK` 的记录                 | 自动跳过已完成项，按原表标记续跑未完成项；目标按 `productId` 更新或新增 |

三个流程统一使用 `processRow`，按唯一业务键 `productId` upsert；不覆盖目标已有 `_id`，新增时由 MongoDB 生成。原表和目标表的 `_id` 无需一致。普通增量以数值 `productId` 升序续跑，不代表插入时间：已越过的较小 ID 或 filter 写入较大 ID 后留下的空缺，需要通过 filter 命令补跑。

各翻译服务的快捷命令（不传 `--limit` 则处理全部后续数据）：

```sh
npm start -- --provider google --limit 100
npm run translate:deepl -- --limit 100 --concurrency 4
```

重试目标集合中 `translation.status: "failed"` 的记录使用独立入口，不会进入普通续跑逻辑。脚本按失败记录的 `productId` 回原始 `data_completion` 查询源文档，再用指定 provider 翻译并更新目标记录；目标 `_id` 仅用于本次分页：

```sh
npm run retry:failed
npm run retry:failed -- --provider deepl --limit 20
```

源集合中已找不到对应 `productId` 的失败结果会保留原样并打印 `retry_source_missing`。

按配置 filter 执行的翻译也有独立入口，不使用普通翻译的目标最大 `productId` 游标。编辑 `src/config/translation.ts` 的 `FILTER`（当前为 `{ retryAllVersion: 1 }`），再执行：

```sh
npm run translate:filter -- --limit 20
npm run translate:filter -- --provider deepl --limit 5
```

此流程从原集合按 filter 匹配源数据、按 `_id` 分批遍历，并将每行翻译结果以 `productId` 为键 upsert 到 `data_completion_zh`；已有同 `productId` 记录会更新，缺失记录会新增。三个命令实际写入前都会创建 `productId` 唯一索引，若目标集合已有重复 `productId`，索引创建会失败并停止，需先清理重复项。

`src/config/translation.ts` 的 `COMPLETE_MARK` 配置源记录的翻译完成标记，例如 `{ completeTranslation: 1 }`。普通翻译、失败重试和 filter 翻译在整行译文成功写入目标集合后，按源 `_id` 使用 `$set` 更新 `data_completion` 的对应记录。失败不写标记；`COMPLETE_MARK = {}` 时完全跳过原表更新。

filter 增量命令自动将 `FILTER` 与“尚未具有当前 `COMPLETE_MARK`”条件通过 `$and` 组合，无需手动添加完成字段条件。保持 `FILTER = { retryAllVersion: 1 }` 和 `COMPLETE_MARK = { completeTranslation: 1 }`，反复运行 `--limit 100` 就会跳过已标记的成功项、继续该批未完成项。多个标记字段必须全部存在且等于配置值才会跳过；旧版本标记或部分标记仍会处理。失败不写标记，下次仍可尝试；同一次执行内通过 `_id` 游标避免重复选中失败项。

要重跑成功项，可修改 `COMPLETE_MARK` 的版本值，或将其设为 `{}` 后按 FILTER 覆盖。空对象会同时关闭自动排除和原表更新，相同 `--limit` 可能重复处理前 N 条。目标写入与源标记更新是两次独立操作；标记更新失败会停止脚本，已保存的译文保留，下次仍可覆盖结果并补标记。已有历史译文若原表没有标记，也会作为待处理项重新执行。

所有翻译命令均直接将结果写入 MongoDB。可用 `--limit` 控制处理数量，再查看数据库中的结果。`npm start` 默认使用 Google。

需要 Node.js 22.18+（原生运行 TypeScript）和可连接的 Redis；`.env` 中配置 `REDIS_URL`，默认 `redis://127.0.0.1:6379`。在本目录执行 `npm install`。复制 `.env.example` 为 `.env`，设置 `MONGODB_URI`、`GOOGLE_CLOUD_PROJECT` 和 `GOOGLE_APPLICATION_CREDENTIALS`（服务账号 JSON 文件的绝对路径）。MongoDB URI 必须包含数据库名，也兼容现有爬虫 `/数据库/collection` 形式。Google 项目需启用 Cloud Translation API、绑定结算账号，服务账号需有 `roles/cloudtranslate.user` 权限。不要提交或分享凭证文件。

```sh
npm test
npm run typecheck
npm start -- --limit 1
npm start -- --limit 10
npm start
```

也可以加载现有爬虫的 MongoDB 环境文件，再加载本目录的 Google 配置（后者同名变量优先）：

```sh
node --env-file=../grocer_data_completion_new/.env --env-file=.env src/command/incremental-translation.ts --limit 10
node --env-file=../grocer_data_completion_new/.env --env-file=.env src/command/incremental-translation.ts
```

`npm test` 使用注入的假传输，不调用 Google、不计费。`--limit N` 限制本次处理总数（成功和失败都计入），不传则处理到没有新数据。每批最多 100 条，例如 `--limit 250` 分为 100、100、50 条三批。同一项目通过 Redis 运行锁限制为一个命令实例，实例内多个异步 worker 并发；不是 worker_threads。Redis 必须可连接，不会静默回退到内存缓存。

## Google Translate v3 配置

默认使用 Google，可用 CLI 切换：

```sh
npm start -- --limit 10
npm start -- --provider google --limit 10
```

`--provider` 接受 `google`（默认）和 `deepl`。选择 DeepL 时不加载 Google 凭证，也不会调用 Google API。所有服务仍写入 `data_completion_[lang]`，普通增量共用最大 `productId` 游标；切换服务不会重译已有记录，单条记录的 translation.provider 标识实际服务。

### DeepL 配置

在 `src/providers/deepl-api-keys/deep-api-keys.ts` 的 `DEEPL_API_KEYS` 数组填入本地 key，按排列顺序使用；`usedKeys` 保存耗尽的 key。该文件已加入 Git 忽略，初始数组为空，需要先手动配置；新 checkout 可将同目录的 `deep-api-keys.example.ts` 复制为 `deep-api-keys.ts`。不再读取 `.env` 中的 `DEEPL_API_KEY`。执行 `npm run translate:deepl -- --limit 10`，或 `npm start -- --provider deepl --limit 10`。

只有 HTTP 456 会将当前 key 原子保存到 `usedKeys`，随后使用下一把 key 继续翻译同一个字段；每把 key 独立选择 Free/Pro 接口。401、403、429、超时和其它错误不切换 key，仍走现有接口重试。key 全部耗尽、保存失败或运行期间手动修改 key 文件时立即停止，不写失败行或推进当前行游标。日志仅记录剩余和已用数量，不输出凭证。同一进程内所有 worker 共用 key pool；轮换通过 Promise 队列串行执行，旧 key 的多个 456 只写一次文件。跨命令由项目级 Redis 运行锁保护（跨语言也共用），添加 key 后重启脚本。

`src/providers/deepl.ts` 按[官方文档](https://developers.deepl.com/api-reference/translate/request-translation)使用 HTTPS JSON POST `/v2/translate` 和 `Authorization: DeepL-Auth-Key ...`。密钥以 `:fx` 结尾时使用 `api-free.deepl.com`，否则使用 `api.deepl.com`。源语言为 EN，目标语言取 LANG 并转换为大写；zh/zh-CN 映射 ZH-HANS，zh-TW 映射 ZH-HANT，不改变目标集合名称。

每字段发送一个 text 项；HTML description 使用 `tag_handling: html`，并启用 `preserve_formatting`。单请求超时 30 秒，序列化后的请求体不超过 128 KiB，不截断、不切换其他服务。请求失败、空译文或返回条数不符均进入统一重试，耗尽后停止任务且不推进当前行游标。provider 标记为 deepl，brand 和 productDisclaimerMessage 仍不翻译。

DeepL 请求的 `context` 和 `custom_instructions` 集中在 `src/providers/deepl-context.ts`。背景精简为新西兰超市商品、原始商品名称、品牌及可选的简短描述；名称和品牌优先使用 detail 中的值，为空时回退到外层 product_name 和 brand。品牌明确提供给模型，指令要求商品名称中的品牌保持原样，不翻译、不音译，其余描述正常翻译。辅助背景不额外提取营养、卡路里等数据。

所有字段共用简短指令：自然的超市商品用语、保留品牌、数字、单位及 HTML，不从背景补充信息。中文区分简体和繁体，不再按字段附加专门规则。背景始终来自原始商品，描述最多 1000 字符，待翻译文本保持完整。`custom_instructions` 仅用于支持的目标语言，其它语言仍发送 context。现有原文缓存继续共享，修改文案不会自动重译缓存或已完成记录。

修改 `src/config/translation.ts` 中的 `LANG` 常量指定目标语言，例如 `zh`、`ja`，目标集合自动使用 `data_completion_[lang]`。

`src/providers/google.ts` 使用官方 `@google-cloud/translate` 的 `v3.TranslationServiceClient`，通过 ADC 加载凭证。源语言固定为 `en`，目标语言使用 `LANG`，区域为 `global`，使用默认 NMT 模型。每个非空字段单独调用 `translateText`，单次超时 30 秒，关闭 SDK 自动重试以避免与统一重试叠加；空响应同样进入统一重试。运行结束关闭 SDK 客户端。

Google 结果标记 `translation.provider: google-v3`，DeepL 为 `deepl`；当前 `version: 4`。注意：最大 ID 续跑不会自动重译旧 mock 数据或旧版本记录，也不会还原历史已翻译字段；需要另行安排处理，不会自动删除。

带 HTML 标签的 description 使用 `text/html`，其它字段使用 `text/plain`。没有额外实现 Markdown 保护、术语表或品牌保护，成分声明中的 `**`、产品名中的品牌等需抽样检查翻译质量。非白名单字段保持原样。

凭证加载失败会在读取商品前终止。Google 权限、认证、配额错误及其它接口错误均进入统一重试，耗尽后停止任务且不写失败行、不推进该行游标，修复配置后可继续。

### Redis 缓存和并发

每个商品仍有独立的行内 Map；全局短文本缓存改为 Redis Hash，每次翻译成功立即保存，不再每 10 条写本地 JSON，也不需要退出时保存。Hash 名为 `grocer:translation:cache:<lang>`（前缀由 REDIS_NAMESPACE 配置），field 是小写原文。Google、DeepL 共用同一语言缓存，不按 provider 或 VERSION 隔离；不同语言隔离。`GLOBAL_CACHE_MAX_CHARS=100` 表示不超过 100 个 Unicode 字符可全局复用，0 关闭全局缓存。命中打印 `translation_cache_hit`，cache 为 redis；行内命中为 row。

相同短文本并发请求使用带令牌、自动续期的 Redis 文本锁；拿到锁后再次检查缓存，避免多个 worker 重复付费。锁提交和释放均校验令牌，不能删除新持有者的锁。长文本仍只在商品内复用。不读取、写入或导入任何本地缓存文件，全局翻译缓存仅存储在 Redis。

三个命令都支持 `--concurrency 4`；默认值为 config.CONCURRENCY，范围 1–64。每批最多 100 个商品，并发处理商品、顺序处理单个商品的字段。`--limit` 限制本次总任务数，不是每个 worker 的数量。日志包含 worker 编号，完成日志可能乱序。首个致命错误停止领取后续任务，并在商品提交前阻止其它 worker 继续写入；已发出的网络/数据库请求无法撤回。等待所有在途 worker 结束后才关闭 Redis 和 MongoDB。Ctrl+C 停止领取，允许已在处理的商品完成。

同一项目所有命令（含不同语言）使用同一个运行锁，避免并发改写共享 DeepL key 文件。Redis 锁会自动续期；连接失败、重启或失去所有权时停止，不继续提交结果。不要为并行运行同一项目而更换 Redis URL/namespace。Redis 缓存要跨 Redis 重启保留，需在 Redis 服务端启用 AOF 或 RDB；脚本不会修改服务端持久化配置。

### 安全退出

三个命令均持续监听 SIGINT（Ctrl+C）和 SIGTERM。收到信号后打印 `shutdown_requested`，不再领取新商品；已经开始的商品继续完成所有字段翻译、Redis 缓存、MongoDB 写入、完成标记及普通增量的 pending 删除。所有在途 worker 结束后，才关闭 MongoDB、翻译 SDK 和 Redis，释放运行锁并打印 `shutdown_completed`。等待期间重复 Ctrl+C/SIGTERM 也不会强制中断。退出码分别为 130 / 143；任务失败时仍遵循现有错误处理。

这里的安全退出不能保证 API/数据库错误、额度耗尽或锁失效后任务一定成功，仍保留未完成任务供下次恢复；SIGKILL（kill -9）、断电及系统强杀无法捕获。不要用强制结束来代替 Ctrl+C 或 SIGTERM。

### 接口失败重试

所有 CLI 翻译服务（Google、DeepL）使用 `providers/retry.ts`：每个字段首次失败后最多再重试 4 次，共最多 5 次调用；等待间隔依次为 4、8、8、16 秒。成功后继续后续字段，每个新字段独立计算次数。每次重试输出 `translation_retry` 日志，包含 provider、source、字段路径、重试次数和等待时间，不输出原文、密钥或原始服务响应。

重试全部失败则以退出码 1 停止脚本，不写入当前行的部分结果或失败记录、不推进游标；下次运行会从这条尚未完成的商品继续。已经写入的商品不受影响。启动配置/凭证加载失败和 MongoDB 错误不属于接口重试；数据结构校验失败仍按原流程保存失败记录。下次续跑会重新翻译当前未完成行的字段。

### 请求速率

`src/config/translation.ts` 的 `API_REQUEST_INTERVAL_MS` 设置翻译接口请求的最小间隔，单位毫秒，默认 `100`，即最多每 100 毫秒发起一次请求（约每秒 10 次）。所有服务及重试共用该进程级限速器。仅限制请求开始时间，不等待前一请求的响应，因此允许网络请求重叠；设置为 `0` 可关闭通用限速。

## 翻译范围

白名单位于 `src/workflow/fields.ts`。通过 `import type` 直接复用 `../fe/src/types/grocer-detail.ts` 的来源联合类型、商品详情类型和营养行类型，不复制定义。白名单路径也受详情类型约束，错误字段名会在 `npm run typecheck` 时被发现。MongoDB 的静态类型不替代运行时校验，HTML 等无效 detail 仍会被拒绝。测试使用 JavaScript 调用 TypeScript 模块，以覆盖故意构造的异常数据库数据。

| 来源                 | 翻译字段                                                                                                                                                                                                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| new-world / paknsave | name、description、两种 ingredientStatement、三种 allergenStatement、warningCopyDescription、originStatement、categories、categoryTrees 的 level0/1/2、facets.itemDescription、nutrients 的 nutrientTypeDescription / servingSizeDescription                                                                     |
| woolworths           | name、genericName、variety、description、directions、servingSuggestion、ingredients 的 ingredients / footnotes、allergens、allergenMaybePresent、warnings、origins、claims、contents、endorsements、breadcrumb 的分类 name、nutrition 的列头 name / servings / footnotes.displayText，以及递归营养行的第一列标签 |

只翻译已存在的非空字符串，不补造缺失字段。除 detail 白名单外，同时翻译最外层 `product_name`，上下文路径为 `row.product_name`。实际翻译字段计入 fieldCount，全部成功才写入完成结果；失败保存原始整行内容，不保存部分译文。源商品原文保持不变，仅在成功后更新 COMPLETE_MARK 配置的标记字段。外层 brand、detail.brand 和 productDisclaimerMessage 不调用翻译 API，保留原值而非删除字段。价格、数量、单位、营养数值、SKU、条码、URL、营销活动、系统代码等保持原样。两种成分声明独立处理，不擅自合并。营养表的 suffix / prefix 和数值列保持原样。

## 逐行输出

每行开始时打印 `row_started`（ID、productId、source），写入完成后立即打印 `row_processed`，日志包含 worker、productId、商品名称等摘要；完整译文查看目标集合。每批和最终仍输出统计。缓存命中日志含原文，请注意日志访问权限。

## 增量翻译的续跑与原子性

- 普通增量每批先将待办写入 MongoDB 的 `data_completion_<lang>_pending`（TASK_COLLECTION），以 productId 为唯一键，记录本次 taskId；随后才并发翻译。商品及完成标记写入后才删除待办。
- 重启优先恢复 pending，再读取目标最大 productId，从源表 needsReview=false 的后续 productId 按升序取下一批。较大 ID 先完成不会使较小的未完成任务被跳过。不要手动清空 pending。
- 如果商品已写入而标记或待办尚未完成就崩溃，通过目标 translation.taskId 判断是否为同一次任务，补标记并删除待办，不再次调用 API。pending 对应原商品缺失时停止并保留待办。
- 默认不是每行检查已有译文来选择任务；目标 taskId 查询只用于待办的提交幂等恢复。各商品均按 productId upsert，保留目标已有 _id，去掉 attempts。
- 整行完整成功才写 completed。数据结构校验失败写原始整行及 failed，并结束当前待办，后续用 retry:failed 重试。API 重试耗尽、Redis/MongoDB 错误保留待办并停止；部分字段不会作为完整译文写入，但已成功的短文本仍在 Redis。
- filter 增量仍根据原表 FILTER + COMPLETE_MARK 选取，失败重试仍根据目标 failed 状态选取；二者不使用普通增量的最大 ID，也不与普通 pending 混用。
- 写译文、原表标记、删待办不是一个事务，但普通增量可通过 taskId 恢复。只更新原表完成标记，不改原文。
- 历史已有高 ID/空洞或后来补入较小 ID 的数据不自动补齐；pending 只保护启用本流程后已经入队的任务。需要用 filter 命令补跑历史空洞。

## 代码组织

```text
src/
  command/                 # CLI 入口、初始化和资源释放
    incremental-translation.ts # 按目标最大 productId 续跑的增量翻译
    retry-failed.ts        # 失败记录重试
    incremental-translation-filtered.ts # 带筛选条件的增量翻译入口
    args.ts                # 命令行参数解析
  config/
    translation.ts         # 语言、集合、版本和任务配置
  db/
    mongodb.ts             # MongoDB URI 和连接创建
    redis.ts               # Redis 连接和令牌锁（自动续期）
  types/
    translation.ts         # 复用商品类型、翻译协议
  providers/
    initialize-provider.ts # 项目运行锁、初始化资源、Redis 缓存和重试
    redis-cache.ts         # Redis 短文本缓存和同文本请求合并
    retry.ts               # 字段级接口重试，耗尽后停止且不推进游标
    errors.ts              # 需停止任务的服务错误
    google.ts              # Google v3
    deepl.ts               # DeepL Free/Pro
    deepl-context.ts       # 超市商品翻译背景和品牌保留指令
  workflow/
    fields.ts              # 字段白名单、复制原对象、定位待翻译文本
    row.ts                 # 整行翻译、失败记录、原子写入
    incremental-translation-runner.ts # 按最大 productId 增量续跑
    incremental-translation-runner-filtered.ts # FILTER + COMPLETE_MARK 增量续跑
    retry-failed.ts        # 读取失败记录并重试翻译
    completion.ts          # 更新原表翻译完成标记
    concurrent-batch.ts    # 有界异步 worker，致命失败后等待全部在途任务
test/                      # 离线测试，不调用付费 API
```

修改翻译范围看 `workflow/fields.ts`；修改某个平台请求看 `providers/`；修改续跑或批次行为看 `workflow/`；CLI 入口及参数解析集中在 `command/`。

函数命名按职责区分：`initializeProvider` 初始化可执行的翻译服务（含缓存和重试）；各平台的 `initializeTranslator` 初始化认证及请求资源；`createGoogleTranslationFunction` / `createDeeplTranslationFunction` 仅根据已有依赖创建翻译函数。三个工作流分别为 `runIncrementalTranslation`、`runFilteredIncrementalTranslation`、`runFailedTranslationRetry`，对应普通增量、带筛选条件的增量、失败重试。CLI 参数由 `parseTranslationArgs` 解析，待翻译字段由 `prepareRowTranslation` 准备。
