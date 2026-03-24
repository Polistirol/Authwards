import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";

import { useIotaAuth } from "./useIotaAuth";
import { useWallet } from "./useWallet";
import type { AuthProviderType, User } from "./types";

const ACCENT = "#6ee7b7";
const DROPDOWN_MIN_WIDTH = 300;
const DROPDOWN_Z = 9999;
/** Explorer IOTA (path `/address/`, `/object/`). */
const IOTA_EXPLORER_ORIGIN = "https://explorer.iota.org";

export type ConnectButtonProps = {
  label?: string;
  theme?: "dark" | "light";
  size?: "sm" | "md" | "lg";
  /** URL dashboard / frontend (es. `FRONTEND_URL` / `VITE_FRONTEND_URL`). */
  dashboardUrl?: string;
  /**
   * Stesso uso di `dashboardUrl` (preferito se imposti `FRONTEND_URL` in .env).
   * In apertura viene aggiunto `?token=` (JWT) così la dashboard usa `IotaAuthProvider` già autenticata.
   */
  frontendUrl?: string;
  showBalance?: boolean;
  /** Dopo un login effettivo (non al ripristino sessione). */
  onConnect?: (user: User) => void;
  onDisconnect?: () => void;
  /** Link “Powered by IOTA Auth” nel footer del menu. */
  landingUrl?: string;
};

function truncateDidShort(did: string): string {
  if (did.length <= 10) return did;
  return `${did.slice(0, 6)}…${did.slice(-4)}`;
}

