import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

import { IotaAuthContext, type IotaAuthContextValue } from "./IotaAuthContext";
import { LoginModal } from "./LoginModal";
import { WelcomeModal } from "./WelcomeModal";
import type { AuthProviderType, User } from "./types";
import {
  resolveIotaWalletAdapter,
  getWalletAddress,
  signPersonalMessageWithWallet,
} from "./walletConnection";

const SESSION_KEY = "iota-auth:jwt";

const DEFAULT_WALLET_DOWNLOAD = "https://wiki.iota.org/get-started/introduction/";

export type IotaAuthProviderProps = {
  backendUrl: string;
  children: ReactNode;
  /** Mostra "Sign in with Telegram" (popup → backend). Se omesso, resta visibile solo con `telegramBotUsername` (legacy). */
  telegramLoginEnabled?: boolean;
  /** @deprecated Solo per compatibilità: se `telegramLoginEnabled` è omesso, il bottone Telegram compare se valorizzato. */
  telegramBotUsername?: string;
  iotaWalletDownloadUrl?: string;
  /**
   * Se true (default), al primo login OAuth mostra il modal con seed phrase / DID / wallet.
   * Disattivalo per white-label o se gestisci tu la UI (restano disponibili `recoveryPhrase` / `isFirstLogin` dal context).
   */
  showWelcomeModal?: boolean;
};

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

