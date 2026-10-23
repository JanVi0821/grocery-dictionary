import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { loadOptionalEnvironment } from "@grocery/pipeline-infra/environment";

/** 本地状态独立于源码；模块移动不再改变任务进度或凭证路径。 */
export const repositoryRoot = fileURLToPath(
  new URL("../../../", import.meta.url),
);
export type RuntimeScope = "catalog" | "details" | "translation" | "publish";
export const runtimeDirectory = (scope: RuntimeScope) =>
  fileURLToPath(new URL(`../../../runtime/${scope}/`, import.meta.url));
export const deeplKeyFile = new URL(
  "../../../runtime/translation/deep-api-keys.ts",
  import.meta.url,
);

export function loadRuntimeEnvironment(scope: RuntimeScope) {
  loadOptionalEnvironment(join(repositoryRoot, ".env"));
  loadOptionalEnvironment(join(runtimeDirectory(scope), ".env"));
}
