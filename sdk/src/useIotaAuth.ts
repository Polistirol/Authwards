import { useContext, useMemo } from "react";

import { IotaAuthContext } from "./IotaAuthContext";
import type { AuthProviderType, User } from "./types";

export type UseIotaAuthResult = {
  user: User | null;
  did: string | undefined;
  walletAddress: string | undefined;
  isAuthenticated: boolean;
  loading: boolean;
  token: string | null;
  /**
   * Senza argomento apre il modal di login.
   * Con provider avvia OAuth (google/github), wallet, o modal (telegram).
   */
  login: (provider?: AuthProviderType) => void;
  /** @deprecated Usare login('github'). */
  loginGitHub: () => void;
  /** Flusso challenge-response con estensione wallet IOTA. */
  connectWallet: () => Promise<void>;
  logout: () => void;
  backendUrl: string;
  isFirstLogin: boolean;
  recoveryPhrase: string | null;
  acknowledgeFirstLogin: () => void;
  /** Salva JWT dopo login wallet/telegram in-page. */
  completeSession: (token: string, user: User) => void;
  telegramLoginEnabled?: boolean;
  /** @deprecated Usare telegramLoginEnabled. */
  telegramBotUsername?: string;
  telegramPopupError: string | null;
  iotaWalletDownloadUrl: string;
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
    loginGitHub,
    connectWallet,
    completeSession,
    logout,
    backendUrl,
    recoveryPhrase,
    isFirstLogin,
    acknowledgeFirstLogin,
    telegramLoginEnabled,
    telegramBotUsername,
    telegramPopupError,
    iotaWalletDownloadUrl,
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
      loginGitHub,
      connectWallet,
      completeSession,
      logout,
      backendUrl,
      isFirstLogin,
      recoveryPhrase,
      acknowledgeFirstLogin,
      telegramLoginEnabled,
      telegramBotUsername,
      telegramPopupError,
      iotaWalletDownloadUrl,
    }),
    [
      user,
      token,
      loading,
      login,
      loginGitHub,
      connectWallet,
      completeSession,
      logout,
      backendUrl,
      isFirstLogin,
      recoveryPhrase,
      acknowledgeFirstLogin,
      telegramLoginEnabled,
      telegramBotUsername,
      telegramPopupError,
      iotaWalletDownloadUrl,
    ],
  );
}
