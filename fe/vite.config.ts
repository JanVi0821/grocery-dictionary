import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import svgr from "vite-plugin-svgr";
import { responseStoreServiceBinding } from "./cloudflare.config.ts";
import { responseStoreAdapter } from "@vinext/cloudflare/cache/response-store-adapter";

export default defineConfig(({ command, isPreview }) => {
  const useCloudflare = command === "build" || isPreview;

  return {
    server: {
      port: 3000,
    },
    optimizeDeps: {
      exclude: ["lucide-react", "next-intl"],
    },
    build: {
      rolldownOptions: {
        external: ["cloudflare:workers"],
      },
    },
    plugins: [
      tailwindcss(),
      svgr(),
      vinext(useCloudflare ? { cache: responseStoreAdapter() } : undefined),
      ...(useCloudflare
        ? [
            cloudflare({
              auxiliaryWorkers: [{ config: responseStoreServiceBinding }],
              viteEnvironment: {
                name: "rsc",
                childEnvironments: ["ssr"],
              },
            }),
          ]
        : []),
    ],
  };
});
