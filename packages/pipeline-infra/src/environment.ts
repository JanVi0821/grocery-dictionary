import { existsSync } from "node:fs";

/** 系统环境变量优先；可选的根目录 .env 其次；旧脚本自己的 .env 仍作为兼容回退。 */
export function loadOptionalEnvironment(path: string | URL) {
  if (existsSync(path)) process.loadEnvFile(path);
}
