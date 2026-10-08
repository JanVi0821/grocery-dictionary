import { bindings, defineConfig, defineWorker } from "cf/config";
import { createWorkersResponseStoreSelfContainedConfig } from "@vinext/cloudflare/cache/config";

const responseStore = await createWorkersResponseStoreSelfContainedConfig({
  worker: "grocery-dictionary",
  bucket: "grocery-dictionary-response-cache-bodies",
});

export default defineConfig({
  worker: defineWorker({
    ...responseStore,
    name: "grocery-dictionary",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-10-08",
    compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
    assets: { notFoundHandling: "none" },
    observability: {
      enabled: false,
      issues: { enabled: true },
    },
    env: {
      ...responseStore.env,
      ASSETS: bindings.assets(),
      WORKER_SELF_REFERENCE: bindings.worker({
        worker: "grocery-dictionary",
      }),
    },
    exports: {
      ...responseStore.exports,
    },
  }),
});
