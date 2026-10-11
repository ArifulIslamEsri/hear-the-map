import { defineConfig } from "vite";

// Relative base so the build works on GitHub Pages at /<repo>/ and anywhere else.
export default defineConfig({
  base: "./",
  build: { target: "es2022", chunkSizeWarningLimit: 4000 }
});
