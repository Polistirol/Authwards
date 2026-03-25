import type { CSSProperties, ReactElement } from "react";
import { useCallback, useMemo, useState } from "react";

import { useIotaAuth } from "./useIotaAuth";

const ACCENT = "#6ee7b7";

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0, 0, 0, 0.6)",
  backdropFilter: "blur(2px)",
  WebkitBackdropFilter: "blur(2px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1100,
  padding: 16,
  fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
};

const cardStyle: CSSProperties = {
  backgroundColor: "#12131a",
  color: "#e8eaef",
  borderRadius: 16,
  padding: 32,
  maxWidth: 520,
  width: "100%",
  maxHeight: "min(92vh, 900px)",
  overflowY: "auto",
  boxShadow: "0 24px 48px rgba(0,0,0,0.45)",
  border: "1px solid #2a2d3a",
  boxSizing: "border-box",
};

function truncateMiddle(s: string, head = 14, tail = 10): string {
  if (s.length <= head + tail + 3) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

function MaskedPhrase({ phrase, revealed }: { phrase: string; revealed: boolean }): ReactElement {
  const masked = useMemo(() => "•".repeat(Math.max(phrase.length, 1)), [phrase.length]);

  return (
    <div style={{ position: "relative", minHeight: "3.5rem", width: "100%" }}>
      <p
        style={{
          fontFamily: "ui-monospace, monospace",
          fontSize: 14,
          lineHeight: 1.6,
          wordBreak: "break-all",
          whiteSpace: "pre-wrap",
          margin: 0,
          position: revealed ? "absolute" : "relative",
          inset: 0,
          opacity: revealed ? 0 : 1,
          pointerEvents: revealed ? "none" : "auto",
        }}
        aria-hidden={revealed}
      >
        {masked}
      </p>
      <p
        style={{
          fontFamily: "ui-monospace, monospace",
          fontSize: 14,
          lineHeight: 1.6,
          wordBreak: "break-all",
          whiteSpace: "pre-wrap",
          margin: 0,
          color: "#e2e4ed",
          position: revealed ? "relative" : "absolute",
          inset: 0,
          opacity: revealed ? 1 : 0,
          pointerEvents: revealed ? "auto" : "none",
        }}
      >
        {phrase}
      </p>
    </div>
  );
}

export function WelcomeModal(): ReactElement | null {
  const {
    isFirstLogin,
    recoveryPhrase,
    did,
    walletAddress,
    acknowledgeFirstLogin,
  } = useIotaAuth();

  const [revealed, setRevealed] = useState(false);
  const [savedConfirm, setSavedConfirm] = useState(false);
  const [copyPhraseOk, setCopyPhraseOk] = useState(false);
  const [copyDidOk, setCopyDidOk] = useState(false);
  const [copyWalletOk, setCopyWalletOk] = useState(false);

  const phrase = recoveryPhrase ?? "";
  const show = isFirstLogin && Boolean(recoveryPhrase);

  const copyPhrase = useCallback(async () => {
    if (!phrase) return;
    try {
      await navigator.clipboard.writeText(phrase);
      setCopyPhraseOk(true);
      window.setTimeout(() => setCopyPhraseOk(false), 2000);
    } catch {
      /* ignore */
    }
  }, [phrase]);

  const copyDidVal = useCallback(async () => {
    if (!did) return;
    try {
      await navigator.clipboard.writeText(did);
      setCopyDidOk(true);
      window.setTimeout(() => setCopyDidOk(false), 2000);
    } catch {
      /* ignore */
    }
  }, [did]);

  const copyWalletVal = useCallback(async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopyWalletOk(true);
      window.setTimeout(() => setCopyWalletOk(false), 2000);
    } catch {
      /* ignore */
    }
  }, [walletAddress]);

  if (!show) return null;

  const sectionBox: CSSProperties = {
    marginTop: 24,
    borderRadius: 12,
    border: "1px solid #2a2d3a",
    backgroundColor: "#161821",
    padding: 20,
  };

  const labelMuted: CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "#64748b",
    margin: 0,
  };

  const smallBtn: CSSProperties = {
    flexShrink: 0,
    borderRadius: 8,
    border: "1px solid #2a2d3a",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 600,
    color: ACCENT,
    cursor: "pointer",
  };

  return (
    <div style={overlayStyle} role="presentation" onClick={(e) => e.stopPropagation()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="iota-auth-welcome-title"
        aria-describedby="iota-auth-welcome-desc"
        style={cardStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <header style={{ textAlign: "center" }}>
          <div
            style={{
              margin: "0 auto",
              display: "flex",
              height: 64,
              width: 64,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
              backgroundColor: "rgba(110, 231, 183, 0.15)",
            }}
          >
            <svg width={36} height={36} fill="none" viewBox="0 0 24 24" stroke={ACCENT} strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1
            id="iota-auth-welcome-title"
            style={{
              marginTop: 20,
              marginBottom: 0,
              fontSize: "1.5rem",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "#ffffff",
            }}
          >
            Welcome to IOTA
          </h1>
          <p id="iota-auth-welcome-desc" style={{ marginTop: 8, fontSize: 14, color: "#94a3b8" }}>
            Your decentralized identity has been created
          </p>
        </header>

        <section style={sectionBox}>
          <p style={labelMuted}>Your DID</p>
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <code style={{ wordBreak: "break-all", fontSize: 14, color: ACCENT, fontFamily: "ui-monospace, monospace" }}>
              {did ? truncateMiddle(did) : "—"}
            </code>
            <button
              type="button"
              onClick={() => void copyDidVal()}
              disabled={!did}
              style={{
                ...smallBtn,
                opacity: did ? 1 : 0.4,
                cursor: did ? "pointer" : "not-allowed",
              }}
            >
              {copyDidOk ? "Copied ✓" : "Copy"}
            </button>
          </div>

          <p style={{ ...labelMuted, marginTop: 20 }}>Your wallet</p>
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <code style={{ wordBreak: "break-all", fontSize: 14, color: ACCENT, fontFamily: "ui-monospace, monospace" }}>
              {walletAddress ? truncateMiddle(walletAddress) : "—"}
            </code>
            <button
              type="button"
              onClick={() => void copyWalletVal()}
              disabled={!walletAddress}
              style={{
                ...smallBtn,
                opacity: walletAddress ? 1 : 0.4,
                cursor: walletAddress ? "pointer" : "not-allowed",
              }}
            >
              {copyWalletOk ? "Copied ✓" : "Copy"}
            </button>
          </div>

          <p style={{ marginTop: 16, marginBottom: 0, fontSize: 12, lineHeight: 1.55, color: "#64748b" }}>
            These are yours. You can use them on any IOTA dApp, including outside this app.
          </p>
        </section>

        <section
          style={{
            ...sectionBox,
            marginTop: 24,
            borderLeftWidth: 3,
            borderLeftStyle: "solid",
            borderLeftColor: "#fbbf24",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#ffffff" }}>Your recovery key</h2>

          <div
            style={{
              marginTop: 16,
              display: "flex",
              gap: 12,
              borderRadius: 8,
              backgroundColor: "rgba(251, 191, 36, 0.1)",
              padding: 12,
            }}
          >
            <span style={{ fontSize: 18, lineHeight: 1, color: "#fbbf24" }} aria-hidden>
              ⚠
            </span>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "#cbd5e1" }}>
              This is the only time you will see this key. Save it in a secure place. Use this key to
              import your wallet into the official IOTA wallet and use it anywhere.
            </p>
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <div
              style={{
                minWidth: 0,
                flex: 1,
                borderRadius: 8,
                border: "1px solid rgba(110, 231, 183, 0.35)",
                backgroundColor: "#0a0b0f",
                padding: "12px 12px",
              }}
            >
              <MaskedPhrase phrase={phrase} revealed={revealed} />
            </div>
            <button
              type="button"
              onClick={() => setRevealed((r) => !r)}
              style={{
                height: 44,
                width: 44,
                flexShrink: 0,
                borderRadius: 8,
                border: "1px solid #2a2d3a",
                backgroundColor: "rgba(255,255,255,0.05)",
                fontSize: 18,
                lineHeight: 1,
                color: "#e2e4ed",
                cursor: "pointer",
              }}
              title={revealed ? "Hide" : "Show"}
              aria-label={revealed ? "Hide phrase" : "Show phrase"}
            >
              👁
            </button>
          </div>

          <button
            type="button"
            onClick={() => void copyPhrase()}
            style={{
              marginTop: 12,
              width: "100%",
              borderRadius: 8,
              border: "1px solid #2a2d3a",
              backgroundColor: "rgba(255,255,255,0.05)",
              padding: "10px 16px",
              fontSize: 14,
              fontWeight: 600,
              color: ACCENT,
              cursor: "pointer",
            }}
          >
            {copyPhraseOk ? "Copied ✓" : "Copy"}
          </button>
        </section>

        <footer style={{ marginTop: 24, borderTop: "1px solid #2a2d3a", paddingTop: 24 }}>
          <label style={{ display: "flex", gap: 12, cursor: "pointer", fontSize: 14, color: "#cbd5e1" }}>
            <input
              type="checkbox"
              checked={savedConfirm}
              onChange={(e) => setSavedConfirm(e.target.checked)}
              style={{
                marginTop: 2,
                width: 16,
                height: 16,
                flexShrink: 0,
                accentColor: ACCENT,
              }}
            />
            <span>I have saved my recovery key</span>
          </label>

          <button
            type="button"
            disabled={!savedConfirm}
            onClick={() => acknowledgeFirstLogin()}
            style={{
              marginTop: 12,
              width: "100%",
              borderRadius: 12,
              border: "none",
              padding: "14px 16px",
              fontSize: 14,
              fontWeight: 600,
              backgroundColor: savedConfirm ? ACCENT : "#475569",
              color: savedConfirm ? "#0a0b0f" : "#94a3b8",
              cursor: savedConfirm ? "pointer" : "not-allowed",
            }}
          >
            Get started
          </button>
        </footer>
      </div>
    </div>
  );
}
