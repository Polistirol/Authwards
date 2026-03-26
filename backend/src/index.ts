import "./envBootstrap.js";

import fs from "node:fs";

import cors from "cors";
import express from "express";
import passport from "passport";

import { isOriginAllowedForCors } from "./allowedFrontendOrigins.js";
import { ensureDbFile } from "./services/db.js";
import { initMasterWallet, logMasterWalletStatus } from "./services/masterWallet.js";
import { configureOAuthStrategies } from "./routes/auth.js";
import authRouter from "./routes/auth.js";
import agentRouter from "./routes/agent.js";
import didRouter from "./routes/did.js";
import walletRouter from "./routes/wallet.js";
import adminRouter from "./routes/admin.js";
import bridgeRouter from "./routes/bridge.js";
import { requestLogMiddleware } from "./requestLog.js";
import { DB_INIT_PATH, DB_PATH } from "./paths.js";

const app = express();
const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);

function corsOriginOption():
  | boolean
  | ((origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => void) {
  return (origin, cb) => {
    if (!origin) return cb(null, true);
    cb(null, isOriginAllowedForCors(origin));
  };
}

app.use(
  cors({
    origin: corsOriginOption(),
    credentials: true,
  }),
);
app.use(express.json({ limit: "5mb" }));
app.use(passport.initialize());

app.use(requestLogMiddleware);

configureOAuthStrategies();

app.use("/auth", authRouter);
app.use("/agent", agentRouter);
app.use("/did", didRouter);
app.use("/wallet", walletRouter);
app.use("/admin", adminRouter);
app.use("/bridge", bridgeRouter);

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const msg = err instanceof Error ? err.message : "Server error";
  console.error(err);
  res.status(500).json({ error: msg });
});

async function main() {
  await ensureDbFile();
  console.log(
    `[db] DB_PATH=${DB_PATH} | init=${DB_INIT_PATH} (${fs.existsSync(DB_INIT_PATH) ? "found" : "MISSING — will use empty DB on first run"})`,
  );
  initMasterWallet();
  await logMasterWalletStatus();
  app.listen(PORT, () => {
    console.log(`Backend listening at http://localhost:${PORT}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
