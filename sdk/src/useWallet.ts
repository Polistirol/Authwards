import { useCallback, useContext, useState } from "react";

import { IotaAuthContext } from "./IotaAuthContext";

export type WalletBalanceResponse = {
  address: string;
  coinType?: string;
  balance: string;
  nanos?: string;
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
};

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function useWallet(): UseWalletResult {
  const ctx = useContext(IotaAuthContext);
  if (!ctx) {
    throw new Error("useWallet must be used within IotaAuthProvider");
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
        setBalance(data.balance);
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

  return { loading, balance, getBalance, transferToAgent };
}