function truncateAddress(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function formatIotaFromNanos(nanosStr: string | null): string {
  if (!nanosStr) return "—";
  try {
    const n = BigInt(nanosStr);
    const iota = Number(n) / 1e9;
    if (!Number.isFinite(iota)) return "—";
    return `${iota.toFixed(2)} IOTA`;
  } catch {
    return "—";
  }
}

function explorerWalletUrl(address: string): string {
  return `${IOTA_EXPLORER_ORIGIN}/address/${encodeURIComponent(address)}`;
}

/** Estrae l’identificativo oggetto `0x…` dal DID (senza `did:iota:…`). */
function extractObjectHexFromDid(did: string): string | null {
  const m = did.match(/(0x[a-fA-F0-9]+)/);
  return m ? m[1] : null;
}

function explorerDidObjectUrl(objectHex: string): string {
  return `${IOTA_EXPLORER_ORIGIN}/object/${encodeURIComponent(objectHex)}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Allinea al bootstrap di `IotaAuthProvider` (`?token=` → sessione sulla destinazione). */
function appendSessionTokenToUrl(href: string, jwt: string | null): string {
  if (!jwt?.trim()) return href;
  try {
    const u = new URL(href, typeof window !== "undefined" ? window.location.href : undefined);
    u.searchParams.set("token", jwt);
    return u.toString();
  } catch {
    return href;
  }
}

function ProviderBadge({ type }: { type: AuthProviderType }): ReactElement {
  const common: CSSProperties = { width: 14, height: 14, flexShrink: 0 };
  if (type === "google") {
    return (
      <svg viewBox="0 0 24 24" style={common} aria-hidden>
        <path
          fill="#4285F4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        />
        <path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <path
          fill="#FBBC05"
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        />
        <path
          fill="#EA4335"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        />
      </svg>
    );
  }
  if (type === "github") {
    return (
      <svg viewBox="0 0 24 24" style={{ ...common, fill: "#e8eaef" }} aria-hidden>
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
      </svg>
    );
  }
  if (type === "telegram") {
    return (
      <svg viewBox="0 0 24 24" style={{ ...common, fill: "#2aabee" }} aria-hidden>
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
    );
  }
  /* wallet */
  return (
    <svg viewBox="0 0 24 24" style={{ ...common, fill: ACCENT }} aria-hidden>
      <path d="M21 7.28V5c0-1.1-.9-2-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2.28A2 2 0 0 0 22 15v-6a2 2 0 0 0-1-1.72zM20 9v6h-7V9h7zM5 5h14v2h-6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h6v2H5V5z" />
      <path d="M16 12h2v2h-2z" />
    </svg>
  );
}

const sizeStyles: Record<
  NonNullable<ConnectButtonProps["size"]>,
  { padding: string; fontSize: string; avatar: number; gap: number }
> = {
  sm: { padding: "8px 14px", fontSize: "13px", avatar: 28, gap: 8 },
  md: { padding: "10px 18px", fontSize: "14px", avatar: 32, gap: 10 },
  lg: { padding: "12px 22px", fontSize: "15px", avatar: 36, gap: 12 },
};

export function ConnectButton({
  label = "Connect",
  theme = "dark",
  size = "md",
  dashboardUrl,
  frontendUrl,
  showBalance = true,
  onConnect,
  onDisconnect,
  landingUrl,
}: ConnectButtonProps): ReactElement {
  const {
    user,
    did,
    walletAddress,
    isAuthenticated,
    loading: authLoading,
    login,
    logout,
    token,
  } = useIotaAuth();
  const { loading: balanceLoading, balance, getBalance } = useWallet();

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuMounted, setMenuMounted] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [copyDidFeedback, setCopyDidFeedback] = useState(false);
  const [copyAddrFeedback, setCopyAddrFeedback] = useState(false);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const authReady = useRef(false);
  const prevAuth = useRef(false);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });

  const sz = sizeStyles[size];
  const manageIdentitiesUrl = useMemo(
    () => (frontendUrl ?? dashboardUrl)?.trim() || undefined,
    [frontendUrl, dashboardUrl],
  );
  const didObjectHex = useMemo(() => (did ? extractObjectHexFromDid(did) : null), [did]);

  const palette = useMemo(() => {
    if (theme === "light") {
      return {
        surface: "#f4f4f5",
        surface2: "#ffffff",
        border: "rgba(0,0,0,0.1)",
        text: "#18181b",
        muted: "#71717a",
        hoverOverlay: "rgba(0,0,0,0.04)",
        dropdownBg: "#ffffff",
        dropdownBorder: "rgba(0,0,0,0.12)",
      };
    }
    return {
      surface: "#1e293b",
      surface2: "#0f172a",
      border: "rgba(255,255,255,0.12)",
      text: "#f1f5f9",
      muted: "#94a3b8",
      hoverOverlay: "rgba(255,255,255,0.06)",
      dropdownBg: "#14151c",
      dropdownBorder: "rgba(255,255,255,0.1)",
    };
  }, [theme]);

  /* onConnect: solo transizione reale post-bootstrap */
  useEffect(() => {
    if (authLoading) return;
    if (!authReady.current) {
      authReady.current = true;
      prevAuth.current = isAuthenticated;
      return;
    }
    if (!prevAuth.current && isAuthenticated && user) {
      onConnect?.(user);
    }
    prevAuth.current = isAuthenticated;
  }, [authLoading, isAuthenticated, user, onConnect]);

  useEffect(() => {
    if (!isAuthenticated || !walletAddress) return;
    void getBalance(walletAddress);
  }, [isAuthenticated, walletAddress, getBalance]);

  const updatePanelPos = useCallback(() => {
    const el = buttonRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const panelW = DROPDOWN_MIN_WIDTH;
    const left = Math.min(
      Math.max(8, rect.right - panelW),
      window.innerWidth - panelW - 8,
    );
    setPanelPos({ top: rect.bottom + 8, left });
  }, []);

  useLayoutEffect(() => {
    if (!menuMounted) return;
    updatePanelPos();
    const onWin = (): void => {
      updatePanelPos();
    };
    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, true);
    return () => {
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
    };
  }, [menuMounted, updatePanelPos]);

  useEffect(() => {
    if (menuOpen) {
      setMenuMounted(true);
      requestAnimationFrame(() => {
        setMenuVisible(true);
        updatePanelPos();
      });
    } else {
      setMenuVisible(false);
      const t = window.setTimeout(() => setMenuMounted(false), 120);
      return () => clearTimeout(t);
    }
  }, [menuOpen, updatePanelPos]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: globalThis.MouseEvent): void => {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const handleLogout = (): void => {
    setMenuOpen(false);
    logout();
    onDisconnect?.();
  };

  const handleCopyDid = async (): Promise<void> => {
    if (!did) return;
    const ok = await copyText(did);
    if (ok) {
      setCopyDidFeedback(true);
      window.setTimeout(() => setCopyDidFeedback(false), 1600);
    }
  };

  const handleCopyAddr = async (): Promise<void> => {
    if (!walletAddress) return;
    const ok = await copyText(walletAddress);
    if (ok) {
      setCopyAddrFeedback(true);
      window.setTimeout(() => setCopyAddrFeedback(false), 1600);
    }
  };

  const openManageIdentities = (): void => {
    if (!manageIdentitiesUrl) return;
    setMenuOpen(false);
    const url = appendSessionTokenToUrl(manageIdentitiesUrl, token);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const openExplorerDidObject = (): void => {
    if (!didObjectHex) return;
    window.open(explorerDidObjectUrl(didObjectHex), "_blank", "noopener,noreferrer");
  };

  const openExplorerAddr = (): void => {
    if (!walletAddress) return;
    window.open(explorerWalletUrl(walletAddress), "_blank", "noopener,noreferrer");
  };

  const toggleMenu = (e: MouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation();
    if (!isAuthenticated) return;
    setMenuOpen((o) => !o);
  };

  const disconnectedButtonStyle: CSSProperties = useMemo(
    () => ({
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: sz.gap,
      padding: sz.padding,
      fontSize: sz.fontSize,
      fontWeight: 600,
      fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
      borderRadius: 12,
      border: "none",
      cursor: authLoading ? "wait" : "pointer",
      backgroundColor: ACCENT,
      color: "#0f172a",
      boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
      opacity: authLoading ? 0.75 : 1,
      transition: "filter 120ms ease, opacity 120ms ease",
    }),
    [authLoading, sz.fontSize, sz.gap, sz.padding],
  );

  const connectedButtonStyle: CSSProperties = useMemo(
    () => ({
      display: "inline-flex",
      alignItems: "center",
      gap: sz.gap,
      padding: sz.padding,
      fontSize: sz.fontSize,
      fontWeight: 600,
      fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
      borderRadius: 12,
      cursor: "pointer",
      backgroundColor: palette.surface,
      color: palette.text,
      border: `1px solid ${palette.border}`,
      boxSizing: "border-box",
      maxWidth: 280,
      transition: "background-color 120ms ease, border-color 120ms ease",
    }),
    [palette.border, palette.surface, palette.text, sz.fontSize, sz.gap, sz.padding],
  );

  if (!isAuthenticated) {
    return (
      <button
        type="button"
        disabled={authLoading}
        onClick={() => login()}
        onMouseEnter={(e) => {
          if (!authLoading) e.currentTarget.style.filter = "brightness(1.08)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.filter = "none";
        }}
        style={disconnectedButtonStyle}
      >
        {authLoading ? "…" : label}
      </button>
    );
  }

  const displayDid = did ? truncateDidShort(did) : "—";
  const displayName = user?.name?.trim() || "Utente";

  const dropdown = menuMounted ? (
    <div
      ref={panelRef}
      role="menu"
      style={{
        position: "fixed",
        top: panelPos.top,
        left: panelPos.left,
        minWidth: DROPDOWN_MIN_WIDTH,
        maxWidth: 360,
        zIndex: DROPDOWN_Z,
        backgroundColor: palette.dropdownBg,
        color: palette.text,
        border: `1px solid ${palette.dropdownBorder}`,
        borderRadius: 14,
        boxShadow: "0 20px 50px rgba(0,0,0,0.45)",
        padding: "16px 0 12px",
        fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
        opacity: menuVisible ? 1 : 0,
        transform: menuVisible ? "translateY(0)" : "translateY(-6px)",
        transition: menuVisible
          ? "opacity 150ms ease, transform 150ms ease"
          : "opacity 100ms ease, transform 100ms ease",
        pointerEvents: menuVisible ? "auto" : "none",
      }}
    >
      <div style={{ padding: "0 16px 14px" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          {user?.picture ? (
            <img
              src={user.picture}
              alt=""
              width={48}
              height={48}
              style={{ borderRadius: "50%", objectFit: "cover", border: `1px solid ${palette.border}` }}
            />
          ) : (
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                backgroundColor: palette.surface,
                border: `1px solid ${palette.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
                fontWeight: 700,
                color: palette.muted,
              }}
            >
              {initialsFromName(displayName)}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.25 }}>{displayName}</div>
            {user?.email ? (
              <div style={{ fontSize: 12, color: palette.muted, marginTop: 4 }}>{user.email}</div>
            ) : null}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
              {user ? <ProviderBadge type={user.providerType} /> : null}
              <span style={{ fontSize: 11, color: palette.muted, textTransform: "capitalize" }}>
                {user?.providerType === "wallet"
                  ? "Wallet"
                  : user?.providerType === "telegram"
                    ? "Telegram"
                    : user?.providerType}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          height: 1,
          background: palette.border,
          margin: "0 16px",
        }}
      />

      <div style={{ padding: "14px 16px 10px" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: palette.muted, marginBottom: 8 }}>Wallet</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
            {walletAddress ? truncateAddress(walletAddress) : "—"}
          </span>
          {walletAddress ? (
            <button
              type="button"
              onClick={() => void handleCopyAddr()}
              style={{
                border: "none",
                background: "transparent",
                color: ACCENT,
                fontSize: 11,
                cursor: "pointer",
                padding: 0,
              }}
            >
              {copyAddrFeedback ? "Copiato!" : "Copia"}
            </button>
          ) : null}
          {walletAddress ? (
            <button
              type="button"
              onClick={openExplorerAddr}
              title="Explorer"
              style={{
                border: "none",
                background: "transparent",
                padding: 2,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                color: palette.muted,
              }}
              aria-label="Apri indirizzo su IOTA Explorer"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z" />
              </svg>
            </button>
          ) : null}
        </div>
        {showBalance ? (
          <div style={{ marginTop: 10, fontSize: 13, fontWeight: 600, color: palette.text }}>
            <span style={{ color: palette.muted, fontWeight: 600, marginRight: 6 }}>Balance</span>
            {balanceLoading ? (
              <span
                style={{
                  display: "inline-block",
                  verticalAlign: "middle",
                  height: 16,
                  width: 96,
                  borderRadius: 4,
                  background: `linear-gradient(90deg, ${palette.surface} 0%, ${palette.border} 50%, ${palette.surface} 100%)`,
                  backgroundSize: "200% 100%",
                  animation: "connectBtnShimmer 1.1s ease-in-out infinite",
                }}
              />
            ) : (
              formatIotaFromNanos(balance)
            )}
          </div>
        ) : null}
      </div>

      {did ? (
        <>
          <div style={{ height: 1, background: palette.border, margin: "0 16px" }} />
          <div style={{ padding: "14px 16px 10px" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: palette.muted, marginBottom: 8 }}>DID</div>
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                fontFamily: "ui-monospace, monospace",
                fontSize: 11,
                color: palette.muted,
                wordBreak: "break-all",
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>{did}</span>
              <div style={{ display: "flex", flexShrink: 0, gap: 4, alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => void handleCopyDid()}
                  style={{
                    border: "none",
                    background: "rgba(110,231,183,0.15)",
                    color: ACCENT,
                    borderRadius: 6,
                    padding: "4px 8px",
                    fontSize: 10,
                    cursor: "pointer",
                  }}
                >
                  {copyDidFeedback ? "Copiato!" : "Copia"}
                </button>
                {didObjectHex ? (
                  <button
                    type="button"
                    onClick={openExplorerDidObject}
                    title="Explorer (object)"
                    style={{
                      border: "none",
                      background: "transparent",
                      padding: 2,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      color: palette.muted,
                    }}
                    aria-label="Apri oggetto DID su IOTA Explorer"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z" />
                    </svg>
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </>
      ) : null}

      {manageIdentitiesUrl ? (
        <>
          <div style={{ height: 1, background: palette.border, margin: "0 16px" }} />
          <div style={{ padding: "8px 8px 4px" }}>
            <button
              type="button"
              role="menuitem"
              onClick={openManageIdentities}
              style={{
                width: "100%",
                textAlign: "left",
                border: "none",
                background: "transparent",
                borderRadius: 10,
                padding: "10px 12px",
                cursor: "pointer",
                color: palette.text,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                fontSize: 14,
                fontWeight: 500,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = palette.hoverOverlay;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                </svg>
                Manage identities
              </span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden style={{ flexShrink: 0, opacity: 0.75 }}>
                <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
              </svg>
            </button>
          </div>
        </>
      ) : null}

      <div style={{ height: 1, background: palette.border, margin: "8px 16px 0" }} />

      <div style={{ padding: "10px 16px 4px" }}>
        <button
          type="button"
          role="menuitem"
          onClick={handleLogout}
          style={{
            width: "100%",
            textAlign: "left",
            border: "none",
            background: "transparent",
            borderRadius: 10,
            padding: "10px 12px",
            cursor: "pointer",
            color: "#f87171",
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 14,
            fontWeight: 600,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(248,113,113,0.12)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
          </svg>
          Disconnect
        </button>
        <div style={{ marginTop: 10, textAlign: "center" }}>
          {landingUrl?.trim() ? (
            <a
              href={landingUrl.trim()}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 10, color: palette.muted, textDecoration: "none" }}
            >
              Powered by IOTA Auth
            </a>
          ) : (
            <span style={{ fontSize: 10, color: palette.muted }}>Powered by IOTA Auth</span>
          )}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <style>
        {`
          @keyframes connectBtnShimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}
      </style>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          if (!isAuthenticated) {
            login();
            return;
          }
          toggleMenu(e);
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor =
            theme === "light" ? "#e2e8f0" : "#334155";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = palette.surface;
        }}
        style={connectedButtonStyle}
      >
        {user?.picture ? (
          <img
            src={user.picture}
            alt=""
            width={sz.avatar}
            height={sz.avatar}
            style={{ borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
          />
        ) : (
          <div
            style={{
              width: sz.avatar,
              height: sz.avatar,
              borderRadius: "50%",
              backgroundColor: palette.surface2,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: sz.avatar * 0.36,
              fontWeight: 700,
              color: palette.muted,
              flexShrink: 0,
            }}
          >
            {initialsFromName(displayName)}
          </div>
        )}
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontFamily: "ui-monospace, monospace",
            fontWeight: 500,
            fontSize: Math.max(12, parseInt(sz.fontSize, 10) - 1),
          }}
        >
          {displayDid}
        </span>
      </button>
      {typeof document !== "undefined" && createPortal(dropdown, document.body)}
    </div>
  );
}
