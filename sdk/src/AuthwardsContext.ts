import { createContext } from "react";

import type { AuthProviderType, User } from "./types";

export type AuthwardsContextValue = {
  backendUrl: string;
  user: User | null;
  token: string | null;
  loading: boolean;
  recoveryPhrase: string | null;
  isFirstLogin: boolean;
  login: (provider?: AuthProviderType) => void;
  loginGitHub: () => void;
  connectWallet: () => Promise<void>;
  completeSession: (token: string, user: User) => void;
  logout: () => void;
  acknowledgeFirstLogin: () => void;
  /** If true, shows "Sign in with Telegram" without in-page widget (popup to backend). */
  telegramLoginEnabled?: boolean;
  /** @deprecated Use telegramLoginEnabled. If omitted, the Telegram button is visible only when this is set. */
  telegramBotUsername?: string;
  telegramPopupError: string | null;
  iotaWalletDownloadUrl: string;
};

export const AuthwardsContext = createContext<AuthwardsContextValue | null>(null);
