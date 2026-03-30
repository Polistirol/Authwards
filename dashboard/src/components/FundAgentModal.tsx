import { useEffect, useState } from "react";

import { iotaToNanos, nanosToIotaString } from "../lib/units";

type FundAgentModalProps = {
  open: boolean;
  onClose: () => void;
  agentDid: string;
  toAddress: string;
  backendUrl: string;
  token: string | null;
  onSuccess: () => void;
};

function trimSlash(u: string): string {
  return u.replace(/\/+$/, "");
}

type TabId = "fund" | "withdraw";

export default function FundAgentModal({
  open,
  onClose,
  agentDid,
  toAddress,
  backendUrl,
  token,
  onSuccess,
}: FundAgentModalProps) {
  const [tab, setTab] = useState<TabId>("fund");
  const [iotaAmount, setIotaAmount] = useState("0.1");
  const [withdrawAmount, setWithdrawAmount] = useState("0.1");
  /** Set when using MAX so submit uses exact chain nanos (no float rounding). */
  const [withdrawNanosExact, setWithdrawNanosExact] = useState<bigint | null>(null);
  const [maxLoading, setMaxLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Shown in green after a successful fund or withdraw; modal stays open until the user closes it. */
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTab("fund");
      setIotaAmount("0.1");
      setWithdrawAmount("0.1");
      setWithdrawNanosExact(null);
      setError(null);
      setSuccessMessage(null);
    }
  }, [open]);

  if (!open) return null;

  const isSuccess = successMessage !== null;

  async function submitFund(): Promise<void> {
    setError(null);
    const n = parseFloat(iotaAmount.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      setError("Enter a valid IOTA amount (e.g. 0.1).");
      return;
    }
    const nanos = iotaToNanos(n);
    if (!token) return;
    setBusy(true);
    try {
      const res = await fetch(`${trimSlash(backendUrl)}/wallet/transfer`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ to: toAddress, amount: Number(nanos) }),
      });
      const json: unknown = await res.json();
      if (!res.ok) {
        const msg =
          typeof json === "object" && json && "error" in json
            ? String((json as { error: unknown }).error)
            : res.statusText;
        setError(msg);
        return;
      }
      onSuccess();
      setSuccessMessage("Transfer completed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  async function fetchMaxWithdraw(): Promise<void> {
    setError(null);
    setMaxLoading(true);
    try {
      const res = await fetch(
        `${trimSlash(backendUrl)}/wallet/balance/${encodeURIComponent(toAddress)}`,
      );
      const json: unknown = await res.json();
      if (!res.ok) {
        const msg =
          typeof json === "object" && json && "error" in json
            ? String((json as { error: unknown }).error)
            : res.statusText;
        setError(msg);
        return;
      }
      const raw =
        typeof json === "object" && json && json !== null && "balanceNanos" in json
          ? (json as { balanceNanos: unknown }).balanceNanos
          : typeof json === "object" && json && json !== null && "balance" in json
            ? (json as { balance: unknown }).balance
            : null;
      const nanos = BigInt(typeof raw === "string" || typeof raw === "number" ? String(raw) : "0");
      if (nanos <= 0n) {
        setWithdrawNanosExact(null);
        setWithdrawAmount("0");
        setError("No balance to withdraw.");
        return;
      }
      setWithdrawNanosExact(nanos);
      setWithdrawAmount(nanosToIotaString(nanos));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setMaxLoading(false);
    }
  }

  async function submitWithdraw(): Promise<void> {
    setError(null);
    let nanos: bigint;
    if (withdrawNanosExact !== null) {
      nanos = withdrawNanosExact;
    } else {
      const n = parseFloat(withdrawAmount.replace(",", "."));
      if (!Number.isFinite(n) || n <= 0) {
        setError("Enter a valid IOTA amount (e.g. 0.1).");
        return;
      }
      nanos = iotaToNanos(n);
    }
    if (nanos <= 0n) {
      setError("Enter a valid IOTA amount (e.g. 0.1).");
      return;
    }
    if (!token) return;
    setBusy(true);
    try {
      const res = await fetch(`${trimSlash(backendUrl)}/wallet/withdraw-from-agent`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ agentDid, amount: Number(nanos) }),
      });
      const json: unknown = await res.json();
      if (!res.ok) {
        let msg = res.statusText;
        if (typeof json === "object" && json) {
          const o = json as { error?: unknown; message?: unknown };
          if (typeof o.message === "string" && o.message.trim()) msg = o.message;
          else if (o.error != null) msg = String(o.error);
        }
        setError(msg);
        return;
      }
      onSuccess();
      setSuccessMessage("Withdraw completed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[170] flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-funds-title"
        className="w-full max-w-md rounded-2xl border border-aw-border/90 bg-aw-panel p-6 shadow-2xl"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <h2 id="manage-funds-title" className="text-xl font-semibold text-white">
          Manage funds
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Add IOTA to this delegate from your connected wallet, or withdraw back to your wallet.
        </p>
        <p className="mt-3 max-w-full break-all font-mono text-xs text-aw-accent">
          {toAddress}
        </p>

        <div className="mt-5 flex gap-1 rounded-lg border border-white/10 bg-black/20 p-1">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "fund"}
            disabled={isSuccess}
            onClick={() => {
              setTab("fund");
              setError(null);
            }}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
              tab === "fund"
                ? "bg-aw-accent/20 text-aw-accent"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Fund
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "withdraw"}
            disabled={isSuccess}
            onClick={() => {
              setTab("withdraw");
              setError(null);
              setWithdrawNanosExact(null);
            }}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
              tab === "withdraw"
                ? "bg-aw-accent/20 text-aw-accent"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Withdraw
          </button>
        </div>

        {isSuccess ? (
          <p
            role="status"
            className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300"
          >
            {successMessage}
          </p>
        ) : null}

        {!isSuccess && tab === "fund" ? (
          <>
            <p className="mt-4 text-sm text-slate-400">
              Transfer IOTA from your connected wallet to the delegate address above.
            </p>
            <label className="mt-4 block">
              <span className="text-xs uppercase text-slate-500">IOTA amount to transfer</span>
              <input
                type="text"
                inputMode="decimal"
                value={iotaAmount}
                onChange={(e) => setIotaAmount(e.target.value)}
                className="mt-1 w-full rounded-lg border border-aw-border/90 bg-aw-inset px-3 py-2 font-mono text-sm text-white"
              />
            </label>
          </>
        ) : !isSuccess ? (
          <>
            <p className="mt-4 text-sm text-slate-400">
              Send IOTA from this delegate&apos;s wallet to your logged-in account wallet (server-signed,
              sponsored gas).
            </p>
            <label className="mt-4 block">
              <span className="text-xs uppercase text-slate-500">IOTA amount to withdraw</span>
              <div className="relative mt-1">
                <input
                  type="text"
                  inputMode="decimal"
                  value={withdrawAmount}
                  onChange={(e) => {
                    setWithdrawNanosExact(null);
                    setWithdrawAmount(e.target.value);
                  }}
                  className="w-full rounded-lg border border-aw-border/90 bg-aw-inset py-2 pl-3 pr-[4.25rem] font-mono text-sm text-white"
                />
                <button
                  type="button"
                  disabled={busy || maxLoading}
                  onClick={() => void fetchMaxWithdraw()}
                  aria-label="Set amount to maximum balance"
                  className="absolute right-1.5 top-1/2 z-10 -translate-y-1/2 rounded-md border border-aw-border/60 bg-aw-panel/95 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-aw-accent shadow-sm hover:bg-white/10 disabled:opacity-50"
                >
                  {maxLoading ? "…" : "MAX"}
                </button>
              </div>
            </label>
          </>
        ) : null}

        {!isSuccess && error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg border border-aw-border/80 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
          >
            {isSuccess ? "Close" : "Cancel"}
          </button>
          {!isSuccess ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void (tab === "fund" ? submitFund() : submitWithdraw())}
              className="rounded-lg bg-aw-accent px-5 py-2 text-sm font-semibold text-aw-on-accent disabled:opacity-50"
            >
              {busy ? "Working…" : tab === "fund" ? "Transfer" : "Withdraw"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
