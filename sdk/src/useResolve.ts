import { useCallback, useContext } from "react";

import { AuthwardsContext } from "./AuthwardsContext";
import type { DelegateResolution, OwnerDelegatesResolution, TxResolution } from "./types";

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export type UseResolveResult = {
  resolveDelegate: (did: string) => Promise<DelegateResolution>;
  resolveOwnerDelegates: (ownerDid: string) => Promise<OwnerDelegatesResolution>;
  resolveTransaction: (txHash: string) => Promise<TxResolution>;
};

export function useResolve(): UseResolveResult {
  const ctx = useContext(AuthwardsContext);
  if (!ctx) {
    throw new Error("useResolve must be used within AuthwardsProvider");
  }
  const { backendUrl } = ctx;
  const base = trimTrailingSlash(backendUrl);

  const resolveDelegate = useCallback(
    async (did: string): Promise<DelegateResolution> => {
      const res = await fetch(`${base}/resolve/delegate/${encodeURIComponent(did)}`);
      if (!res.ok) throw new Error("Resolution failed");
      return res.json() as Promise<DelegateResolution>;
    },
    [base],
  );

  const resolveOwnerDelegates = useCallback(
    async (ownerDid: string): Promise<OwnerDelegatesResolution> => {
      const res = await fetch(
        `${base}/resolve/owner/${encodeURIComponent(ownerDid)}/delegates`,
      );
      if (!res.ok) throw new Error("Resolution failed");
      return res.json() as Promise<OwnerDelegatesResolution>;
    },
    [base],
  );

  const resolveTransaction = useCallback(
    async (txHash: string): Promise<TxResolution> => {
      const res = await fetch(`${base}/resolve/tx/${encodeURIComponent(txHash)}`);
      if (!res.ok) throw new Error("Resolution failed");
      return res.json() as Promise<TxResolution>;
    },
    [base],
  );

  return { resolveDelegate, resolveOwnerDelegates, resolveTransaction };
}
