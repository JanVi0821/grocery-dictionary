import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { registerGracefulShutdown } from '../src/command/graceful-shutdown.ts';

for (const signal of ['SIGINT', 'SIGTERM']) {
  test(
    `${signal}: repeated signals finish active rows before closing resources`,
    { timeout: 5000 },
    async (t) => {
      const shutdownUrl = new URL('../src/command/graceful-shutdown.ts', import.meta.url).href;
      const workerUrl = new URL('../src/workflow/concurrent-batch.ts', import.meta.url).href;
      const child = spawn(
        process.execPath,
        [
          '--input-type=module',
          '--eval',
          `
      import { registerGracefulShutdown } from ${JSON.stringify(shutdownUrl)};
      import { runConcurrentBatch } from ${JSON.stringify(workerUrl)};
      const events = [];
      const shutdown = registerGracefulShutdown(event => events.push(event.event));
      process.on('${signal}', () => process.send('signal-received'));
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      process.on('message', message => { if (message === 'finish') release(); });
      let started = 0;
      await runConcurrentBatch([1,2,3,4], 2, async (row, guard) => {
        events.push('start:' + row);
        if (++started === 2) process.send('ready');
        await gate;
        // 模拟继续翻译下一字段、落库、写完成标记及删除 pending。
        await guard();
        for (const stage of ['field', 'write', 'mark', 'pending-deleted']) events.push(stage + ':' + row);
      }, shutdown.shouldStop);
      await shutdown.close([async () => events.push('resources-closed')]);
      process.send({ events });
      process.disconnect();
    `,
        ],
        { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] },
      );
      let stderr = '';
      child.stderr.on('data', (data) => {
        stderr += data;
      });
      t.after(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      });
      // 收到 ready 后才发送真实 OS 信号，确保两条 row 均已开始。
      const [ready] = await once(child, 'message');
      assert.equal(ready, 'ready');
      for (let i = 0; i < 2; i++) {
        const acknowledged = once(child, 'message');
        child.kill(signal);
        assert.equal((await acknowledged)[0], 'signal-received');
        assert.equal(child.exitCode, null);
      }
      const completed = once(child, 'message');
      const exited = once(child, 'exit');
      child.send('finish');
      const [{ events }] = await completed;
      const [code, exitSignal] = await exited;
      assert.equal(stderr, '');
      assert.equal(code, signal === 'SIGINT' ? 130 : 143);
      assert.equal(exitSignal, null);
      assert.deepEqual(
        events.filter((e) => e.startsWith('start:')),
        ['start:1', 'start:2'],
      );
      assert.equal(events.filter((e) => e === 'shutdown_requested').length, 1);
      for (const row of [1, 2]) {
        assert.ok(events.includes('pending-deleted:' + row));
        assert.ok(events.indexOf('resources-closed') > events.indexOf('pending-deleted:' + row));
      }
      assert.equal(events.at(-1), 'shutdown_completed');
    },
  );
}

test('cleanup failure still waits for other resources and removes signal listeners', async () => {
  const listeners = [process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')];
  const shutdown = registerGracefulShutdown(() => {});
  let resolve;
  let completed = false;
  const gate = new Promise((done) => {
    resolve = done;
  });
  const closing = shutdown.close([
    async () => {
      throw new Error('close failed');
    },
    async () => {
      await gate;
      completed = true;
    },
  ]);
  const failure = assert.rejects(closing, /close failed/);
  assert.equal(completed, false);
  resolve();
  await failure;
  assert.equal(completed, true);
  assert.deepEqual([process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')], listeners);
});
