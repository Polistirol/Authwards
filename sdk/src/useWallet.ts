import { useCallback, useContext, useState } from "react";

import { AuthwardsContext } from "./AuthwardsContext";

export type WalletBalanceResponse = {
  address: string;
  coinType?: string;
  /** Chain balance in nanos (string). */
  balanceNanos?: string;
  balance: string;
  /** Display helper (IOTA). */
  balanceIota?: number;
  nanos?: string;
};

/** Response from `POST /wallet/withdraw-from-agent` (sponsored gas; delegate → account wallet). */
export type WithdrawFromDelegateResult = {
  txHash: string;
  from: string;
  to: string;
  amountNanos: string;
  amountIota: number;
};

export type UseWalletResult = {
  loading: boolean;
  /** Last balance read with `getBalance` (nanos string from the API). */
  balance: string | null;
  getBalance: (address: string) => Promise<WalletBalanceResponse>;
  transferToAgent: (agentAddress: string, amountNanos: number) => Promise<{
    txHash: string;
    from: string;
    to: string;
    amount: number;
  }>;
  /**
   * Withdraw IOTA from a delegate wallet to the logged-in account wallet (`POST /wallet/withdraw-from-agent`).
   * `amount` is in **nanos** unless `options.unit` is `"iota"`.
   */
  withdrawFromDelegate: (
    agentDid: string,
    amount: number,
    options?: { unit?: "nanos" | "iota" },
  ) => Promise<WithdrawFromDelegateResult>;
};

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function useWallet(): UseWalletResult {
  const ctx = useContext(AuthwardsContext);
  if (!ctx) {
    throw new Error("useWallet must be used within AuthwardsProvider");
  }

  const { backendUrl, token } = ctx;
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);

  const getBalance = useCallback(
    async (address: string) => {
      setLoading(true);
      try {
        const res = await fetch(
          `${trimTrailingSlash(backendUrl)}/wallet/balance/${encodeURIComponent(address)}`,
        );
        if (!res.ok) {
          const t = await res.text();
          throw new Error(t || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as WalletBalanceResponse;
        setBalance(data.balanceNanos ?? data.balance);
        return data;
      } finally {
        setLoading(false);
      }
    },
    [backendUrl],
  );

  const transferToAgent = useCallback(
    async (agentAddress: string, amountNanos: number) => {
      if (!token) throw new Error("Authentication required");
      setLoading(true);
      try {
        const res = await fetch(`${trimTrailingSlash(backendUrl)}/wallet/transfer`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ to: agentAddress, amount: amountNanos }),
        });
        if (!res.ok) {
          const t = await res.text();
          throw new Error(t || `HTTP ${res.status}`);
        }
        return (await res.json()) as {
          txHash: string;
          from: string;
          to: string;
          amount: number;
        };
      } finally {
        setLoading(false);
      }
    },
    [backendUrl, token],
  );

  const withdrawFromDelegate = useCallback(
    async (
      agentDid: string,
      amount: number,
      options?: { unit?: "nanos" | "iota" },
    ): Promise<WithdrawFromDelegateResult> => {
      if (!token) throw new Error("Authentication required");
      setLoading(true);
      try {
        const unit = options?.unit === "iota" ? "iota" : "nanos";
        const res = await fetch(`${trimTrailingSlash(backendUrl)}/wallet/withdraw-from-agent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ agentDid: agentDid.trim(), amount, unit }),
        });
        if (!res.ok) {
          const t = await res.text();
          let msg = t || `HTTP ${res.status}`;
          try {
            const j = JSON.parse(t) as { error?: unknown; message?: unknown };
            if (typeof j.message === "string" && j.message.trim()) msg = j.message;
            else if (typeof j.error === "string") msg = j.error;
          } catch {
            /* use raw */
          }
          throw new Error(msg);
        }
        return (await res.json()) as WithdrawFromDelegateResult;
      } finally {
        setLoading(false);
      }
    },
    [backendUrl, token],
  );

  return { loading, balance, getBalance, transferToAgent, withdrawFromDelegate };
}
