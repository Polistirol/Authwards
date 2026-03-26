import { useState } from "react";

import type { Agent } from "../../../sdk";
import { explorerTxUrl } from "../lib/explorer";
import { truncateDid } from "../lib/format";
import { patchShipmentStatus } from "../lib/shipmentsApi";
import type { Shipment } from "../lib/shipmentsApi";
import { AgentStatusCard } from "./AgentStatusCard";

function shipmentStatusBadge(status: string): { cls: string; label: string } {
  switch (status) {
    case "in_transit":
      return {
        cls: "border-amber-300 bg-amber-100 text-amber-950 shadow-sm shadow-amber-200/50",
        label: "In Transit",
      };
    case "delivered":
      return {
        cls: "border-sky-400/60 bg-sky-200/70 text-sky-950 shadow-sm shadow-sky-300/40",
        label: "Delivered — awaiting payment",
      };
    case "payment_released":
      return {
        cls: "border-cyan-300 bg-cyan-100 text-cyan-950 shadow-sm shadow-cyan-200/50",
        label: "Payment released",
      };
    default:
      return {
        cls: "border-slate-200 bg-slate-100 text-slate-700",
        label: status,
      };
  }
}

export type ShipmentCardProps = {
  shipment: Shipment;
  agent?: Agent;
  onAfterDemoStatusChange?: () => void | Promise<void>;
};

/** Select value: completed maps to API payment_released */
function statusToSelectValue(status: string): string {
  if (status === "payment_released") return "completed";
  return status;
}

export function ShipmentCard({ shipment, agent, onAfterDemoStatusChange }: ShipmentCardProps) {
  const [demoBusy, setDemoBusy] = useState(false);
  const badge = shipmentStatusBadge(shipment.status);
  const selectValue = statusToSelectValue(shipment.status);

  async function handleDemoStatusChange(next: string): Promise<void> {
    const apiStatus = next === "completed" ? "payment_released" : next;
    setDemoBusy(true);
    try {
      await patchShipmentStatus(shipment.id, apiStatus, undefined, { demo: true });
      await onAfterDemoStatusChange?.();
    } catch {
      /* parent polling / refresh will reconcile; optional: toast */
    } finally {
      setDemoBusy(false);
    }
  }

  return (
    <div className="flex w-full flex-col rounded-2xl border border-sky-200/90 bg-white/95 p-5 text-left shadow-lg shadow-sky-100/80">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold text-sky-950">{shipment.product}</h3>
          {shipment.trackingNumber ? (
            <p className="mt-1 font-mono text-xs text-sky-700/70">
              Tracking <span className="text-sky-900/90">{shipment.trackingNumber}</span>
            </p>
          ) : null}
          <p className="mt-3 text-sm text-sky-800/85">
            <span className="text-sky-900">{shipment.origin}</span>
            <span className="mx-2 text-sky-500">→</span>
            <span className="text-sky-900">{shipment.destination}</span>
          </p>
          <p className="mt-3 text-sm text-sky-800/85">
            Payment amount: <span className="font-medium text-sky-950">{shipment.paymentAmount} IOTA</span>
          </p>
          <p className="mt-1 text-sm text-sky-800/85">
            Supplier DID{" "}
            <span className="font-mono text-xs text-sky-900/90">{truncateDid(shipment.supplierDid)}</span>
          </p>
          <p className="mt-1 text-sm text-sky-800/85">
            Supplier wallet{" "}
            <span className="break-all font-mono text-xs text-sky-900/90">{shipment.supplierAddress}</span>
          </p>
        </div>

        <div className="flex shrink-0 justify-end sm:pt-0">
          <span
            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${badge.cls}`}
          >
            {badge.label}
          </span>
        </div>
      </div>

      {shipment.status === "payment_released" && shipment.txHash ? (
        <p className="mt-4 text-sm">
          <a
            href={explorerTxUrl(shipment.txHash)}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-sky-600 underline decoration-sky-300 hover:text-sky-800"
          >
            View payment on explorer
          </a>
        </p>
      ) : null}

      {agent ? (
        <div className="mt-4">
          <AgentStatusCard agent={agent} />
        </div>
      ) : null}

      <div className="mt-4 flex flex-col items-center gap-2 border-t border-sky-200/80 pt-4">
        <label htmlFor={`demo-status-${shipment.id}`} className="text-xs font-medium text-sky-700/80">
          Status demo
        </label>
        <select
          id={`demo-status-${shipment.id}`}
          value={selectValue}
          disabled={demoBusy}
          onChange={(e) => void handleDemoStatusChange(e.target.value)}
          className="tf-demo-select w-full max-w-[11rem] rounded-lg border border-sky-200 bg-white px-3 py-2 text-center text-sm text-sky-950 shadow-inner shadow-sky-100 [text-align-last:center] outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200 disabled:opacity-50"
        >
          <option value="in_transit">in_transit</option>
          <option value="delivered">delivered</option>
          <option value="completed">completed</option>
        </select>
      </div>
    </div>
  );
}
