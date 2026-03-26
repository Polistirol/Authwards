import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

import { traceflowViteApiMiddleware } from "./server/traceflow-vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** npm workspaces hoist deps to the repo root; Netlify also installs from root. */
function resolveHoistedPackage(pkg: string): string {
  const local = path.join(__dirname, "node_modules", pkg);
  if (fs.existsSync(local)) return local;
  return path.join(__dirname, "..", "node_modules", pkg);
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.join(__dirname, ".."), "");
  const backendUrl =
    env.BACKEND_URL ?? env.VITE_BACKEND_URL ?? "http://localhost:3000";
  const dashboardUrl = env.VITE_DASHBOARD_URL ?? "";
  const frontendUrl = (env.FRONTEND_URL ?? env.VITE_FRONTEND_URL ?? env.VITE_DASHBOARD_URL ?? "").trim();

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "traceflow-api",
        configureServer(server) {
          server.middlewares.use(traceflowViteApiMiddleware());
        },
      },
    ],
    resolve: {
      dedupe: ["react", "react-dom"],
      alias: {
        react: resolveHoistedPackage("react"),
        "react-dom": resolveHoistedPackage("react-dom"),
      },
    },
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
