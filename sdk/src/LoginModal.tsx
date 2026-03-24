import type { CSSProperties, MouseEvent, ReactElement } from "react";
import { useCallback, useState } from "react";

export type LoginModalProps = {
  isOpen: boolean;
  onClose: () => void;
  backendUrl: string;
  connectWallet: () => Promise<void>;
  showTelegram: boolean;
  onTelegramLogin: () => void;
  telegramError: string | null;
  iotaWalletDownloadUrl: string;
};

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0, 0, 0, 0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  padding: 24,
  fontFamily: "system-ui, sans-serif",
};

const cardStyle: CSSProperties = {
  backgroundColor: "#14151c",
  color: "#e8eaef",
  borderRadius: 14,
  padding: "28px 28px 24px",
  maxWidth: 420,
  width: "100%",
  boxShadow: "0 24px 48px rgba(0,0,0,0.45)",
  border: "1px solid rgba(255,255,255,0.06)",
};

const titleStyle: CSSProperties = {
  fontSize: "1.4rem",
  fontWeight: 700,
  margin: "0 0 8px 0",
  color: "#f4f4f5",
  letterSpacing: "-0.02em",
};

const subtitleStyle: CSSProperties = {
  fontSize: "0.92rem",
  lineHeight: 1.55,
  margin: "0 0 20px 0",
  opacity: 0.88,
  color: "#a1a1aa",
};

const oauthButtonBase: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 12,
  width: "100%",
  padding: "12px 16px",
  borderRadius: 10,
  fontSize: "0.95rem",
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "system-ui, sans-serif",
  boxSizing: "border-box",
};

const googleButtonStyle: CSSProperties = {
  ...oauthButtonBase,
  border: "1px solid #dadce0",
  backgroundColor: "#ffffff",
  color: "#1a1a1a",
};

const githubButtonStyle: CSSProperties = {
  ...oauthButtonBase,
  marginTop: 10,
  border: "1px solid #30363d",
  backgroundColor: "#24292f",
  color: "#f0f6fc",
};

const telegramButtonStyle: CSSProperties = {
  ...oauthButtonBase,
  marginTop: 10,
  border: "1px solid #2aabee",
  backgroundColor: "#229ED9",
  color: "#ffffff",
};

const walletButtonStyle: CSSProperties = {
  ...oauthButtonBase,
  marginTop: 0,
  border: "1px solid rgba(110, 231, 183, 0.45)",
  backgroundColor: "rgba(110, 231, 183, 0.08)",
  color: "#6ee7b7",
};

const separatorWrap: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  margin: "18px 0 14px",
};

const separatorLine: CSSProperties = {
  flex: 1,
  height: 1,
  background: "rgba(255,255,255,0.12)",
};

const footnoteStyle: CSSProperties = {
  margin: "16px 0 0 0",
  fontSize: "0.78rem",
  opacity: 0.65,
  textAlign: "center",
  lineHeight: 1.45,
  color: "#71717a",
};

function GoogleIcon(): ReactElement {
  const svgStyle: CSSProperties = { flexShrink: 0 };
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden style={svgStyle}>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.58 37.88 46.98 31.75 46.98 24.55z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function GitHubIcon(): ReactElement {
  const svgStyle: CSSProperties = { flexShrink: 0 };
  return (
    <svg width="20" height="20" viewBox="0 0 98 96" aria-hidden style={svgStyle}>
      <path
        fill="currentColor"
        d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"
      />
    </svg>
  );
}

function TelegramIcon(): ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden style={{ flexShrink: 0 }}>
      <path
        fill="currentColor"
        d="M21.94 7.17L2.32 15.51c-1.02.46-1.01 1.1-.18 1.38l5.2 1.62 2 6.13c.26.8.47 1.12 1.06 1.12.43 0 .62-.2.86-.44l2.43-2.36 5.07 3.72c.93.51 1.6.24 1.84-.85l3.32-15.64c.34-1.35-.51-1.96-1.4-1.56z"
      />
    </svg>
  );
}

