import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

import { AuthwardsContext, type AuthwardsContextValue } from "./AuthwardsContext";
import { LoginModal } from "./LoginModal";
import { WelcomeModal } from "./WelcomeModal";
import type { AuthProviderType, User } from "./types";
import {
  resolveIotaWalletAdapter,
  getWalletAddress,
  signPersonalMessageWithWallet,
} from "./walletConnection";

/** Current session key; legacy `iota-auth:jwt` is still read on bootstrap. */
const SESSION_KEY = "authwards:jwt";
const LEGACY_SESSION_KEY = "iota-auth:jwt";

function getStoredJwt(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY) ?? sessionStorage.getItem(LEGACY_SESSION_KEY);
  } catch {
    return null;
  }
}

function setStoredJwt(token: string): void {
  try {
    sessionStorage.setItem(SESSION_KEY, token);
    sessionStorage.removeItem(LEGACY_SESSION_KEY);
  } catch (e) {
    console.error("[@authwards/sdk] sessionStorage set failed:", e);
  }
}

function removeStoredJwt(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(LEGACY_SESSION_KEY);
  } catch (e) {
    console.error("[@authwards/sdk] sessionStorage remove failed:", e);
  }
}

const DEFAULT_WALLET_DOWNLOAD = "https://wiki.iota.org/get-started/introduction/";

export type AuthwardsProviderProps = {
  backendUrl: string;
  children: ReactNode;
  /** Shows "Sign in with Telegram" (popup → backend). If omitted, visible only when `telegramBotUsername` is set (legacy). */
  telegramLoginEnabled?: boolean;
  /** @deprecated Compatibility only: if `telegramLoginEnabled` is omitted, the Telegram button appears when this is set. */
  telegramBotUsername?: string;
  iotaWalletDownloadUrl?: string;
  /**
   * If true (default), first OAuth login shows the modal with seed phrase / DID / wallet.
   * Turn off for white-label or if you build your own UI (`recoveryPhrase` / `isFirstLogin` remain on context).
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
    console.error("[@authwards/sdk] GET /auth/me failed:", res.status, await res.text());
    return null;
  }
  try {
    return (await res.json()) as User;
  } catch (e) {
    console.error("[@authwards/sdk] GET /auth/me JSON parse error:", e);
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

function isTelegramTokenMessage(rec: { type?: string; token?: string }): boolean {
  return (
    (rec.type === "authwards-token" || rec.type === "iota-auth-token") &&
    typeof rec.token === "string"
  );
}

function isTelegramErrorMessage(rec: { type?: string }): boolean {
  return rec.type === "authwards-error" || rec.type === "iota-auth-error";
}

export function AuthwardsProvider({
  backendUrl,
  children,
  telegramLoginEnabled,
  telegramBotUsername,
  iotaWalletDownloadUrl = DEFAULT_WALLET_DOWNLOAD,
  showWelcomeModal = true,
}: AuthwardsProviderProps): ReactElement {
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
    setStoredJwt(newToken);
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
        "Popup blocked by the browser. Allow pop-ups for this site.",
      );
      return;
    }
    const onMessage = (ev: MessageEvent): void => {
      if (ev.origin !== expectedOrigin) return;
      const data = ev.data;
      if (!data || typeof data !== "object") return;
      const rec = data as { type?: string; token?: string; error?: string };
      if (isTelegramTokenMessage(rec)) {
        window.removeEventListener("message", onMessage);
        telegramMessageListenerRef.current = null;
        const jwt = rec.token as string;
        void (async () => {
          const me = await fetchMe(backendUrl, jwt);
          if (me) {
            completeSession(jwt, me);
          } else {
            setTelegramPopupError("Invalid session after Telegram login.");
          }
        })();
      } else if (isTelegramErrorMessage(rec)) {
        window.removeEventListener("message", onMessage);
        telegramMessageListenerRef.current = null;
        setTelegramPopupError(
          typeof rec.error === "string" ? rec.error : "Telegram login error.",
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
          console.error("[@authwards/sdk] connectWallet:", e);
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
    removeStoredJwt();
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
          setStoredJwt(urlToken);
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

        const stored = getStoredJwt();

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
          removeStoredJwt();
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

  const value = useMemo<AuthwardsContextValue>(
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
    <AuthwardsContext.Provider value={value}>
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
    </AuthwardsContext.Provider>
  );
}
