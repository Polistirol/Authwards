import { useContext, useMemo } from "react";

import { AuthwardsContext } from "./AuthwardsContext";
import type { AuthProviderType, User } from "./types";

export type UseAuthwardsResult = {
  user: User | null;
  did: string | undefined;
  walletAddress: string | undefined;
  isAuthenticated: boolean;
  loading: boolean;
  token: string | null;
  /**
   * With no argument, opens the login modal.
   * With a provider, starts OAuth (google/github), wallet, or Telegram popup.
   */
  login: (provider?: AuthProviderType) => void;
  /** @deprecated Use login('github'). */
  loginGitHub: () => void;
  /** Challenge–response flow with the IOTA wallet extension. */
  connectWallet: () => Promise<void>;
  logout: () => void;
  backendUrl: string;
  isFirstLogin: boolean;
  recoveryPhrase: string | null;
  acknowledgeFirstLogin: () => void;
  /** Persists JWT after in-page wallet/Telegram login. */
  completeSession: (token: string, user: User) => void;
  telegramLoginEnabled?: boolean;
  /** @deprecated Use telegramLoginEnabled. */
  telegramBotUsername?: string;
  telegramPopupError: string | null;
  iotaWalletDownloadUrl: string;
};

export function useAuthwards(): UseAuthwardsResult {
  const ctx = useContext(AuthwardsContext);
  if (!ctx) {
    throw new Error("useAuthwards must be used within AuthwardsProvider");
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
