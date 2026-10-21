import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// `npm run build`         -> normal build in dist/ (for GitHub Pages)
// `npm run build:single`  -> everything inlined into one index.html (for sharing a single file)
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: mode === "single" ? [react(), viteSingleFile()] : [react()],
  build: { outDir: mode === "single" ? "dist-single" : "dist" },
}));
