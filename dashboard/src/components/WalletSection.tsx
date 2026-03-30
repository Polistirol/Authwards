import { useCallback, useEffect, useState } from "react";

import { useAuthwards } from "../sdk";
import { explorerTxUrl } from "../lib/explorer";
import { IconArrowDown, IconArrowUp } from "./icons";

function trimBackend(u: string): string {
  return u.replace(/\/+$/, "");
}

function truncateAddr(addr: string, head = 8, tail = 6): string {
  if (addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

function formatIotaDisplay(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  return abs >= 1 ? n.toFixed(2) : n.toFixed(6);
}

function formatRelativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec} sec ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const d = Math.floor(hr / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

type WalletTxRow = {
  txHash: string;
  type: "sent" | "received";
  amount: string;
  amountIota: number;
  counterparty: string;
  timestamp: string;
};

/** On-chain activity only; Send/Receive live in the account menu (`ConnectButton`). */
export default function WalletSection() {
  const { user, did, backendUrl } = useAuthwards();

  const [txRows, setTxRows] = useState<WalletTxRow[]>([]);
  const [txLoading, setTxLoading] = useState(false);

  const walletAddress = user?.walletAddress?.trim() ?? "";

  const loadTx = useCallback(async () => {
    if (!walletAddress) return;
    setTxLoading(true);
    try {
      const res = await fetch(
        `${trimBackend(backendUrl)}/wallet/transactions/${encodeURIComponent(walletAddress)}?limit=20`,
      );
      if (!res.ok) {
        setTxRows([]);
        return;
      }
      const json = (await res.json()) as { transactions?: WalletTxRow[] };
      setTxRows(Array.isArray(json.transactions) ? json.transactions : []);
    } catch {
      setTxRows([]);
    } finally {
      setTxLoading(false);
    }
  }, [backendUrl, walletAddress]);

  useEffect(() => {
    if (!walletAddress) {
      setTxRows([]);
      return;
    }
    void loadTx();
    const id = window.setInterval(() => void loadTx(), 30_000);
    return () => clearInterval(id);
  }, [walletAddress, loadTx]);

  if (!walletAddress) {
    return (
      <section>
        <h2 className="text-lg font-semibold text-white">Wallet activity</h2>
        <p className="mt-2 text-sm text-slate-500">
          No wallet linked to this account (complete OAuth onboarding).
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-white">Wallet activity</h2>
      <p className="mt-1 max-w-xl text-sm text-slate-500">
        Send and receive IOTA from the account button (top right). Recent on-chain transfers are listed
        below.
      </p>

      <div className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Transaction history
          </h3>
          <button
            type="button"
            onClick={() => void loadTx()}
            className="text-xs font-medium text-aw-accent hover:underline"
          >
            Refresh
          </button>
        </div>
        {txLoading && txRows.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        ) : txRows.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No transactions yet</p>
        ) : (
          <ul className="mt-4 divide-y divide-white/10 rounded-xl border border-white/10 bg-white/[0.02]">
            {txRows.map((row) => (
              <li key={row.txHash}>
                <a
                  href={explorerTxUrl(row.txHash, did ?? "")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-wrap items-center gap-3 px-4 py-3 transition hover:bg-white/[0.04]"
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/5 text-slate-300"
                    title={row.type}
                  >
                    {row.type === "sent" ? (
                      <IconArrowUp className="h-4 w-4" />
                    ) : (
                      <IconArrowDown className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1 text-left">
                    <p
                      className={`font-mono text-sm font-semibold ${
                        row.type === "received" ? "text-emerald-400" : "text-slate-200"
                      }`}
                    >
                      {row.type === "sent" ? "−" : "+"}
                      {formatIotaDisplay(row.amountIota)} IOTA
                    </p>
                    <p className="truncate font-mono text-xs text-slate-500">
                      {truncateAddr(row.counterparty)}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-500">
                    {formatRelativeTime(row.timestamp)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
