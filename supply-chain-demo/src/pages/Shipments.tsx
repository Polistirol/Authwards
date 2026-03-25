import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { ConnectButton, useAgent, useIotaAuth } from "../../../sdk";
import { findAgentForShipment } from "../lib/agents";
import { truncateDid } from "../lib/format";
import { fetchShipments } from "../lib/shipmentsApi";
import type { Shipment } from "../lib/shipmentsApi";
import { ShipmentCard } from "../components/ShipmentCard";
import { TraceFlowFooter, TraceFlowHeader, TraceFlowShell } from "../components/TraceFlowLayout";

export function Shipments() {
  const { user, token, backendUrl } = useIotaAuth();
  const { agents } = useAgent();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const jwt = token;
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const list = await fetchShipments(backendUrl, jwt);
        if (!cancelled) {
          setShipments(list);
          setLoadErr(null);
        }
      } catch (e) {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : "Failed to load");
      }
    }

    void load();
    const id = window.setInterval(() => void load(), 25_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [token, backendUrl]);

  return (
    <TraceFlowShell>
      <TraceFlowHeader
        right={
          <ConnectButton
            theme="dark"
            label="Sign in with Google"
            frontendUrl={import.meta.env.VITE_FRONTEND_URL || undefined}
          />
        }
      />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {user ? (
          <div className="mb-8 rounded-2xl border border-slate-600/80 bg-[#1e293b] p-5">
            <div className="flex flex-wrap items-center gap-3">
              <img
                src={user.picture ?? undefined}
                alt=""
                className="h-12 w-12 rounded-full border border-slate-600"
              />
              <div>
                <p className="font-medium text-white">{user.name}</p>
                <p className="font-mono text-xs text-slate-400">{truncateDid(user.did)}</p>
              </div>
              <span className="ml-auto inline-flex items-center rounded-full border border-blue-500/40 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-200">
                Verified via IOTA DID
              </span>
            </div>
          </div>
        ) : null}

        <h1 className="text-2xl font-bold text-white">Your Shipments</h1>
        <p className="mt-2 text-slate-400">
          Sample supply chain demo data.{" "}
          <Link className="text-amber-400 underline hover:text-amber-300" to="/">
            Home
          </Link>
        </p>

        {loadErr ? <p className="mt-6 text-red-400">{loadErr}</p> : null}

        <div className="mt-8 flex flex-col gap-6">
          {shipments.map((s) => (
            <ShipmentCard key={s.id} shipment={s} agent={findAgentForShipment(agents, s.id)} />
          ))}
        </div>
      </main>
      <TraceFlowFooter />
    </TraceFlowShell>
  );
}
