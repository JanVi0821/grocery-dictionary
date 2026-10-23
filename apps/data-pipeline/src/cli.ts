import { loadOptionalEnvironment } from "@grocery/pipeline-infra/environment";
import { commands } from "./commands.ts";
import { runCommand } from "./runtime.ts";

const [name, ...args] = process.argv.slice(2);
// 帮助和错误命令不读取凭证、不加载数据库/浏览器/翻译 SDK。
if (!name || name === "--help" || name === "help") {
  console.log("用法：pnpm data <业务:动作> [参数]\n");
  for (const [name, command] of Object.entries(commands))
    console.log(`${name.padEnd(27)} ${command.description}`);
  console.log(
    "\n源码已统一到 data-pipeline；发布支持 plan/run/status/retry，抓取与翻译保留各自断点机制，不自动串联。",
  );
} else if (!Object.hasOwn(commands, name)) {
  console.error(`未知命令：${name}。运行 pnpm data --help 查看可用命令。`);
  process.exitCode = 1;
} else if (args.includes("--help") || args.includes("-h")) {
  const command = commands[name as keyof typeof commands];
  console.log(
    `${name}\n${command.description}\n执行入口：${command.directory}/${command.script}\n默认参数：${command.args.join(" ")}\n附加参数由对应命令解析；帮助不会执行业务操作。`,
  );
} else {
  try {
    loadOptionalEnvironment(new URL("../../../.env", import.meta.url));
    process.exitCode = await runCommand(
      commands[name as keyof typeof commands],
      args,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
