import { useCallback, useEffect, useMemo, useState } from "react";
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

  const load = useCallback(async (): Promise<void> => {
    try {
      const list = await fetchShipments();
      setShipments(list);
      setLoadErr(null);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const hasDeliveredAwaitingPayment = useMemo(
    () => shipments.some((s) => s.status === "delivered"),
    [shipments],
  );

  /** Poll only while at least one shipment is delivered (awaiting payment). */
  useEffect(() => {
    if (!hasDeliveredAwaitingPayment) return;
    const id = window.setInterval(() => void load(), 5_000);
    return () => window.clearInterval(id);
  }, [hasDeliveredAwaitingPayment, load]);

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
            <ShipmentCard key={s.id} shipment={s} agent={findAgentForShipment(agents, s.id)} />
          ))}
        </div>
      </main>
      <TraceFlowFooter />
    </TraceFlowShell>
  );
}
