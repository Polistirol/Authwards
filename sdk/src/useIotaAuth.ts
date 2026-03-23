import { useContext, useMemo } from "react";

import { IotaAuthContext } from "./IotaAuthProvider";
import type { User } from "./types";

export type UseIotaAuthResult = {
  user: User | null;
  did: string | undefined;
  walletAddress: string | undefined;
  isAuthenticated: boolean;
  loading: boolean;
  /** JWT session (solo in memoria / sessionStorage lato provider). */
  token: string | null;
  login: () => void;
  logout: () => void;
  /** URL backend (stesso valore del provider). */
  backendUrl: string;
  /** True solo dopo il primo OAuth con recovery in query. */
  isFirstLogin: boolean;
  /** Mnemonic one-shot dopo il primo login; poi null (es. dopo logout). */
  recoveryPhrase: string | null;
  /** Chiudi il welcome e rimuovi recovery / first-login dalla memoria React. */
  acknowledgeFirstLogin: () => void;
};

export function useIotaAuth(): UseIotaAuthResult {
  const ctx = useContext(IotaAuthContext);
  if (!ctx) {
    throw new Error("useIotaAuth must be used within IotaAuthProvider");
  }

  const {
    user,
    token,
    loading,
    login,
    logout,
    backendUrl,
    recoveryPhrase,
    isFirstLogin,
    acknowledgeFirstLogin,
  } = ctx;

  return useMemo(
    () => ({
      user,
      did: user?.did,
      walletAddress: user?.walletAddress,
      isAuthenticated: user !== null && token !== null,
      loading,
      token,
      login,
      logout,
      backendUrl,
      isFirstLogin,
      recoveryPhrase,
      acknowledgeFirstLogin,
    }),
    [
      user,
      token,
      loading,
      login,
      logout,
      backendUrl,
      isFirstLogin,
      recoveryPhrase,
      acknowledgeFirstLogin,
    ],
  );
}
