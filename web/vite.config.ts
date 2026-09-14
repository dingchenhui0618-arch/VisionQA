import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Local Node-only agent lab: native SQLite must not enter Cloudflare or
  // browser dependency optimization. This switch is never used for builds.
  if (process.env.VISIONQA_AGENT_LOCAL === "true" && process.env.NODE_ENV !== "production") {
    const nodeOnlyDependencies = ["@mastra/core", "@mastra/libsql", "libsql", "@libsql/client", "zod"];
    return {
      plugins: [vinext()],
      server: { host: "localhost", port: 6300, strictPort: true, forwardConsole: false },
      optimizeDeps: { exclude: ["@mastra/core", "@mastra/libsql", "libsql"] },
      ssr: { external: nodeOnlyDependencies },
      // Vinext has separate RSC/SSR environments. Root ssr.external alone does
      // not stop the RSC runner from transforming native SDKs and all Zod locales.
      environments: {
        rsc: { resolve: { external: nodeOnlyDependencies } },
        ssr: { resolve: { external: nodeOnlyDependencies } },
      },
    };
  }
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
