import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import type { Agent, AgentStatus } from "../../../sdk";
import { ConnectButton, useAgent, useAuthwards } from "../../../sdk";
import { findAgentForShipment } from "../lib/agents";
import { explorerTxUrl } from "../lib/explorer";
import { truncateDid } from "../lib/format";
import {
  fetchShipmentById,
  patchShipmentStatus,
  type Shipment,
} from "../lib/shipmentsApi";
import { TraceFlowFooter, TraceFlowHeader, TraceFlowShell } from "../components/TraceFlowLayout";
import { VerifyPayment } from "../components/VerifyPayment";

function effectiveAgentStatus(agent: Agent): AgentStatus {
  if (agent.status === "pending_activation") return "created";
  if (agent.status) return agent.status;
  if (agent.active === false) return "revoked";
  if (agent.active === true) return "active";
  return "created";
}

function formatShipmentStatus(status: string): string {
  switch (status) {
    case "in_transit":
      return "In transit";
    case "delivered":
      return "Delivered — awaiting payment";
    case "payment_released":
      return "Payment released";
    default:
      return status;
  }
}

/** Select value: completed maps to API payment_released */
function statusToSelectValue(status: string): string {
  if (status === "payment_released") return "completed";
  return status;
}

type TimelineEv = { title: string; time: string; extra?: string };

function buildTimeline(shipment: Shipment, agent: Agent | undefined): TimelineEv[] {
  const ev: TimelineEv[] = [];

  if (shipment.status === "in_transit") {
    ev.push({ title: "Shipment created", time: shipment.createdAt });
    if (agent) {
      ev.push({
        title: `Agent identity created: ${truncateDid(agent.agentDid, 24, 12)}`,
        time: agent.createdAt,
        extra: agent.agentDid,
      });
      if (effectiveAgentStatus(agent) === "active" && agent.activatedAt) {
        ev.push({ title: "Agent activated", time: agent.activatedAt });
      }
    }
    return ev;
  }

  ev.push({ title: "Shipment created", time: shipment.createdAt });
  if (agent) {
    ev.push({
      title: `Agent identity created: ${truncateDid(agent.agentDid, 24, 12)}`,
      time: agent.createdAt,
      extra: agent.agentDid,
    });
    if (effectiveAgentStatus(agent) === "active" && agent.activatedAt) {
      ev.push({ title: "Agent activated", time: agent.activatedAt });
    }
  }

  if (shipment.status === "delivered" || shipment.status === "payment_released") {
    const t = shipment.deliveredAt ?? shipment.updatedAt;
    ev.push({ title: "Delivered — awaiting payment", time: t });
  }

  if (shipment.status === "payment_released") {
    const h = shipment.txHash;
    ev.push({
      title: h ? `Payment released: ${truncateDid(h, 14, 12)}` : "Payment released",
      time: shipment.updatedAt,
      extra: h ?? undefined,
    });
  }

  return ev;
}

