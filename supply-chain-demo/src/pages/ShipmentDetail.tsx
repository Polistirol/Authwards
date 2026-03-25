import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";

import type { Agent, AgentLog, AgentStatus } from "../../../sdk";
import { ConnectButton, useAgent, useIotaAuth } from "../../../sdk";
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
      return "Delivered";
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
  const { user, token, backendUrl } = useIotaAuth();
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
  const txHash = paymentLog
    ? (paymentLog.data as { meta?: { txHash?: string } }).meta?.txHash
    : undefined;

  const load = useCallback(async () => {
    if (!token || !id) return;
    setBusy(true);
    setErr(null);
    try {
      const s = await fetchShipmentById(backendUrl, token, id);
      setShipment(s);
      await refreshAgents();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }, [backendUrl, token, id, refreshAgents]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!token || !id) return;
    const interval = window.setInterval(() => void load(), 25_000);
    return () => window.clearInterval(interval);
  }, [token, id, load]);

  useEffect(() => {
    if (agent?.agentDid && token) {
      void fetchAgentLogs(agent.agentDid);
    }
  }, [agent?.agentDid, token, fetchAgentLogs]);

  async function handleDemoDeliver(): Promise<void> {
    if (!token || !id) return;
    setDemoBusy(true);
    try {
      const s = await patchShipmentStatus(backendUrl, token, id, "delivered");
      setShipment(s);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setDemoBusy(false);
    }
  }

  if (!id) {
    return (
      <TraceFlowShell>
        <TraceFlowHeader />
        <main className="p-8 text-slate-400">Invalid shipment.</main>
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
    if (txHash) {
      timeline.push({
        title: `Payment released: ${txHash}`,
        time: paymentLog?.timestamp ?? "",
        extra: txHash,
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
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5"
            >
              ← List
            </Link>
            <ConnectButton
              theme="dark"
              label="Sign in with Google"
              frontendUrl={import.meta.env.VITE_FRONTEND_URL || undefined}
            />
          </div>
        }
      />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        {err ? <p className="text-red-400">{err}</p> : null}
        {busy && !shipment ? <p className="text-slate-400">Loading…</p> : null}

        {shipment ? (
          <>
            <h1 className="text-2xl font-bold text-white">{shipment.product}</h1>
            <p className="mt-2 text-slate-400">
              {shipment.origin} <span className="text-amber-500">→</span> {shipment.destination}
            </p>
            <dl className="mt-6 grid gap-3 rounded-2xl border border-slate-600 bg-[#1e293b] p-5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">ID</dt>
                <dd className="font-mono text-slate-200">{shipment.id}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Status</dt>
                <dd className="text-slate-200">{formatShipmentStatus(shipment.status)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Payment</dt>
                <dd className="text-slate-200">{shipment.paymentAmount} IOTA</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Supplier (DID)</dt>
                <dd className="break-all font-mono text-xs text-slate-300">{shipment.supplier}</dd>
              </div>
            </dl>

            <div className="mt-10">
              <h2 className="text-lg font-semibold text-white">Timeline</h2>
              <ul className="relative mt-4 space-y-0 border-l-2 border-slate-600 pl-6">
                {timeline.map((ev, i) => (
                  <li key={`${ev.title}-${i}`} className="relative pb-8 last:pb-0">
                    <span className="absolute -left-[31px] top-1.5 h-3 w-3 rounded-full border-2 border-amber-500 bg-[#0c1220]" />
                    <p className="font-medium text-slate-200">{ev.title}</p>
                    {ev.time ? (
                      <p className="mt-1 text-xs text-slate-500">{ev.time}</p>
                    ) : null}
                    {ev.extra && ev.title.startsWith("Payment released") ? (
                      <a
                        href={explorerTxUrl(ev.extra)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block text-sm text-blue-400 underline"
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
                className="rounded-xl border border-slate-600 px-5 py-2 text-sm font-medium text-slate-200 hover:bg-white/5 disabled:opacity-50"
              >
                Refresh
              </button>
            </div>

            <section className="mt-12">
              <h2 className="text-lg font-semibold text-white">Trust chain</h2>
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
                          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-700 text-xs text-slate-300">
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
                          subtitle={txHash ? truncateDid(txHash, 12, 12) : "Pending"}
                          link={txHash ? explorerTxUrl(txHash) : undefined}
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
              <div className="mt-16 border-t border-slate-700 pt-8 text-center">
                <button
                  type="button"
                  disabled={demoBusy}
                  onClick={() => void handleDemoDeliver()}
                  className="text-sm text-amber-500/90 underline decoration-amber-500/40 underline-offset-4 hover:text-amber-400 disabled:opacity-50"
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
    <div className="flex justify-center text-2xl text-amber-500/80 md:px-2">
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
    <div className="min-w-[200px] max-w-xs rounded-xl border border-slate-600 bg-[#1e293b] px-4 py-3 text-center shadow-md">
      <div className="flex flex-col items-center gap-2">
        {icon}
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
        <p className="break-all text-sm text-slate-200">{subtitle}</p>
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue-400 underline hover:text-blue-300"
          >
            Explorer
          </a>
        ) : null}
        {extraLink ? (
          <a
            href={extraLink.href}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-amber-400/90 underline hover:text-amber-300"
          >
            {extraLink.label}
          </a>
        ) : null}
      </div>
    </div>
  );
  return inner;
}
