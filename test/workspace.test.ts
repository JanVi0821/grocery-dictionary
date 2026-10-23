import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { commands } from "../apps/data-pipeline/src/commands.ts";
import {
  deeplKeyFile,
  runtimeDirectory,
} from "../apps/data-pipeline/src/paths.ts";
import {
  commandInvocation,
  repositoryRoot,
  runCommand,
} from "../apps/data-pipeline/src/runtime.ts";
import {
  parseMongoConnection,
  createDatabaseConnection,
} from "../packages/pipeline-infra/src/mongodb.ts";
import { cleanDocument } from "../packages/product-model/src/completion.ts";
import { removeUnusedDetailFields } from "../packages/product-model/src/detail-fields.ts";
import { readLimit } from "../packages/pipeline-infra/src/cli.ts";
import { removeUnusedDetailFields as legacyRemove } from "../apps/data-pipeline/src/details/detail-fields.ts";

test("final workspace has no legacy roots and isolates runtime state from source", () => {
  for (const old of [
    "fe",
    "step-1-data-crawl",
    "step-2-data-detail-crawl",
    "step-3-data-translation",
    "step-4-data-migrate",
  ])
    assert.equal(existsSync(join(repositoryRoot, old)), false, old);
  assert.equal(
    deeplKeyFile.pathname,
    join(repositoryRoot, "runtime/translation/deep-api-keys.ts"),
  );
  assert.equal(
    runtimeDirectory("catalog").replace(/\/$/, ""),
    join(repositoryRoot, "runtime/catalog"),
  );
  const workspace = readFileSync(
    join(repositoryRoot, "pnpm-workspace.yaml"),
    "utf8",
  );
  assert.doesNotMatch(workspace, /step-|\bfe\b/);
  assert.match(
    readFileSync(join(repositoryRoot, ".gitignore"), "utf8"),
    /^runtime\/$/m,
  );
});

test("business command routes retain working directories, state locations and CLI argument precedence", () => {
  for (const command of Object.values(commands)) {
    const invocation = commandInvocation(command, ["--limit", "3"]);
    assert.equal(
      invocation.cwd.replace(/\/$/, ""),
      join(repositoryRoot, "runtime", command.runtime),
    );
    assert.ok(
      existsSync(join(repositoryRoot, command.directory, command.script)),
    );
    assert.deepEqual(invocation.nodeArgs.slice(-2), ["--limit", "3"]);
  }
  const crawl = commandInvocation(commands["details:run"], ["--limit", "3"]);
  assert.equal(
    crawl.nodeArgs[1],
    join(repositoryRoot, "apps/data-pipeline/src/details/command/filtered.ts"),
  );
  assert.deepEqual(crawl.nodeArgs.slice(2), [
    "--limit",
    "100000",
    "--rate",
    "2",
    "--limit",
    "3",
  ]);
  assert.equal(
    commandInvocation(commands["publish:details"], []).nodeArgs[0],
    `--env-file-if-exists=${join(repositoryRoot, "runtime/catalog/.env")}`,
  );
  assert.equal(
    commandInvocation(commands["translation:run"], []).nodeArgs[0],
    `--env-file-if-exists=${join(repositoryRoot, "runtime/translation/.env")}`,
  );
});

