/** 三个命令共用的翻译任务配置；filter 增量流程通过当前 COMPLETE_MARK 判断是否完成。 */

/** 目标语言代码；同时决定翻译接口语言和 Redis 缓存 Hash。 */
export const LANG = 'zh';

/** 原文集合；三个命令均从这里取原始商品，成功后也在此集合写完成标记。 */
export const SOURCE_COLLECTION = 'data_completion';

/** 译文集合，默认按语言区分；LANG=zh 时写入 data_completion_zh。 */
export const TARGET_COLLECTION = `data_completion_${LANG}`;

/**
 * 仅 incremental-translation-filtered 命令使用的原表 MongoDB 查询条件，{} 表示匹配全部原文。
 * 自动叠加“尚未具有当前 COMPLETE_MARK”的条件，业务 FILTER 无需手动排除成功项。
 * 不自动叠加 needsReview，也不读取目标集合判断是否已经翻译。
 * 如需重跑已有成功项，可调整 COMPLETE_MARK 的字段或版本值，或设为 {} 后按 FILTER 覆盖。
 */
export const FILTER = {
  needsReview: false,
  at: {
    $gte: new Date('2026-10-20T00:00:00Z'),
  },
  // productId: 122023,
} as const;

/**
 * 三个命令在整行译文成功落库后，按源 _id 通过 $set 写入原表的字段和值。
 * {} 表示完全跳过原表更新；翻译失败不写标记，已经存在的旧标记不会被自动删除。
 * filter 增量流程自动跳过所有标记字段和值都已匹配的记录；缺失字段或旧版本会继续处理。
 * {} 同时关闭 filter 的自动跳过逻辑；另外两个命令的选取范围仍由各自游标/失败状态决定。
 */
export const COMPLETE_MARK: Record<string, unknown> = { completeTranslation: 1 };

/**
 * 未传 provider 的底层逐行处理函数使用的 translation.provider 默认标签。
 * 不决定 CLI 调用哪个 API；CLI 由 --provider 选择服务并传入实际 provider 标签。
 * 统一 CLI 默认传入 DeepL；直接调用未传 provider 的参数解析器时默认 Google。
 */
export const PROVIDER = 'deepl';

/** 写入 translation.version 的规则版本；升级版本不自动清除缓存或重译历史结果。 */
export const VERSION = 4;

/**
 * 原文不超过此 Unicode 字符数时可跨行缓存；0 关闭全局缓存，行内缓存仍有效。
 * Google 和 DeepL 共用 Redis 语言缓存，key 不区分大小写；每次成功即时保存。
 * 缓存命中会跳过 API，修改 provider、规则文案或 VERSION 不会使已有缓存失效。
 */
export const GLOBAL_CACHE_MAX_CHARS = 100;

/**
 * 单进程 API 请求的最小发起间隔，单位毫秒；100 表示每 100ms 最多发起一次。
 * 所有接口调用及失败重试共用该限速器，仅间隔发起时间、不串行等待响应；0 关闭间隔限制。
 */
export const API_REQUEST_INTERVAL_MS = 100;

/** 单进程异步 worker 数；商品之间并发，单个商品内字段仍顺序翻译。CLI --concurrency 可覆盖。 */
export const CONCURRENCY = 2;
/** 普通增量先持久化待办，恢复时优先处理，避免并发乱序完成导致最大 ID 跳过任务。 */
export const TASK_COLLECTION = `${TARGET_COLLECTION}_pending`;
/** 同一项目所有命令共用运行锁；不同 provider 共用每种语言的短文本缓存。 */
export const REDIS_NAMESPACE = 'grocer:translation';
export const REDIS_LOCK_TTL_MS = 60_000;
export const CACHE_LOCK_WAIT_MS = 300_000;
