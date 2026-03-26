import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { ConnectButton, useAgent } from "../../../sdk";
import { findAgentForShipment } from "../lib/agents";
import { fetchShipments } from "../lib/shipmentsApi";
import type { Shipment } from "../lib/shipmentsApi";
import { ShipmentCard } from "../components/ShipmentCard";
import { TraceFlowFooter, TraceFlowHeader, TraceFlowShell } from "../components/TraceFlowLayout";

export function Shipments() {
  const { agents } = useAgent();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const refreshShipments = async (): Promise<void> => {
    try {
      const list = await fetchShipments();
      setShipments(list);
      setLoadErr(null);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Failed to load");
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const list = await fetchShipments();
        if (!cancelled) {
          setShipments(list);
          setLoadErr(null);
        }
      } catch (e) {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : "Failed to load");
      }
    }

    void load();
    const id = window.setInterval(() => void load(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <TraceFlowShell>
      <TraceFlowHeader
        right={
          <ConnectButton
            theme="light"
            frontendUrl={import.meta.env.VITE_FRONTEND_URL || undefined}
          />
        }
      />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold text-sky-950">Your Shipments</h1>
        <p className="mt-2 text-sky-800/80">
          Sample supply chain demo data.{" "}
          <Link className="font-medium text-sky-600 underline decoration-sky-300 hover:text-sky-700" to="/">
            Home
          </Link>
        </p>

        {loadErr ? <p className="mt-6 text-red-600">{loadErr}</p> : null}

        <div className="mt-8 flex flex-col gap-6">
          {shipments.map((s) => (
            <ShipmentCard
              key={s.id}
              shipment={s}
              agent={findAgentForShipment(agents, s.id)}
              onAfterDemoStatusChange={refreshShipments}
            />
          ))}
        </div>
      </main>
      <TraceFlowFooter />
    </TraceFlowShell>
  );
}
