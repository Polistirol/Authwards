import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.join(__dirname, ".."), "");
  const backendUrl =
    env.BACKEND_URL ?? env.VITE_BACKEND_URL ?? "http://localhost:3000";

  return {
    plugins: [react(), tailwindcss()],
    server: {
      fs: {
        allow: [path.join(__dirname, "..")],
      },
    },
    define: {
      "import.meta.env.VITE_BACKEND_URL": JSON.stringify(backendUrl),
    },
  };
});
