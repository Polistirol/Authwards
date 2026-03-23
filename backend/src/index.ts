import "./envBootstrap.js";

import cors from "cors";
import express from "express";
import passport from "passport";

import { getAllowedFrontendOrigins } from "./allowedFrontendOrigins.js";
import { ensureDbFile } from "./services/db.js";
import { initMasterWallet, logMasterWalletStatus } from "./services/masterWallet.js";
import { configureGoogleAuth } from "./routes/auth.js";
import authRouter from "./routes/auth.js";
import agentRouter from "./routes/agent.js";
import didRouter from "./routes/did.js";
import walletRouter from "./routes/wallet.js";
import adminRouter from "./routes/admin.js";
import bridgeRouter from "./routes/bridge.js";
import { requestLogMiddleware } from "./requestLog.js";

const app = express();
const PORT = 3000;

function corsOriginOption():
  | boolean
  | ((origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => void) {
  const list = getAllowedFrontendOrigins();
  if (list.length === 0) return true;

  return (origin, cb) => {
    if (!origin) return cb(null, true);
    cb(null, list.includes(origin));
  };
}

app.use(
  cors({
    origin: corsOriginOption(),
    credentials: true,
  }),
);
app.use(express.json());
app.use(passport.initialize());

app.use(requestLogMiddleware);

configureGoogleAuth();

app.use("/auth", authRouter);
app.use("/agent", agentRouter);
app.use("/did", didRouter);
app.use("/wallet", walletRouter);
app.use("/admin", adminRouter);
app.use("/bridge", bridgeRouter);

app.use((req, res) => {
  res.status(404).json({ error: "Non trovato" });
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const msg = err instanceof Error ? err.message : "Errore server";
  console.error(err);
  res.status(500).json({ error: msg });
});

async function main() {
  await ensureDbFile();
  initMasterWallet();
  await logMasterWalletStatus();
  app.listen(PORT, () => {
    console.log(`Backend in ascolto su http://localhost:${PORT}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
