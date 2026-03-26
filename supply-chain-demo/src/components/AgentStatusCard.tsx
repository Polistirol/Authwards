import { useCallback, useEffect, useState } from "react";

import type { Agent, AgentStatus } from "../../../sdk";
import { useAgent, useAuthwards, useWallet } from "../../../sdk";
import { explorerObjectUrl } from "../lib/explorer";
import { nanosToIota, truncateDid } from "../lib/format";
import { iotaToNanos } from "../lib/units";
import { permissionCaps } from "../lib/permissions";
import SnippetModal from "./SnippetModal";

function effectiveStatus(agent: Agent): AgentStatus {
  if (agent.status === "pending_activation") return "created";
  if (agent.status) return agent.status;
  if (agent.active === false) return "revoked";
  if (agent.active === true) return "active";
  return "created";
}

function statusBadgeClass(s: AgentStatus): string {
  switch (s) {
    case "active":
      return "border-cyan-300 bg-cyan-100 text-cyan-950";
    case "revoked":
      return "border-red-200 bg-red-50 text-red-800";
    default:
      return "border-sky-300 bg-sky-100 text-sky-900";
  }
}

function statusLabelEn(s: AgentStatus): string {
  switch (s) {
    case "active":
      return "Active";
    case "revoked":
      return "Revoked";
    case "created":
    case "pending_activation":
      return "Not activated";
    default:
      return "Not activated";
  }
}

export type AgentStatusCardProps = {
  agent: Agent;
};

export function AgentStatusCard({ agent }: AgentStatusCardProps) {
  const { backendUrl, token } = useAuthwards();
  const { refreshAgents } = useAgent();
  const { getBalance, transferToAgent, loading: walletLoading } = useWallet();
  const [balanceNanos, setBalanceNanos] = useState<string | null>(null);
  const [snippetOpen, setSnippetOpen] = useState(false);
  const [fundOpen, setFundOpen] = useState(false);
  const [fundAmount, setFundAmount] = useState("10");
  const [fundError, setFundError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const st = effectiveStatus(agent);
  const caps = permissionCaps(agent);

  const refreshBalance = useCallback(async () => {
    if (!agent.walletAddress) return;
    try {
      const r = await getBalance(agent.walletAddress);
      setBalanceNanos(r.balanceNanos ?? r.nanos ?? r.balance);
    } catch {
      setBalanceNanos(null);
    }
  }, [agent.walletAddress, getBalance]);

  useEffect(() => {
    void refreshBalance();
  }, [refreshBalance]);

  useEffect(() => {
    const id = setInterval(() => {
      void refreshAgents();
      void refreshBalance();
    }, 15_000);
    return () => clearInterval(id);
  }, [refreshAgents, refreshBalance]);

  async function handleFund(): Promise<void> {
    setFundError(null);
    const n = parseFloat(fundAmount.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      setFundError("Enter a valid amount.");
      return;
    }
    if (!agent.walletAddress) return;
    try {
      const nanos = Number(iotaToNanos(n));
      await transferToAgent(agent.walletAddress, nanos);
      setFundOpen(false);
      void refreshBalance();
    } catch (e) {
      setFundError(e instanceof Error ? e.message : "Transfer failed");
    }
  }

  async function copyDid(): Promise<void> {
    try {
      await navigator.clipboard.writeText(agent.agentDid);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className="mt-4 rounded-xl border border-sky-200 bg-sky-50/90 p-4 shadow-inner shadow-sky-100/50"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-sky-700/80">Payment Agent</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="text-sm font-medium text-sky-800">{truncateDid(agent.agentDid)}</code>
        <button
          type="button"
          onClick={() => void copyDid()}
          className="text-xs font-medium text-sky-600 underline decoration-sky-300 hover:text-sky-900"
        >
          {copied ? "Copied" : "Copy DID"}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(st)}`}
        >
          {statusLabelEn(st)}
        </span>
        <span className="text-sm text-sky-800/85">
          Balance:{" "}
          <span className="font-medium text-sky-950">
            {balanceNanos !== null ? `${nanosToIota(balanceNanos)} IOTA` : "—"}
          </span>
        </span>
      </div>
      <div className="mt-3 grid gap-1 text-sm text-sky-800/85">
        <p>
          Permissions: max <span className="text-sky-950">{caps.maxPerTx}</span> / tx, max{" "}
          <span className="text-sky-950">{caps.maxPerDay}</span> / day
        </p>
        {agent.permitObjectId ? (
          <p>
            <a
              href={explorerObjectUrl(agent.permitObjectId)}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-sky-600 underline decoration-sky-300 hover:text-sky-900"
            >
              View on-chain permissions
            </a>
          </p>
        ) : null}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSnippetOpen(true)}
          className="rounded-lg border border-sky-300 bg-sky-100 px-3 py-1.5 text-sm font-medium text-sky-900 hover:bg-sky-200/80"
        >
          View Snippet
        </button>
        <button
          type="button"
          onClick={() => {
            setFundError(null);
            setFundOpen(true);
          }}
          className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-900 hover:bg-blue-100/80"
        >
          Fund Agent
        </button>
      </div>

      <SnippetModal
        open={snippetOpen}
        onClose={() => setSnippetOpen(false)}
        agentDid={agent.agentDid}
        agentStatus={st}
        backendUrl={backendUrl}
        token={token}
      />

      {fundOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-[2px]"
          role="presentation"
        >
          <div
            className="tf-modal-enter w-full max-w-md rounded-xl border border-sky-200 bg-white p-6 shadow-xl shadow-sky-200/50"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-sky-950">Fund Agent</h3>
            <p className="mt-2 text-sm text-sky-800/85">
              Transfer IOTA from your user wallet to the agent wallet (testnet).
            </p>
            <label className="mt-4 block text-sm text-sky-900">
              Amount (IOTA)
              <input
                type="text"
                inputMode="decimal"
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value)}
                className="mt-1 w-full rounded-lg border border-sky-200 bg-sky-50/80 px-3 py-2 text-sky-950 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200"
              />
            </label>
            {fundError ? <p className="mt-2 text-sm text-red-600">{fundError}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFundOpen(false)}
                className="rounded-lg border border-sky-200 bg-white px-4 py-2 text-sm text-sky-800 hover:bg-sky-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={walletLoading}
                onClick={() => void handleFund()}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
