import { createContext } from "react";

import type { AuthProviderType, User } from "./types";

export type IotaAuthContextValue = {
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
  /** Se true, mostra "Sign in with Telegram" senza widget in-page (popup verso il backend). */
  telegramLoginEnabled?: boolean;
  /** @deprecated Usare telegramLoginEnabled. Se telegramLoginEnabled è omesso, il bottone Telegram è visibile solo se valorizzato. */
  telegramBotUsername?: string;
  telegramPopupError: string | null;
  iotaWalletDownloadUrl: string;
};

export const IotaAuthContext = createContext<IotaAuthContextValue | null>(null);
