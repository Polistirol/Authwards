import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Optional alias if you prefer `import … from "sdk"` over `../../sdk`
    alias: { sdk: path.resolve(__dirname, "..", "sdk") },
    dedupe: ["react", "react-dom"],
  },
  server: {
    port: 5174,
    fs: {
      allow: [__dirname, path.resolve(__dirname, "..")],
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom"],
  },
});
