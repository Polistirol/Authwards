import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";

import type { Agent, AgentLog, AgentStatus } from "../../../sdk";
import { ConnectButton, useAgent, useAuthwards } from "../../../sdk";
import { findAgentForShipment } from "../lib/agents";
import { explorerDidUrl, explorerObjectUrl, explorerTxUrl } from "../lib/explorer";
import { truncateDid } from "../lib/format";
import {
  fetchShipmentById,
  patchShipmentStatus,
  type Shipment,
} from "../lib/shipmentsApi";
import { TraceFlowFooter, TraceFlowHeader, TraceFlowShell } from "../components/TraceFlowLayout";

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

function findPaymentLog(logs: AgentLog[]): AgentLog | undefined {
  for (const log of logs) {
    const d = log.data as { meta?: { txHash?: string } } | undefined;
    const h = d?.meta?.txHash;
    if (typeof h === "string" && h) return log;
  }
  return undefined;
}

export function ShipmentDetail() {
  const { id: rawId } = useParams();
  const id = rawId ? decodeURIComponent(rawId) : "";
  const { user, token } = useAuthwards();
  const { agents, fetchAgentLogs, agentLogs, refreshAgents } = useAgent();
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);

  const agent = useMemo(
    () => (id ? findAgentForShipment(agents, id) : undefined),
    [agents, id],
  );

  const logs = id && agent ? agentLogs.get(agent.agentDid) ?? [] : [];

  const paymentLog = useMemo(() => findPaymentLog(logs), [logs]);
  const txHashFromLogs = paymentLog
    ? (paymentLog.data as { meta?: { txHash?: string } }).meta?.txHash
    : undefined;

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

  useEffect(() => {
    if (!id) return;
    const interval = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(interval);
  }, [id, load]);

  useEffect(() => {
    if (agent?.agentDid && token) {
      void fetchAgentLogs(agent.agentDid);
    }
  }, [agent?.agentDid, token, fetchAgentLogs]);

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

  const chainTxHash =
    shipment?.status === "payment_released" && shipment.txHash
      ? shipment.txHash
      : txHashFromLogs;

  if (!id) {
    return (
      <TraceFlowShell>
        <TraceFlowHeader />
        <main className="p-8 text-sky-700">Invalid shipment.</main>
      </TraceFlowShell>
    );
  }

  const timeline: { title: string; time: string; extra?: string }[] = [];

  if (shipment) {
    timeline.push({
      title: "Shipment created",
      time: shipment.createdAt,
    });
    if (agent) {
      timeline.push({
        title: `Agent identity created: ${truncateDid(agent.agentDid, 24, 12)}`,
        time: agent.createdAt,
        extra: agent.agentDid,
      });
      if (effectiveAgentStatus(agent) === "active" && agent.activatedAt) {
        timeline.push({
          title: "Agent activated",
          time: agent.activatedAt,
        });
      }
    }
    if (chainTxHash) {
      timeline.push({
        title: `Payment released: ${chainTxHash}`,
        time: shipment.updatedAt,
        extra: chainTxHash,
      });
    }
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
                <dt className="text-sky-700/80">Supplier wallet</dt>
                <dd className="break-all font-mono text-xs text-sky-900/90">{shipment.supplierAddress}</dd>
              </div>
              {shipment.status === "payment_released" && shipment.txHash ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-sky-700/80">Payment tx</dt>
                  <dd className="break-all font-mono text-xs text-sky-900/90">{shipment.txHash}</dd>
                </div>
              ) : null}
            </dl>

            <div className="mt-10">
              <h2 className="text-lg font-semibold text-sky-950">Timeline</h2>
              <ul className="relative mt-4 space-y-0 border-l-2 border-sky-300 pl-6">
                {timeline.map((ev, i) => (
                  <li key={`${ev.title}-${i}`} className="relative pb-8 last:pb-0">
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

            <section className="mt-12">
              <h2 className="text-lg font-semibold text-sky-950">Trust chain</h2>
              <div className="mt-6 flex flex-col items-stretch gap-4 md:flex-row md:flex-wrap md:items-center md:justify-center">
                {user ? (
                  <>
                    <TrustNode
                      title="Your Google Account"
                      subtitle={user.email ?? user.providerId}
                      icon={
                        user.picture ? (
                          <img src={user.picture} alt="" className="h-10 w-10 rounded-full" />
                        ) : (
                          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-200 text-xs text-sky-900">
                            {user.providerType}
                          </span>
                        )
                      }
                    />
                    <Arrow />
                    <TrustNode
                      title="Your DID"
                      subtitle={truncateDid(user.did)}
                      link={explorerDidUrl(user.did)}
                    />
                    <Arrow />
                    {agent ? (
                      <>
                        <TrustNode
                          title="Agent DID + On-chain Permissions"
                          subtitle={truncateDid(agent.agentDid)}
                          link={explorerDidUrl(agent.agentDid)}
                          extraLink={
                            agent.permitObjectId
                              ? {
                                  label: "View on-chain permissions",
                                  href: explorerObjectUrl(agent.permitObjectId),
                                }
                              : undefined
                          }
                        />
                        <Arrow />
                        <TrustNode
                          title="Transaction: supplier payment"
                          subtitle={chainTxHash ? truncateDid(chainTxHash, 12, 12) : "Pending"}
                          link={chainTxHash ? explorerTxUrl(chainTxHash) : undefined}
                        />
                      </>
                    ) : (
                      <TrustNode title="Agent" subtitle="Not configured for this shipment" />
                    )}
                  </>
                ) : null}
              </div>
            </section>

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

function Arrow() {
  return (
    <div className="flex justify-center text-2xl text-sky-400 md:px-2">
      <span aria-hidden className="rotate-90 md:rotate-0">
        →
      </span>
    </div>
  );
}

function TrustNode({
  title,
  subtitle,
  link,
  extraLink,
  icon,
}: {
  title: string;
  subtitle: string;
  link?: string;
  extraLink?: { label: string; href: string };
  icon?: ReactNode;
}) {
  const inner = (
    <div className="min-w-[200px] max-w-xs rounded-xl border border-sky-200 bg-white/95 px-4 py-3 text-center shadow-md shadow-sky-100/60">
      <div className="flex flex-col items-center gap-2">
        {icon}
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-600/80">{title}</p>
        <p className="break-all text-sm text-sky-950">{subtitle}</p>
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-sky-600 underline decoration-sky-300 hover:text-sky-800"
          >
            Explorer
          </a>
        ) : null}
        {extraLink ? (
          <a
            href={extraLink.href}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-cyan-700 underline decoration-cyan-300 hover:text-cyan-900"
          >
            {extraLink.label}
          </a>
        ) : null}
      </div>
    </div>
  );
  return inner;
}
