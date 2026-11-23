import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { fileURLToPath } from "node:url";

/** `--mode ags` (npm run build:ags): every phase analysis reads its *_ags.json twin (the historian's lines a-e), made by
 * the analysis scripts with PHASE_SET=ags. The default build uses the OKH 22 III 41 lines. */
const agsData: Plugin = {
  name: "ags-data",
  enforce: "pre",
  resolveId(id) {
    const m = /^\.\/(phase_(?:clusters|distributions|checkpoints|profiles))\.json$/.exec(id);
    return m ? fileURLToPath(new URL(`./src/data/${m[1]}_ags.json`, import.meta.url)) : null;
  },
};

export default defineConfig(({ mode }) => ({
  plugins: [...(mode === "ags" ? [agsData] : []), react(), tailwindcss(), viteSingleFile()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: { assetsInlineLimit: Number.MAX_SAFE_INTEGER, chunkSizeWarningLimit: 20000 },
}));
