import { bindings, defineConfig, defineWorker } from "cf/config";
import { createWorkersResponseStoreServiceBindingConfig } from "@vinext/cloudflare/cache/config";

const responseStore = await createWorkersResponseStoreServiceBindingConfig({
  worker: {
    name: "grocery-dictionary-response-store",
    compatibilityDate: "2026-10-08",
    compatibilityFlags: ["nodejs_compat"],
  },
  bucket: "grocery-dictionary-response-cache-bodies",
});

export const responseStoreServiceBinding = responseStore.serviceBindingWorker;

export default defineConfig({
  worker: defineWorker({
    ...responseStore.applicationWorker,
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
      ...responseStore.applicationWorker.env,
      ASSETS: bindings.assets(),
      WORKER_SELF_REFERENCE: bindings.worker({
        worker: "grocery-dictionary",
      }),
    },
  }),
});
