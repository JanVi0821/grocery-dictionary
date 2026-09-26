# 商品数据翻译 CLI

逐条读取 MongoDB `data_completion` 的 `{ needsReview: false }` 数据，按来源翻译 `detail` 字段，完整成功后写入同一数据库的 `data_completion_zh`。实际字段是 `needsReview`，不是 `need_review`。

## 运行

各翻译服务的快捷命令（不传 `--limit` 则处理全部后续数据）：

```sh
npm run translate:google -- --limit 100
npm run translate:baidu -- --limit 100
npm run translate:baidu-llm -- --limit 100
npm run translate:deepl -- --limit 100
```

可以继续追加 `--dry-run`；注意仍会调用真实 API 并可能计费，只是不写 MongoDB。`npm start` 默认使用 Google。

需要 Node.js 22.18+（原生运行 TypeScript）。在本目录执行 `npm install`。复制 `.env.example` 为 `.env`，设置 `MONGODB_URI`、`GOOGLE_CLOUD_PROJECT` 和 `GOOGLE_APPLICATION_CREDENTIALS`（服务账号 JSON 文件的绝对路径）。MongoDB URI 必须包含数据库名，也兼容现有爬虫 `/数据库/collection` 形式。Google 项目需启用 Cloud Translation API、绑定结算账号，服务账号需有 `roles/cloudtranslate.user` 权限。不要提交或分享凭证文件。

```sh
npm test
npm run typecheck
npm start -- --limit 1
npm start -- --dry-run --limit 10
npm start
```

也可以加载现有爬虫的 MongoDB 环境文件，再加载本目录的 Google 配置（后者同名变量优先）：

```sh
node --env-file=../grocer_data_completion_new/.env --env-file=.env src/index.ts --dry-run --limit 10
node --env-file=../grocer_data_completion_new/.env --env-file=.env src/index.ts
```

**`--dry-run` 仍会调用真实 Google API，可能计费，只是不写数据库、不保存进度。** `npm test` 使用注入的假传输，不调用 Google、不计费。`--limit N` 限制本次处理总数（成功和失败都计入），不传则处理到没有新数据。每批最多 100 条，例如 `--limit 250` 分为 100、100、50 条三批。仅启动一个脚本实例，不包含多进程任务锁。

## Google Translate v3 配置

默认使用 Google，可用 CLI 切换：

```sh
npm start -- --limit 10
npm start -- --provider google --limit 10
npm start -- --provider baidu --limit 10
npm start -- --provider baidu-llm --limit 10
```

`--provider` 接受 `google`（默认）、`baidu`（通用翻译）、`baidu-llm`（大模型文本翻译）、`deepl`。选择百度或 DeepL 时不加载 Google 凭证，也不会调用 Google API。所有服务仍写入 `data_completion_[lang]`，共用最大 `_id` 游标；切换服务不会重译已有记录，单条记录的 translation.provider 标识实际服务。

### DeepL 配置

在 `.env` 设置 `DEEPL_API_KEY`，执行 `npm run translate:deepl -- --limit 10`，或 `npm start -- --provider deepl --limit 10`。

