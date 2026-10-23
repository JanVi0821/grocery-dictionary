/** 信号只阻止领取新任务；已开始的商品继续完成，资源关闭后才移除监听器。 */
export function registerGracefulShutdown(
  log = (event: unknown) => console.log(JSON.stringify(event)),
) {
  let stopping = false;
  const stop = (signal: "SIGINT" | "SIGTERM") => {
    if (stopping) return; // 重复 Ctrl+C/SIGTERM 也不强制中断当前任务。
    stopping = true;
    process.exitCode ??= signal === "SIGINT" ? 130 : 143;
    log({
      event: "shutdown_requested",
      signal,
      message: "停止领取新任务，等待正在处理的商品完成并写入数据库。",
    });
  };
  const onInterrupt = () => stop("SIGINT");
  const onTerminate = () => stop("SIGTERM");
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onTerminate);
  return {
    shouldStop: () => stopping,
    /** 调用前须等待 workflow 返回；关闭失败也等所有资源处理完，再抛出异常。 */
    close: async (resources: (() => Promise<unknown> | void)[]) => {
      try {
        const results = await Promise.allSettled(
          resources.map((close) => Promise.resolve().then(close)),
        );
        const failure = results.find((result) => result.status === "rejected");
        if (failure?.status === "rejected") throw failure.reason;
        if (stopping)
          log({
            event: "shutdown_completed",
            message: "当前任务已结束，连接和运行锁已释放。",
          });
      } finally {
        process.off("SIGINT", onInterrupt);
        process.off("SIGTERM", onTerminate);
      }
    },
  };
}
