import { useContext, useMemo } from "react";

import { IotaAuthContext } from "./IotaAuthProvider";
import type { User } from "./types";

export type UseIotaAuthResult = {
  user: User | null;
  did: string | undefined;
  isAuthenticated: boolean;
  loading: boolean;
  login: () => void;
  logout: () => void;
};

export function useIotaAuth(): UseIotaAuthResult {
  const ctx = useContext(IotaAuthContext);
  if (!ctx) {
    throw new Error("useIotaAuth must be used within IotaAuthProvider");
  }

  const { user, token, loading, login, logout } = ctx;

  return useMemo(
    () => ({
      user,
      did: user?.did,
      isAuthenticated: user !== null && token !== null,
      loading,
      login,
      logout,
    }),
    [user, token, loading, login, logout],
  );
}