function WalletGlyph(): ReactElement {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden style={{ flexShrink: 0 }}>
      <path
        d="M4 6a2 2 0 012-2h11a2 2 0 012 2v2H4V6z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M4 10h16v8a2 2 0 01-2 2H6a2 2 0 01-2-2v-8z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="17" cy="14" r="1.2" fill="currentColor" />
    </svg>
  );
}

export function LoginModal({
  isOpen,
  onClose,
  backendUrl,
  connectWallet,
  showTelegram,
  onTelegramLogin,
  telegramError,
  iotaWalletDownloadUrl,
}: LoginModalProps): ReactElement | null {
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletErr, setWalletErr] = useState<string | null>(null);

  const base = backendUrl.replace(/\/+$/, "");

  const handleGoogle = useCallback(() => {
    const returnTo = encodeURIComponent(window.location.href);
    window.location.href = `${base}/auth/google?return_to=${returnTo}`;
  }, [base]);

  const handleGitHub = useCallback(() => {
    const returnTo = encodeURIComponent(window.location.href);
    window.location.href = `${base}/auth/github?return_to=${returnTo}`;
  }, [base]);

  const handleWallet = useCallback(async () => {
    setWalletErr(null);
    setWalletBusy(true);
    try {
      await connectWallet();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "NO_WALLET" || msg.includes("NO_WALLET")) {
        setWalletErr("WALLET_MISSING");
      } else {
        setWalletErr(msg.slice(0, 200));
      }
    } finally {
      setWalletBusy(false);
    }
  }, [connectWallet, onClose]);

  if (!isOpen) return null;

  function handleOverlayClick(): void {
    onClose();
  }

  function handleCardClick(e: MouseEvent<HTMLDivElement>): void {
    e.stopPropagation();
  }

  return (
    <div style={overlayStyle} onClick={handleOverlayClick} role="presentation">
      <div
        style={cardStyle}
        onClick={handleCardClick}
        role="dialog"
        aria-modal="true"
        aria-labelledby="iota-auth-login-title"
      >
        <h2 id="iota-auth-login-title" style={titleStyle}>
          Accedi a IOTA
        </h2>
        <p style={subtitleStyle}>
          Scegli come accedere. La tua identità decentralizzata viene creata automaticamente.
        </p>

        <button type="button" style={googleButtonStyle} onClick={handleGoogle}>
          <GoogleIcon />
          <span>Sign in with Google</span>
        </button>
        <button type="button" style={githubButtonStyle} onClick={handleGitHub}>
          <GitHubIcon />
          <span>Sign in with GitHub</span>
        </button>

        {showTelegram ? (
          <>
            <button type="button" style={telegramButtonStyle} onClick={onTelegramLogin}>
              <TelegramIcon />
              <span>Sign in with Telegram</span>
            </button>
            {telegramError ? (
              <p style={{ color: "#f87171", fontSize: "0.8rem", marginTop: 10 }}>{telegramError}</p>
            ) : null}
          </>
        ) : null}

        <div style={separatorWrap}>
          <div style={separatorLine} />
          <span style={{ fontSize: "0.75rem", color: "#71717a", textTransform: "lowercase" }}>oppure</span>
          <div style={separatorLine} />
        </div>

        <button
          type="button"
          style={walletButtonStyle}
          onClick={() => void handleWallet()}
          disabled={walletBusy}
        >
          <WalletGlyph />
          <span>{walletBusy ? "Connessione…" : "Connect IOTA Wallet"}</span>
        </button>
        {walletErr === "WALLET_MISSING" ? (
          <p style={{ marginTop: 10, fontSize: "0.82rem", lineHeight: 1.45, color: "#a1a1aa" }}>
            Wallet IOTA non trovato.{" "}
            <a href={iotaWalletDownloadUrl} target="_blank" rel="noreferrer" style={{ color: "#6ee7b7" }}>
              Installa il wallet IOTA
            </a>{" "}
            per continuare.
          </p>
        ) : walletErr ? (
          <p style={{ marginTop: 10, fontSize: "0.82rem", color: "#f87171" }}>{walletErr}</p>
        ) : null}

        <p style={footnoteStyle}>
          Il tuo wallet e la tua identità sono tuoi. Puoi usarli su qualsiasi dApp IOTA.
        </p>
      </div>
    </div>
  );
}
