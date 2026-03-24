import { useState } from "react";
import { useNavigate } from "react-router-dom";

import type { Agent } from "../../../sdk";
import { truncateDid } from "../lib/format";
import type { Shipment } from "../lib/shipmentsApi";
import { AgentStatusCard } from "./AgentStatusCard";
import { AgentSetup } from "./AgentSetup";

function shipmentStatusBadge(status: string): { cls: string; label: string } {
  switch (status) {
    case "in_transit":
      return {
        cls: "border-amber-500/60 bg-amber-500/15 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.25)]",
        label: "In Transito",
      };
    case "delivered":
      return {
        cls: "border-emerald-500/50 bg-emerald-500/15 text-emerald-200",
        label: "Consegnata",
      };
    case "payment_released":
      return {
        cls: "border-blue-500/50 bg-blue-500/15 text-blue-200",
        label: "Pagamento Rilasciato",
      };
    default:
      return {
        cls: "border-slate-500/50 bg-slate-500/10 text-slate-300",
        label: status,
      };
  }
}

export type ShipmentCardProps = {
  shipment: Shipment;
  agent?: Agent;
};

export function ShipmentCard({ shipment, agent }: ShipmentCardProps) {
  const navigate = useNavigate();
  const [setupOpen, setSetupOpen] = useState(false);
  const badge = shipmentStatusBadge(shipment.status);
  const showCreaButton = shipment.status === "in_transit" && !agent;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navigate(`/shipment/${encodeURIComponent(shipment.id)}`);
          }
        }}
        onClick={() => navigate(`/shipment/${encodeURIComponent(shipment.id)}`)}
        className="group w-full cursor-pointer rounded-2xl border border-slate-600/80 bg-[#1e293b] p-5 text-left shadow-lg transition hover:border-amber-500/40 hover:shadow-amber-500/5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-white group-hover:text-amber-100">
            {shipment.product}
          </h3>
          <span
            className={`inline-flex shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${badge.cls}`}
          >
            {badge.label}
          </span>
        </div>
        <p className="mt-3 text-sm text-slate-400">
          <span className="text-slate-300">{shipment.origin}</span>
          <span className="mx-2 text-amber-500">→</span>
          <span className="text-slate-300">{shipment.destination}</span>
        </p>
        <p className="mt-3 text-sm text-slate-400">
          Importo: <span className="font-medium text-white">{shipment.paymentAmount} IOTA</span>
        </p>
        <p className="mt-1 text-sm text-slate-400">
          Fornitore:{" "}
          <span className="font-mono text-xs text-slate-300">{truncateDid(shipment.supplier)}</span>
        </p>

        {showCreaButton ? (
          <div className="mt-4" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setSetupOpen(true)}
              className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-200 hover:bg-amber-500/20"
            >
              Crea Agente di Pagamento
            </button>
          </div>
        ) : null}

        {agent ? (
          <div onClick={(e) => e.stopPropagation()}>
            <AgentStatusCard agent={agent} />
          </div>
        ) : null}
      </div>

      {shipment.status === "in_transit" && setupOpen ? (
        <AgentSetup shipment={shipment} open={setupOpen} onClose={() => setSetupOpen(false)} />
      ) : null}
    </>
  );
}
