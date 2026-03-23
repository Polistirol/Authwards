import type { ReactNode } from "react";

import type { Agent } from "../sdk";

type TrustChainProps = {
  userName: string;
  userDid: string;
  agents: Agent[];
};

function Node({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-[#6ee7b7]/35 bg-[#0f1118] px-4 py-3 text-center shadow-[0_0_0_1px_rgba(110,231,183,0.08)]">
      {children}
    </div>
  );
}

function Arrow({ label }: { label: string }) {
  return (
    <div
      className="relative flex min-w-[72px] flex-col items-center justify-center px-2"
      aria-hidden
    >
      <div className="h-px w-full bg-gradient-to-r from-[#6ee7b7]/20 via-[#6ee7b7]/60 to-[#6ee7b7]/20" />
      <span className="absolute top-1/2 -translate-y-1/2 rounded bg-[#0a0b0f] px-1.5 text-[10px] font-medium uppercase tracking-wide text-[#6ee7b7]/90">
        {label}
      </span>
      <span className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-0.5 text-[#6ee7b7]">
        ▶
      </span>
    </div>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n)}…`;
}

export default function TrustChain({
  userName,
  userDid,
  agents,
}: TrustChainProps) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
      <h2 className="text-lg font-semibold text-white">Trust chain</h2>
      <p className="mt-1 text-sm text-slate-500">
        Flusso di fiducia dalla tua identità Google alle transazioni delegate.
      </p>

      <div className="mt-8 overflow-x-auto pb-2">
        <div className="flex min-w-[640px] flex-col gap-10">
          <div className="flex items-stretch">
            <Node>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Google Account
              </p>
              <p className="mt-1 text-sm font-medium text-white">{userName}</p>
            </Node>
            <Arrow label="autentica" />
            <Node>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                DID utente
              </p>
              <p
                className="mt-1 max-w-[220px] break-all font-mono text-xs text-[#6ee7b7]"
                title={userDid}
              >
                {truncate(userDid, 42)}
              </p>
            </Node>
          </div>

          {agents.length === 0 ? (
            <p className="text-sm text-slate-500">
              Nessun agente: aggiungi un agente per vedere la delega nella catena.
            </p>
          ) : (
            <div className="flex flex-wrap items-start gap-x-4 gap-y-8 pl-0 md:pl-24">
              {agents.map((agent) => (
                <div
                  key={agent.agentDid}
                  className="flex flex-wrap items-center gap-2"
                >
                  <Arrow label="delega" />
                  <Node>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      DID agente
                    </p>
                    <p
                      className="mt-1 max-w-[200px] break-all font-mono text-xs text-[#e2e4ed]"
                      title={agent.agentDid}
                    >
                      {truncate(agent.agentDid, 36)}
                    </p>
                  </Node>
                  <Arrow label="esegue" />
                  <Node>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Transazione
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Operazioni on-chain autorizzate dal profilo permessi.
                    </p>
                  </Node>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
