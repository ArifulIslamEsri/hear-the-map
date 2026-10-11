import { defineConfig } from "vite";

// relative base so the build works from any path
export default defineConfig({
  base: "./",
  build: { target: "es2022", chunkSizeWarningLimit: 4000 }
});
