/** Fatal service/configuration error: stop without advancing the current row's cursor. */
export class TranslationServiceError extends Error {}

/** 缓存、运行锁或并发 worker 已失效：立即停止，不重试 API、不写失败行。 */
export class TranslationRuntimeError extends TranslationServiceError {}
