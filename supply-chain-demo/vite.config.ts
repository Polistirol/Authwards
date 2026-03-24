import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.join(__dirname, ".."), "");
  const backendUrl =
    env.BACKEND_URL ?? env.VITE_BACKEND_URL ?? "http://localhost:3000";
  const dashboardUrl = env.VITE_DASHBOARD_URL ?? "";
  const frontendUrl = (env.FRONTEND_URL ?? env.VITE_FRONTEND_URL ?? env.VITE_DASHBOARD_URL ?? "").trim();

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5175,
      fs: {
        allow: [path.join(__dirname, "..")],
      },
    },
    define: {
      "import.meta.env.VITE_BACKEND_URL": JSON.stringify(backendUrl),
      "import.meta.env.VITE_DASHBOARD_URL": JSON.stringify(dashboardUrl.trim()),
      "import.meta.env.VITE_FRONTEND_URL": JSON.stringify(frontendUrl),
    },
  };
});