async function fetchMe(backendUrl: string, token: string): Promise<User | null> {
  const res = await fetch(`${trimTrailingSlash(backendUrl)}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) return null;
  if (!res.ok) {
    console.error("[@iota-auth/sdk] GET /auth/me failed:", res.status, await res.text());
    return null;
  }
  try {
    return (await res.json()) as User;
  } catch (e) {
    console.error("[@iota-auth/sdk] GET /auth/me JSON parse error:", e);
    return null;
  }
}

function shouldShowTelegramButton(
  telegramLoginEnabled: boolean | undefined,
  telegramBotUsername: string | undefined,
): boolean {
  if (telegramLoginEnabled === false) return false;
  if (telegramLoginEnabled === true) return true;
  return Boolean(telegramBotUsername?.trim());
}

export function IotaAuthProvider({
  backendUrl,
  children,
  telegramLoginEnabled,
  telegramBotUsername,
  iotaWalletDownloadUrl = DEFAULT_WALLET_DOWNLOAD,
  showWelcomeModal = true,
}: IotaAuthProviderProps): ReactElement {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [recoveryPhrase, setRecoveryPhrase] = useState<string | null>(null);
  const [isFirstLogin, setIsFirstLogin] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [telegramPopupError, setTelegramPopupError] = useState<string | null>(null);
  const telegramMessageListenerRef = useRef<((ev: MessageEvent) => void) | null>(null);

  const base = trimTrailingSlash(backendUrl);
  const showTelegram = shouldShowTelegramButton(telegramLoginEnabled, telegramBotUsername);

  const completeSession = useCallback((newToken: string, u: User) => {
    try {
      sessionStorage.setItem(SESSION_KEY, newToken);
    } catch (e) {
      console.error("[@iota-auth/sdk] sessionStorage set failed:", e);
    }
    setToken(newToken);
    setUser(u);
    setLoginModalOpen(false);
    setTelegramPopupError(null);
  }, []);

  const openTelegramPopup = useCallback(() => {
    setTelegramPopupError(null);
    if (telegramMessageListenerRef.current) {
      window.removeEventListener("message", telegramMessageListenerRef.current);
      telegramMessageListenerRef.current = null;
    }
    const expectedOrigin = new URL(base).origin;
    const popup = window.open(
      `${base}/auth/telegram/login`,
      "telegram-login",
      "width=550,height=450,scrollbars=yes,resizable=yes",
    );
    if (!popup) {
      setTelegramPopupError(
        "Popup bloccata dal browser. Consenti le finestre a comparsa per questo sito.",
      );
      return;
    }
    const onMessage = (ev: MessageEvent): void => {
      if (ev.origin !== expectedOrigin) return;
      const data = ev.data;
      if (!data || typeof data !== "object") return;
      const rec = data as { type?: string; token?: string; error?: string };
      if (rec.type === "iota-auth-token" && typeof rec.token === "string") {
        window.removeEventListener("message", onMessage);
        telegramMessageListenerRef.current = null;
        const jwt = rec.token;
        void (async () => {
          const me = await fetchMe(backendUrl, jwt);
          if (me) {
            completeSession(jwt, me);
          } else {
            setTelegramPopupError("Sessione non valida dopo il login Telegram.");
          }
        })();
      } else if (rec.type === "iota-auth-error") {
        window.removeEventListener("message", onMessage);
        telegramMessageListenerRef.current = null;
        setTelegramPopupError(
          typeof rec.error === "string" ? rec.error : "Errore durante il login Telegram.",
        );
      }
    };
    telegramMessageListenerRef.current = onMessage;
    window.addEventListener("message", onMessage);
  }, [base, backendUrl, completeSession]);

  useEffect(() => {
    return () => {
      if (telegramMessageListenerRef.current) {
        window.removeEventListener("message", telegramMessageListenerRef.current);
        telegramMessageListenerRef.current = null;
      }
    };
  }, []);

  const connectWallet = useCallback(async () => {
    const adapter = await resolveIotaWalletAdapter();
    if (!adapter) {
      throw new Error("NO_WALLET");
    }
    const walletAddress = await getWalletAddress(adapter);
    const chRes = await fetch(`${base}/auth/wallet/challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress }),
    });
    if (!chRes.ok) {
      throw new Error(await chRes.text());
    }
    const { message, nonce } = (await chRes.json()) as { message: string; nonce: string };
    const messageBytes = new TextEncoder().encode(message);
    const signature = await signPersonalMessageWithWallet(adapter, messageBytes);
    const vRes = await fetch(`${base}/auth/wallet/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress, signature, nonce }),
    });
    if (!vRes.ok) {
      throw new Error(await vRes.text());
    }
    const { token: jwt, user: u } = (await vRes.json()) as { token: string; user: User };
    completeSession(jwt, u);
  }, [base, completeSession]);

  const login = useCallback(
    (provider?: AuthProviderType) => {
      if (provider === undefined) {
        setLoginModalOpen(true);
        return;
      }
      if (provider === "google") {
        const returnTo = encodeURIComponent(window.location.href);
        window.location.href = `${base}/auth/google?return_to=${returnTo}`;
        return;
      }
      if (provider === "github") {
        const returnTo = encodeURIComponent(window.location.href);
        window.location.href = `${base}/auth/github?return_to=${returnTo}`;
        return;
      }
      if (provider === "wallet") {
        void connectWallet().catch((e: unknown) => {
          console.error("[@iota-auth/sdk] connectWallet:", e);
        });
        return;
      }
      if (provider === "telegram") {
        openTelegramPopup();
      }
    },
    [base, connectWallet, openTelegramPopup],
  );

  const loginGitHub = useCallback(() => {
    login("github");
  }, [login]);

  const logout = useCallback(() => {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {
      console.error("[@iota-auth/sdk] sessionStorage remove failed:", e);
    }
    setToken(null);
    setUser(null);
    setRecoveryPhrase(null);
    setIsFirstLogin(false);
  }, []);

  const acknowledgeFirstLogin = useCallback(() => {
    setRecoveryPhrase(null);
    setIsFirstLogin(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap(): Promise<void> {
      try {
        const params = new URLSearchParams(window.location.search);
        const urlToken = params.get("token");
        const recoveryParam = params.get("recovery");
        const firstLoginParam = params.get("firstLogin");
        const shouldCleanUrl =
          Boolean(urlToken) || params.has("recovery") || params.has("firstLogin");

        if (urlToken) {
          sessionStorage.setItem(SESSION_KEY, urlToken);
          params.delete("token");
        }
        if (recoveryParam) {
          setRecoveryPhrase(recoveryParam);
        }
        if (firstLoginParam === "true") {
          setIsFirstLogin(true);
        }
        params.delete("recovery");
        params.delete("firstLogin");

        if (shouldCleanUrl) {
          const qs = params.toString();
          const next =
            window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
          window.history.replaceState(null, "", next);
        }

        let stored: string | null = null;
        try {
          stored = sessionStorage.getItem(SESSION_KEY);
        } catch (e) {
          console.error("[@iota-auth/sdk] sessionStorage read failed:", e);
        }

        if (!stored) {
          if (!cancelled) {
            setToken(null);
            setUser(null);
            setLoading(false);
          }
          return;
        }

        if (!cancelled) setToken(stored);

        const me = await fetchMe(backendUrl, stored);
        if (cancelled) return;

        if (me === null) {
          try {
            sessionStorage.removeItem(SESSION_KEY);
          } catch (e) {
            console.error("[@iota-auth/sdk] sessionStorage remove after 401:", e);
          }
          setToken(null);
          setUser(null);
        } else {
          setUser(me);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [backendUrl]);

  const value = useMemo<IotaAuthContextValue>(
    () => ({
      backendUrl: base,
      user,
      token,
      loading,
      recoveryPhrase,
      isFirstLogin,
      login,
      loginGitHub,
      connectWallet,
      completeSession,
      logout,
      acknowledgeFirstLogin,
      telegramLoginEnabled,
      telegramBotUsername,
      telegramPopupError,
      iotaWalletDownloadUrl,
    }),
    [
      base,
      user,
      token,
      loading,
      recoveryPhrase,
      isFirstLogin,
      login,
      loginGitHub,
      connectWallet,
      completeSession,
      logout,
      acknowledgeFirstLogin,
      telegramLoginEnabled,
      telegramBotUsername,
      telegramPopupError,
      iotaWalletDownloadUrl,
    ],
  );

  return (
    <IotaAuthContext.Provider value={value}>
      {children}
      <LoginModal
        isOpen={loginModalOpen}
        onClose={() => {
          setTelegramPopupError(null);
          setLoginModalOpen(false);
        }}
        backendUrl={base}
        connectWallet={connectWallet}
        showTelegram={showTelegram}
        onTelegramLogin={openTelegramPopup}
        telegramError={telegramPopupError}
        iotaWalletDownloadUrl={iotaWalletDownloadUrl}
      />
      {showWelcomeModal ? <WelcomeModal /> : null}
    </IotaAuthContext.Provider>
  );
}