test("CLI help and invalid commands never initialize business runtimes", () => {
  const env = {
    ...process.env,
    MONGODB_URI: "",
    SUPABASE_URL: "",
    SUPABASE_SECRET_KEY: "",
    REDIS_URL: "",
  };
  for (const args of [[], ["--help"]]) {
    const result = spawnSync(
      process.execPath,
      ["apps/data-pipeline/src/cli.ts", ...args],
      { cwd: repositoryRoot, env, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /catalog:import/);
    assert.match(result.stdout, /尚无持久断点/);
  }
  const result = spawnSync(
    process.execPath,
    ["apps/data-pipeline/src/cli.ts", "unknown"],
    { cwd: repositoryRoot, env, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /未知命令/);
  for (const name of Object.keys(commands)) {
    const help = spawnSync(
      process.execPath,
      ["apps/data-pipeline/src/cli.ts", name, "--help"],
      { cwd: repositoryRoot, env, encoding: "utf8" },
    );
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /帮助不会执行业务操作/);
  }
});

test("publication CLI rejects invalid parameters before opening database connections", () => {
  for (const [args, message] of [
    [["run", "--job", "invalid", "--limit", "0"], /positive integer/],
    [["plan:details", "--limit", "1"], /not supported/],
    [["run"], /require --job/],
    [["status", "--job", "invalid", "--limit", "1"], /only supported/],
  ] as const) {
    const result = spawnSync(
      process.execPath,
      ["apps/data-pipeline/src/publish/command.ts", ...args],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        timeout: 5000,
        env: { ...process.env, MONGODB_URI: "", SUPABASE_DB_URL: "" },
      },
    );
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, message);
    assert.doesNotMatch(result.stderr, /MONGODB_URI missing/);
  }
});

test("child errors retain their nonzero exit code", async () => {
  const code = await runCommand(
    {
      directory: ".",
      script: "test/fixtures/exit-code.ts",
      args: [],
      description: "offline fixture",
    },
    ["7"],
  );
  assert.equal(code, 7);
});

test("catalog self-checks remain offline under the workspace", () => {
  for (const name of [
    "catalog:refresh",
    "catalog:bootstrap",
    "catalog:publish",
  ] as const) {
    const invocation = commandInvocation(
      { ...commands[name], args: ["self-test"] },
      [],
    );
    const result = spawnSync(process.execPath, invocation.nodeArgs, {
      cwd: invocation.cwd,
      encoding: "utf8",
      timeout: 10000,
      env: {
        ...process.env,
        MONGODB_URI: "mongodb://127.0.0.1:1/offline",
        SUPABASE_URL: "https://self-test.invalid",
        SUPABASE_SECRET_KEY: "offline-test-key",
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /self-test passed/);
  }
});

test("shared MongoDB parsing preserves crawler collection and constructs without connecting", async () => {
  const parsed = parseMongoConnection(
    "mongodb://localhost:27017/grocery/data_completion?directConnection=true",
  );
  assert.equal(parsed.database, "grocery");
  assert.equal(parsed.collectionName, "data_completion");
  assert.equal(new URL(parsed.uri).pathname, "/grocery");
  assert.equal(
    new URL(parsed.uri).searchParams.get("directConnection"),
    "true",
  );
  const { client, db } = createDatabaseConnection(parsed.uri);
  assert.equal(db.databaseName, "grocery");
  await client.close();
  assert.throws(
    () => parseMongoConnection("mongodb://localhost:27017"),
    /database name/,
  );
});

test("legacy cleaning exports are the canonical functions, not copied implementations", () => {
  assert.equal(legacyRemove, removeUnusedDetailFields);
  const row = {
    productId: 4,
    source: "new-world",
    detail: { name: "Milk" },
    attempts: [],
    at: new Date(),
    product_name: "Milk",
    brand: "Anchor",
  };
  assert.deepEqual(cleanDocument(row), {
    source: "new-world",
    detail: { name: "Milk" },
  });
  assert.equal(readLimit(["--limit", "4"]), 4);
});

test("database-writing and API-calling commands are never cached by Turbo", () => {
  const config = JSON.parse(
    readFileSync(join(repositoryRoot, "turbo.json"), "utf8"),
  );
  for (const directory of new Set(
    Object.values(commands).map((command) => command.directory),
  )) {
    const pkg = JSON.parse(
      readFileSync(join(repositoryRoot, directory, "package.json"), "utf8"),
    );
    for (const script of Object.keys(pkg.scripts)) {
      if (
        [
          "test",
          "test:workspace",
          "typecheck",
          "format",
          "format:check",
        ].includes(script)
      )
        continue;
      assert.equal(
        config.tasks[script]?.cache,
        false,
        `side-effectful task ${script} must not be cached`,
      );
    }
  }
});
