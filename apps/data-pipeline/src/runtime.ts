import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { Command } from "./commands.ts";
import { runtimeDirectory, repositoryRoot } from "./paths.ts";
export { repositoryRoot } from "./paths.ts";

/** 源码从应用目录解析；cwd 固定到业务运行目录，保证相对凭证与状态文件可续用。 */
export function commandInvocation(command: Command, args: string[]) {
  const application = join(repositoryRoot, command.directory);
  const cwd = command.runtime ? runtimeDirectory(command.runtime) : application;
  const nodeArgs: string[] = [];
  if (command.envFile)
    nodeArgs.push(`--env-file-if-exists=${join(application, command.envFile)}`);
  if (command.tsx) {
    const require = createRequire(join(application, "package.json"));
    nodeArgs.push("--import", require.resolve("tsx"));
  }
  nodeArgs.push(join(application, command.script), ...command.args, ...args);
  return { cwd, nodeArgs };
}

/** 等待子进程安全退出，保留错误码；通过程序发送给父进程的信号也转交业务脚本。 */
export async function runCommand(command: Command, args: string[]) {
  const { cwd, nodeArgs } = commandInvocation(command, args);
  if (command.runtime) mkdirSync(cwd, { recursive: true });
  const child = spawn(process.execPath, nodeArgs, {
    cwd,
    stdio: "inherit",
    env: process.env,
  });
  const interrupt = () => {
    child.kill("SIGINT");
  };
  const terminate = () => {
    child.kill("SIGTERM");
  };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  try {
    return await new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) =>
        resolve(
          code ?? (signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 1),
        ),
      );
    });
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
}
