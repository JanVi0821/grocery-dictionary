# Grocery Dictionary monorepo

前端和数据流水线统一使用 pnpm workspace + Turbo。所有业务源码已迁入 apps/，原 fe/ 和 Step 1–4 不再作为执行目录；命令保留原业务行为和已有进度，不自动重抓、重译或发布。

## 目录

```text
apps/
  web/                         # Next App Router / Vinext / Cloudflare 前端
  data-pipeline/
    src/
      catalog/                 # Grocer 快照导入、变更比较、基础商品发布
      details/                 # barcode 详情抓取、filter 任务、清洗与重试
      translation/             # Google / DeepL、Redis 缓存、并发翻译
      publish/                 # 详情/译文发布、plan、run、批量覆盖
      jobs/                    # 持久发布任务的状态和租约
      cli.ts                   # 统一命令入口
      commands.ts              # 命令、默认参数与运行目录
      paths.ts                 # 本地状态与凭证路径
    env/                       # 不含真实凭证的环境配置模板
    sql/                       # 既有 SQL 文件，不会自动执行
packages/
  product-model/               # 前后端共用类型、详情清理和发布 payload
  pipeline-infra/              # 服务端数据库连接、SQL、CLI、安全退出
test/                          # 所有测试，按 details/translation/publish/web 分组
docs/                          # 模块说明和任务语义
runtime/                       # 本地状态与凭证；整个目录不进 Git
```

应用之间不直接导入源码；跨应用复用通过 workspace package。web 只依赖 product-model，不依赖服务端 pipeline-infra。不新增前端框架、不升级原有直接依赖。

## 安装与校验

Node.js >=22.18，pnpm 10.32.1。从根目录运行：

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm data --help
```

只保留根目录 pnpm-lock.yaml；不要在子目录执行 npm install。也可用 pnpm --filter @grocery/web dev 或 pnpm --filter @grocery/data-pipeline data --help。构建仅生成产物，不部署；业务命令不由 build/test 自动执行。Turbo 不缓存任何数据操作、构建或部署。

## 环境与本地状态

可选根目录 .env 配置公共服务端变量，模板为 .env.example。优先级为系统环境变量 > 根 .env > runtime/<业务>/.env。web 独立读取 apps/web/.env，绝不继承服务端 secret 到客户端；原前端 .env 已随应用移动。

已有运行文件已原位移动，不清空进度：

| 目录                | 保留内容                                                    |
| ------------------- | ----------------------------------------------------------- |
| runtime/catalog     | catalog .env、base_v3.duckdb、.grocer-* checkpoint 与旧快照 |
| runtime/details     | 抓取 .env、auth/new-world 和 auth/paknsave 本地认证         |
| runtime/translation | 翻译 .env、Google service account JSON、deep-api-keys.ts    |
| runtime/publish     | 本地发布报告；发布默认复用 catalog .env                     |

全新 checkout 可从 apps/data-pipeline/env/ 中复制相应模板到 runtime/<业务>/.env，也可只配置根 .env。命令自动创建运行目录，缺失可选 .env 不会立即报错；缺少必要变量仍会明确失败。Google 凭证可以是绝对路径，或相对 runtime/translation 的路径。DeepL 从 runtime/translation/deep-api-keys.ts 读取 pool，示例在 translation/providers/deepl-api-keys/deep-api-keys.example.ts；所有翻译命令共用该文件和项目 Redis 运行锁。

移动部署目录后，请将 CI/托管平台的前端工作目录改为 apps/web。迁移期间不要保留旧路径下的业务进程同时运行。

## 业务命令

以下命令会操作真实数据，必须显式执行，不是预览模式。无命令、--help 和未知命令不初始化业务服务。

| 命令（在 pnpm data 后）                 | 目的                        | 重复执行                     |
| --------------------------------------- | --------------------------- | ---------------------------- |
| catalog:import                          | Grocer 全量快照 → MongoDB   | 原全量 checkpoint            |
| catalog:refresh                         | 比较快照并标记基础变更      | 原增量 checkpoint            |
| catalog:bootstrap                       | 初始基础商品 → Supabase     | 原 migration checkpoint      |
| catalog:publish                         | 待处理基础变更 → Supabase   | _sync 提交后确认             |
| details:run --limit 100                 | 按 Supabase filter 抓取详情 | filter collection 的逐条状态 |
| details:retry:unmatched                 | 重抓未匹配商品              | retryAllVersion              |
| details:retry:invalid                   | 重抓非法 detail             | retryInvalidDetailVersion    |
| translation:run --limit 100             | 按 MongoDB filter 增量翻译  | FILTER + COMPLETE_MARK       |
| translation:retry --limit 100           | 重试失败译文                | 目标 failed 状态             |
| publish:details:plan --batch first      | 建立详情发布任务集          | 同配置/batch 复用            |
| publish:translations:plan --batch first | 建立译文发布任务集          | 同配置/batch 复用            |
| jobs:run --job <collection> --limit 100 | 发布待办                    | 跳过 succeeded，继续 pending |
| jobs:status --job <collection>          | 只读查看状态                | 不修改业务数据               |
| jobs:retry --job <collection>           | failed 重开为 pending       | 之后显式 run                 |

details:incremental 和 translation:incremental 保留最大 productId 增量路径，不能用于回填较小 ID。details:clean 会备份并清理 MongoDB，必须显式运行。details:sync、publish:details 和 publish:translations 保留按 filter 的批量覆盖路径，无逐条持久断点，不能与重叠发布任务并发运行。

配置与详解：

- [Catalog](docs/catalog-commands.md)：src/catalog/lib/config.ts。
- [Details](docs/details-commands.md)：src/details/filter-crawl-config.ts、retry-config.ts。
- [Translation](docs/translation-commands.md)：src/translation/config/translation.ts。
- [发布任务](docs/publication-jobs.md)与[批量覆盖](docs/publish-commands.md)：src/publish/config.ts。

这些 src 路径均相对 apps/data-pipeline。命令参数继续由各业务入口解析，例如 pnpm data translation:run --provider google --concurrency 2 --limit 10。父入口等待子进程退出、保留退出码并转交 SIGINT/SIGTERM；翻译和持久发布完成当前任务后退出。

## 当前边界

目录和依赖已收口，发布已接入持久任务引擎；抓取和翻译暂保留各自的任务状态机制。目录迁移不意味着所有旧断点已转换为 jobs 任务，也不会自动改写 MongoDB/Supabase 结构。见[进度与约束](docs/data-pipeline-refactor.md)。
