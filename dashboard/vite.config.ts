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
    /** SDK lives outside `node_modules`; without this, Vite can bundle two Reacts → hooks crash (useState on null). */
    resolve: {
      dedupe: ["react", "react-dom"],
      alias: {
        react: path.resolve(__dirname, "node_modules/react"),
        "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
      },
    },
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
