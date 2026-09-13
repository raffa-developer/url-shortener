import { defineConfig } from "tsup";

export default defineConfig({
  entry: { server: "src/server.ts", worker: "src/worker.ts" },
  format: ["esm"],
  platform: "node",
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  dts: false,
  noExternal: ["@url-shortener/shared"],
});
