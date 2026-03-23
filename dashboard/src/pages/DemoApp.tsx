import { useState } from "react";

import { LoginModal, useIotaAuth } from "../sdk";

const CODE_SNIPPET = `import { IotaAuthProvider, useIotaAuth } from "@iota-auth/sdk";

function App() {
  return (
    <IotaAuthProvider backendUrl="http://localhost:3000">
      <MyDapp />
    </IotaAuthProvider>
  );
}

function MyDapp() {
  const { user, did, isAuthenticated, login, logout } = useIotaAuth();
  if (!isAuthenticated) return <button onClick={login}>Accedi</button>;
  return <p>Benvenuto, {user?.name} — {did}</p>;
}`;

export default function DemoApp() {
  const { user, did, isAuthenticated, loading } = useIotaAuth();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#1e293b] text-slate-100">
      <header className="border-b border-white/10 bg-[#0f172a]/80 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <span className="text-lg font-bold tracking-tight text-[#60a5fa]">
            IoTa Data Exchange
          </span>
          <span className="text-xs uppercase tracking-widest text-slate-500">
            demo dApp
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-14">
        {loading ? (
          <p className="text-slate-400">Caricamento…</p>
        ) : !isAuthenticated ? (
          <div className="rounded-2xl border border-white/10 bg-[#0f172a] p-10 text-center shadow-xl">
            <p className="text-lg text-slate-200">
              Per usare questa dApp, accedi con IOTA Auth
            </p>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="mt-8 rounded-xl bg-[#60a5fa] px-8 py-3 font-semibold text-[#0f172a] shadow-[0_0_24px_rgba(96,165,250,0.35)] transition hover:bg-[#93c5fd]"
            >
              Accedi con IOTA Auth
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="rounded-2xl border border-[#60a5fa]/30 bg-[#0f172a] p-8 shadow-lg">
              <p className="text-xl font-semibold text-white">
                Benvenuto! La tua identità:{" "}
                <code className="break-all text-base font-normal text-[#60a5fa]">
                  {did ?? ""}
                </code>
              </p>
              <p className="mt-4 leading-relaxed text-slate-400">
                Questa dApp è alimentata da IOTA Auth SDK. Lo sviluppatore ha
                integrato l&apos;autenticazione con poche righe di codice.
              </p>
            </div>

            <div>
              <p className="mb-3 text-sm font-medium text-slate-500">
                Integrazione tipica
              </p>
              <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/30 p-5 font-mono text-sm leading-relaxed text-slate-300">
                <code>{CODE_SNIPPET}</code>
              </pre>
            </div>

            {user ? (
              <p className="text-center text-sm text-slate-500">
                Sessione attiva come {user.email}
              </p>
            ) : null}
          </div>
        )}
      </main>

      <LoginModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