export function ShipmentDetail() {
  const { id: rawId } = useParams();
  const id = rawId ? decodeURIComponent(rawId) : "";
  const { user } = useAuthwards();
  const { agents, refreshAgents } = useAgent();
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoStatusBusy, setDemoStatusBusy] = useState(false);

  const agent = useMemo(
    () => (id ? findAgentForShipment(agents, id) : undefined),
    [agents, id],
  );

  const load = useCallback(async () => {
    if (!id) return;
    setBusy(true);
    setErr(null);
    try {
      const s = await fetchShipmentById(id);
      setShipment(s);
      await refreshAgents();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }, [id, refreshAgents]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Poll TraceFlow while awaiting payment (delivered only). */
  useEffect(() => {
    if (!id || shipment?.status !== "delivered") return;
    const interval = window.setInterval(() => void load(), 5_000);
    return () => window.clearInterval(interval);
  }, [id, load, shipment?.status]);

  async function handleDemoDeliver(): Promise<void> {
    if (!id) return;
    setDemoBusy(true);
    try {
      const s = await patchShipmentStatus(id, "delivered");
      setShipment(s);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setDemoBusy(false);
    }
  }

  async function handleDemoStatusChange(next: string): Promise<void> {
    if (!id) return;
    setDemoStatusBusy(true);
    try {
      const apiStatus = next === "completed" ? "payment_released" : next;
      const s = await patchShipmentStatus(id, apiStatus, undefined, { demo: true });
      setShipment(s);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setDemoStatusBusy(false);
    }
  }

  const timeline = useMemo(
    () => (shipment ? buildTimeline(shipment, agent) : []),
    [shipment, agent],
  );

  /** Full pipeline: payment released and on-chain tx recorded — required for VerifyPayment. */
  const verificationComplete =
    shipment?.status === "payment_released" && Boolean(shipment.txHash?.trim());

  if (!id) {
    return (
      <TraceFlowShell>
        <TraceFlowHeader />
        <main className="p-8 text-sky-700">Invalid shipment.</main>
      </TraceFlowShell>
    );
  }

  return (
    <TraceFlowShell>
      <TraceFlowHeader
        right={
          <div className="flex items-center gap-2">
            <Link
              to="/shipments"
              className="rounded-lg border border-sky-200 bg-white/80 px-3 py-1.5 text-sm text-sky-800 shadow-sm hover:bg-sky-50"
            >
              ← List
            </Link>
            <ConnectButton
              theme="light"
              frontendUrl={import.meta.env.VITE_FRONTEND_URL || undefined}
            />
          </div>
        }
      />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        {err ? <p className="text-red-600">{err}</p> : null}
        {busy && !shipment ? <p className="text-sky-700/80">Loading…</p> : null}

        {shipment ? (
          <>
            <h1 className="text-2xl font-bold text-sky-950">{shipment.product}</h1>
            <p className="mt-2 text-sky-800/85">
              {shipment.origin} <span className="text-sky-500">→</span> {shipment.destination}
            </p>
            <dl className="mt-6 grid gap-3 rounded-2xl border border-sky-200/90 bg-white/95 p-5 text-sm shadow-md shadow-sky-100/50">
              <div className="flex justify-between gap-4">
                <dt className="text-sky-700/80">ID</dt>
                <dd className="font-mono text-sky-950">{shipment.id}</dd>
              </div>
              {shipment.trackingNumber ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-sky-700/80">Tracking</dt>
                  <dd className="font-mono text-sky-950">{shipment.trackingNumber}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-4">
                <dt className="text-sky-700/80">Status</dt>
                <dd
                  className={
                    shipment.status === "delivered"
                      ? "font-medium text-sky-700"
                      : "text-sky-950"
                  }
                >
                  {formatShipmentStatus(shipment.status)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-sky-700/80">Payment</dt>
                <dd className="text-sky-950">{shipment.paymentAmount} IOTA</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-sky-700/80">Supplier DID</dt>
                <dd className="break-all font-mono text-xs text-sky-900/90">{shipment.supplierDid}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-sky-700/80">Recipient DID</dt>
                <dd className="break-all font-mono text-xs text-sky-900/90">{shipment.recipientDid}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-sky-700/80">Supplier wallet</dt>
                <dd className="break-all font-mono text-xs text-sky-900/90">{shipment.supplierAddress}</dd>
              </div>
              {verificationComplete ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-sky-700/80">Payment tx</dt>
                  <dd className="break-all font-mono text-xs text-sky-900/90">{shipment.txHash}</dd>
                </div>
              ) : null}
            </dl>

            <div className="mt-6 flex flex-col items-center gap-2 rounded-2xl border border-sky-200/90 bg-white/95 p-4 text-center shadow-md shadow-sky-100/50">
              <label htmlFor="demo-status-detail" className="text-xs font-medium text-sky-700/80">
                Status demo
              </label>
              <select
                id="demo-status-detail"
                value={statusToSelectValue(shipment.status)}
                disabled={demoStatusBusy}
                onChange={(e) => void handleDemoStatusChange(e.target.value)}
                className="tf-demo-select w-full max-w-[11rem] rounded-lg border border-sky-200 bg-white px-3 py-2 text-center text-sm text-sky-950 shadow-inner shadow-sky-100 [text-align-last:center] outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200 disabled:opacity-50"
              >
                <option value="in_transit">in_transit</option>
                <option value="delivered">delivered</option>
                <option value="completed">completed</option>
              </select>
            </div>

            {verificationComplete ? (
              <section className="mt-6 rounded-2xl border border-sky-200/90 bg-white/95 p-5 text-sm shadow-md shadow-sky-100/50">
                <h2 className="text-base font-semibold text-sky-950">Payment verification</h2>
                <p className="mt-3 break-all font-mono text-xs text-sky-900/90">
                  <span className="text-sky-700/80">Transaction: </span>
                  {shipment.txHash}{" "}
                  <a
                    href={explorerTxUrl(shipment.txHash!)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-sans font-medium text-sky-600 underline decoration-sky-300 hover:text-sky-800"
                  >
                    ↗
                  </a>
                </p>
                <div className="mt-4">
                  <VerifyPayment
                    txHash={shipment.txHash!}
                    expectedReceiverDid={user?.did ?? shipment.recipientDid}
                  />
                </div>
              </section>
            ) : null}

            <div className="mt-10">
              <h2 className="text-lg font-semibold text-sky-950">Timeline</h2>
              <ul className="relative mt-4 space-y-0 border-l-2 border-sky-300 pl-6">
                {timeline.map((ev, i) => (
                  <li key={`${ev.title}-${ev.time}-${i}`} className="relative pb-8 last:pb-0">
                    <span className="absolute -left-[31px] top-1.5 h-3 w-3 rounded-full border-2 border-sky-500 bg-sky-50" />
                    <p className="font-medium text-sky-900">{ev.title}</p>
                    {ev.time ? (
                      <p className="mt-1 text-xs text-sky-700/75">{ev.time}</p>
                    ) : null}
                    {ev.extra && ev.title.startsWith("Payment released") ? (
                      <a
                        href={explorerTxUrl(ev.extra)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block text-sm font-medium text-sky-600 underline decoration-sky-300 hover:text-sky-800"
                      >
                        Verify on-chain
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-10 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void load()}
                disabled={busy}
                className="rounded-xl border border-sky-200 bg-white px-5 py-2 text-sm font-medium text-sky-800 shadow-sm hover:bg-sky-50 disabled:opacity-50"
              >
                Refresh
              </button>
            </div>

            {shipment.status === "in_transit" ? (
              <div className="mt-16 border-t border-sky-200 pt-8 text-center">
                <button
                  type="button"
                  disabled={demoBusy}
                  onClick={() => void handleDemoDeliver()}
                  className="text-sm font-medium text-sky-600 underline decoration-sky-300 underline-offset-4 hover:text-sky-800 disabled:opacity-50"
                >
                  ⚡ Simulate delivery — demo only
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </main>
      <TraceFlowFooter />
    </TraceFlowShell>
  );
}
