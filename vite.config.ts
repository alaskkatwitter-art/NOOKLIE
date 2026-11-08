import { fileURLToPath } from 'node:url';
import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  resolve: {
    alias: [{
      find: /^sharp$/,
      replacement: fileURLToPath(new URL('./cloudflare/preview-sharp.ts', import.meta.url)),
    }],
  },
  plugins: [
    vinext(),
    cloudflare({
      inspectorPort: false,
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
