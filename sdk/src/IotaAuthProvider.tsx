import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

import type { User } from "./types";

const SESSION_KEY = "iota-auth:jwt";

export type IotaAuthContextValue = {
  backendUrl: string;
  user: User | null;
  token: string | null;
  loading: boolean;
  login: () => void;
  logout: () => void;
};

export const IotaAuthContext = createContext<IotaAuthContextValue | null>(null);

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

export type IotaAuthProviderProps = {
  backendUrl: string;
  children: ReactNode;
};

export function IotaAuthProvider({ backendUrl, children }: IotaAuthProviderProps): ReactElement {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const login = useCallback(() => {
    const returnTo = encodeURIComponent(window.location.href);
    window.location.href = `${trimTrailingSlash(backendUrl)}/auth/google?return_to=${returnTo}`;
  }, [backendUrl]);

  const logout = useCallback(() => {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {
      console.error("[@iota-auth/sdk] sessionStorage remove failed:", e);
    }
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap(): Promise<void> {
      try {
        const params = new URLSearchParams(window.location.search);
        const urlToken = params.get("token");
        if (urlToken) {
          sessionStorage.setItem(SESSION_KEY, urlToken);
          params.delete("token");
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
      backendUrl: trimTrailingSlash(backendUrl),
      user,
      token,
      loading,
      login,
      logout,
    }),
    [backendUrl, user, token, loading, login, logout],
  );

  return <IotaAuthContext.Provider value={value}>{children}</IotaAuthContext.Provider>;
}