`src/providers/deepl.ts` 按[官方文档](https://developers.deepl.com/api-reference/translate/request-translation)使用 HTTPS JSON POST `/v2/translate` 和 `Authorization: DeepL-Auth-Key ...`。密钥以 `:fx` 结尾时使用 `api-free.deepl.com`，否则使用 `api.deepl.com`。源语言为 EN，目标语言取 LANG 并转换为大写；zh/zh-CN 映射 ZH-HANS，zh-TW 映射 ZH-HANT，不改变目标集合名称。

每字段发送一个 text 项；HTML description 使用 `tag_handling: html`，并启用 `preserve_formatting`。单请求超时 30 秒，序列化后的请求体不超过 128 KiB，不截断、不切换其他服务。请求失败、空译文或返回条数不符均进入统一重试，耗尽后停止任务且不推进当前行游标。provider 标记为 deepl，brand 和 productDisclaimerMessage 仍不翻译。`--dry-run` 会调用真实 API 并消耗额度，不写 MongoDB。

### 百度大模型文本翻译

`src/providers/baidu-llm.ts` 使用[官方大模型文档](https://fanyi-api.baidu.com/doc/21)中的 `https://fanyi-api.baidu.com/ait/api/aiTextTranslate`，以 JSON POST 发送 appid/from/to/q 和明确的 `model_type: llm`。认证使用 `Authorization: Bearer BAIDU_API_KEY`，APPID 仍取 `BAIDU_APP_ID`。需要在百度控制台开通“大模型文本翻译 API”，并使用 API Key 管理页面创建的 key；不要把通用接口的 MD5 签名密钥当成 Bearer API Key，两种凭证不保证通用。

复用语言映射、请求间隔（1100ms）、超时（30秒）和响应处理，不自动降级为 nmt 或 Google。单个文本片段超过 6000 Unicode 字符时失败，不截断。官方 tag_handling/ignore_tags 仅支持 nmt，因此 llm 模式也在本地解析 HTML，仅翻译文本节点，保留标签和属性。结果 provider 为 `baidu-llm`。`--dry-run` 仍真实调用、可能计费；没有新增重试任务或改变翻译字段白名单。

### 百度配置

在 `.env` 中添加 `BAIDU_APP_ID` 和 `BAIDU_API_KEY`（百度翻译开放平台的 APPID 和签名密钥，不是 Google credentials）。

独立实现位于 `src/providers/baidu.ts`，使用 HTTPS POST 表单和 `MD5(appid + 原文 + salt + 密钥)` 签名。依据[用户提供的官方文档入口](https://fanyi-api.baidu.com/doc/21)及[通用文本翻译接入文档](https://api.fanyi.baidu.com/doc/23)。所有响应分段按换行合并，不只取第一条。源语言为 en；常见目标代码映射包括 ja→jp、ko→kor、fr→fra、es→spa、zh-TW→cht。不支持的映射明确停止，不猜测语言代码。

默认串行请求间隔至少 1100ms，30 秒超时，失败进入统一重试。为保守兼容长度限制，单个文本片段超过 6000 UTF-8 字节时失败，不截断；暂不自动切分长文本。HTML description 解析为文本节点后逐个翻译，保留标签和属性（序列化可能规范化实体和格式），script/style 不翻译。Markdown 暂无额外保护。

认证、签名、余额、频率等接口错误，以及超时、系统错误和无效译文均进入统一重试，耗尽后停止任务且不推进该行游标。provider 保存为 baidu。`--dry-run` 对百度同样会真实调用并可能计费。

修改 `src/config.ts` 中的 `LANG` 常量指定目标语言，例如 `zh`、`ja`，目标集合自动使用 `data_completion_[lang]`。

`src/providers/google.ts` 使用官方 `@google-cloud/translate` 的 `v3.TranslationServiceClient`，通过 ADC 加载凭证。源语言固定为 `en`，目标语言使用 `LANG`，区域为 `global`，使用默认 NMT 模型。每个非空字段单独调用 `translateText`，单次超时 30 秒，关闭 SDK 自动重试以避免与统一重试叠加；空响应同样进入统一重试。运行结束关闭 SDK 客户端。

Google 结果标记 `translation.provider: google-v3`，百度为 `baidu`；当前 `version: 4`。注意：最大 ID 续跑不会自动重译旧 mock 数据或旧版本记录，也不会还原历史已翻译字段；需要另行安排处理，不会自动删除。

带 HTML 标签的 description 使用 `text/html`，其它字段使用 `text/plain`。没有额外实现 Markdown 保护、术语表或品牌保护，成分声明中的 `**`、产品名中的品牌等需抽样检查翻译质量。非白名单字段保持原样。

凭证加载失败会在读取商品前终止。Google 权限、认证、配额错误及其它接口错误均进入统一重试，耗尽后停止任务且不写失败行、不推进该行游标，修复配置后可继续。

### 内存缓存

脚本开始处理商品前，先读取共用的 `src/cache/<lang>.json` 快照载入内存，所有翻译服务共享；不存在则从空缓存启动，并打印 `translation_cache_loaded` 条目数。快照损坏时脚本会报错停止，避免忽略已有缓存。每处理完 10 行（本次执行累计，包含已保存的失败记录和 dry-run 行），将全局缓存快照写入该文件。内容为原文到译文的 JSON 对象，通过临时文件加重命名覆盖该语言的上一份快照，并打印 `translation_cache_saved`。不足 10 行的尾数不额外保存；接口重试耗尽而中断的当前行不计入已处理数。写文件失败会停止脚本，但此前已写入 MongoDB 的行不回滚。旧版按 provider 命名的缓存文件会在共享文件不存在时合并读入。快照已被 Git 忽略。

翻译前先查当前行的原文缓存，再查已载入内存的运行期短文本缓存，均未命中才请求接口。所有 CLI 翻译服务均支持；仅缓存成功且非空的译文。两层缓存的 key 均使用 `text.toLowerCase()`：`milk`、`Milk`、`MILK` 复用首次成功的译文，空格仍区分。接口请求和命中日志保留原文，JSON 快照使用小写 key。`src/config.ts` 的 `GLOBAL_CACHE_MAX_CHARS` 默认 30，表示不超过 30 个 Unicode 字符的文本可跨行复用，设为 0 可关闭跨行缓存。长文本仍仅在同一行复用。不同翻译器实例和目标语言的缓存相互隔离；内存缓存随脚本退出释放。fieldCount 仍表示完成翻译的字段数，而非接口调用次数。

### 接口失败重试

所有 CLI 翻译服务（Google、百度通用、百度大模型、DeepL）使用 `providers/retry.ts`：每个字段首次失败后最多再重试 3 次，共最多 4 次调用；等待间隔依次为 1、2、4 秒。成功后继续后续字段，每个新字段独立计算次数。每次重试输出 `translation_retry` 日志，包含 provider、source、字段路径、重试次数和等待时间，不输出原文、密钥或原始服务响应。

重试全部失败则以退出码 1 停止脚本，不写入当前行的部分结果或失败记录、不推进游标；下次运行会从这条尚未完成的商品继续。已经写入的商品不受影响。启动配置/凭证加载失败和 MongoDB 错误不属于接口重试；数据结构校验失败仍按原流程保存失败记录。百度 HTML 字段可能包含多次文本节点请求，重试会重新处理该字段，可能重复消耗额度；下次续跑也会重新翻译当前未完成行的字段。

### 请求速率

`src/config.ts` 的 `API_REQUEST_INTERVAL_MS` 设置翻译接口请求的最小间隔，单位毫秒，默认 `100`，即最多每 100 毫秒发起一次请求（约每秒 10 次）。所有服务及重试共用该进程级限速器；百度 HTML 中的每个文本节点请求也按此间隔限速。设置为 `0` 可关闭通用限速。

## 翻译范围

白名单位于 `src/workflow/fields.ts`。通过 `import type` 直接复用 `../fe/src/types/grocer-detail.ts` 的来源联合类型、商品详情类型和营养行类型，不复制定义。白名单路径也受详情类型约束，错误字段名会在 `npm run typecheck` 时被发现。MongoDB 的静态类型不替代运行时校验，HTML 等无效 detail 仍会被拒绝。测试使用 JavaScript 调用 TypeScript 模块，以覆盖故意构造的异常数据库数据。

| 来源                 | 翻译字段                                                                                                                                                                                                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| new-world / paknsave | name、description、两种 ingredientStatement、三种 allergenStatement、warningCopyDescription、originStatement、categories、categoryTrees 的 level0/1/2、facets.itemDescription、nutrients 的 nutrientTypeDescription / servingSizeDescription                                                                     |
| woolworths           | name、genericName、variety、description、directions、servingSuggestion、ingredients 的 ingredients / footnotes、allergens、allergenMaybePresent、warnings、origins、claims、contents、endorsements、breadcrumb 的分类 name、nutrition 的列头 name / servings / footnotes.displayText，以及递归营养行的第一列标签 |

只翻译已存在的非空字符串，不补造缺失字段。除 detail 白名单外，同时翻译最外层 `product_name`，上下文路径为 `row.product_name`。实际翻译字段计入 fieldCount，全部成功才写入完成结果；失败保存原始整行内容，不保存部分译文。源 row 和源集合不变。外层 brand、detail.brand 和 productDisclaimerMessage 不调用翻译 API，保留原值而非删除字段。价格、数量、单位、营养数值、SKU、条码、URL、营销活动、系统代码等保持原样。两种成分声明独立处理，不擅自合并。营养表的 suffix / prefix 和数值列保持原样。

## 逐行输出

每行开始时打印 `row_started`（ID、productId、source），写入完成后立即打印 `row_processed`，其中 `data` 为完整的写入对象，包含译文或失败记录、translation 状态，不含 attempts。dry-run 也会打印完整结果，但标记 dryRun=true，未写库。每批和最终仍输出统计。输出包含完整商品文本，请注意日志体积和访问权限。

## 续跑与原子性

- 启动时只查询一次目标集合的最大 `_id`，成功和失败记录均计入；这里 ID 是源 MongoDB `_id`，不是业务 `productId`。
- 从原集合查询 `{ needsReview: false, _id: { $gt: 游标 } }`，按 `_id` 升序取最多 100 条。目标为空时从第一条符合条件的数据开始。
- 逐行、逐字段串行处理，每行落库成功后推进游标；本批结束后查询下一批，不逐行查询目标集合判断完成状态。
- 目标文档复用源 `_id`，保留其它源字段但剔除原表 `attempts`，添加 translation 元数据。
- 全部字段翻译完成才原子写入 `translation.status: completed`。接口重试耗尽立即停止且不写当前行。数据结构校验等非接口失败则写入原始 detail（不是部分译文）和 `translation.status: failed`、`error`、`failedAt`，继续后续行。失败记录同样不包含 attempts。
- 后续重试可查询目标集合 `{ 'translation.status': 'failed' }`。本次只实现失败记录，不新增重试命令；普通执行不会重试游标之前的失败行。
- 有翻译失败时退出码为 1。MongoDB 读写异常直接中止，不能在失败标记未落库时继续推进后面的 ID。
- 已知少量 woolworths detail 为 HTML 字符串，按坏数据拒绝处理，不伪装成成功结果。
- Ctrl+C 等待当前行处理结束后停止；强制终止后重新执行也可续跑。续跑只保证行级恢复，不保存行内已翻译字段。
- 不修改或删除源集合数据，也不会清理源集合中已被删除记录对应的历史译文。
- 此方案要求目标集合是本脚本按升序连续处理生成的结果（失败也有记录），且不并发运行。不适用于已有任意高 ID 或历史空洞的目标集合；旧游标之前后来才变成 needsReview=false 的记录、旧数据更新、手动删除的结果不会自动补跑，需另行处理。

## 代码组织

```text
src/
  index.ts                 # CLI 入口、初始化和资源释放
  cli.ts                   # 参数解析
  config.ts                # 语言、集合、版本配置
  db.ts                    # MongoDB URI 和连接创建
  types.ts                 # 复用商品类型、翻译协议
  providers/
    select.ts              # 服务选择和生命周期
    retry.ts               # 字段级接口重试，耗尽后停止且不推进游标
    errors.ts              # 需停止任务的服务错误
    google.ts              # Google v3
    baidu.ts               # 百度请求、语言映射、HTML 处理
    baidu-llm.ts           # 百度大模型入口
    deepl.ts               # DeepL Free/Pro
  workflow/
    fields.ts              # 字段白名单、复制原对象、定位待翻译文本
    row.ts                 # 整行翻译、失败记录、原子写入
    runner.ts              # 最大 ID 续跑、分批读取、逐行日志
  maintenance/
    restore-original-fields.ts # 历史数据还原（默认只读）
test/                      # 离线测试，不调用付费 API
```

修改翻译范围看 `workflow/fields.ts`；修改某个平台请求看 `providers/`；修改续跑或批次行为看 `workflow/runner.ts`。维护脚本与正常翻译入口分离，不会在启动翻译时执行。
