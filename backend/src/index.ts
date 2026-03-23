import "./envBootstrap.js";

import cors from "cors";
import express from "express";
import passport from "passport";

import { getAllowedFrontendOrigins } from "./allowedFrontendOrigins.js";
import { ensureDbFile } from "./services/db.js";
import { configureGoogleAuth } from "./routes/auth.js";
import authRouter from "./routes/auth.js";
import agentRouter from "./routes/agent.js";
import didRouter from "./routes/did.js";

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

app.use((req, res, next) => {
  res.on("finish", () => {
    console.log(`${req.method} ${req.path} ${res.statusCode}`);
  });
  next();
});

configureGoogleAuth();

app.use("/auth", authRouter);
app.use("/agent", agentRouter);
app.use("/did", didRouter);

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
  app.listen(PORT, () => {
    console.log(`Backend in ascolto su http://localhost:${PORT}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
