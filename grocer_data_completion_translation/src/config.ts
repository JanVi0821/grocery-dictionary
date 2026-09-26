export const LANG = 'zh';
export const SOURCE_COLLECTION = 'data_completion';
export const TARGET_COLLECTION = `data_completion_${LANG}`;
// Change these when replacing the mock or changing translation rules.
export const PROVIDER = 'google-v3';
export const VERSION = 4;
// Cache short source text across rows in memory only; 0 disables this cache.
export const GLOBAL_CACHE_MAX_CHARS = 60;
// Minimum interval between translation API requests across the script, in milliseconds.
export const API_REQUEST_INTERVAL_MS = 100;
