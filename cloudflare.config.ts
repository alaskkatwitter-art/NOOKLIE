import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: process.env.NOOKLIE_CLOUDFLARE_PRODUCTION === "1" ? "nooklie" : "nooklie-preview",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-11-08",
    compatibilityFlags: ["nodejs_compat"],
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      NEXT_PUBLIC_SUPABASE_URL: bindings.secret(),
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: bindings.secret(),
      SUPABASE_SECRET_KEY: bindings.secret(),
      CHAT_ENCRYPTION_KEY: bindings.secret(),
      CHAT_ENCRYPTION_KEY_V2: bindings.secret(),
    },
  }),
});
