import type { CSSProperties, MouseEvent, ReactElement } from "react";

import { useIotaAuth } from "./useIotaAuth";

export type LoginModalProps = {
  isOpen: boolean;
  onClose: () => void;
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
  backgroundColor: "#1a1c26",
  color: "#e2e4ed",
  borderRadius: 12,
  padding: "28px 32px",
  maxWidth: 420,
  width: "100%",
  boxShadow: "0 24px 48px rgba(0,0,0,0.35)",
};

const titleStyle: CSSProperties = {
  fontSize: "1.35rem",
  fontWeight: 700,
  margin: "0 0 8px 0",
  color: "#6ee7b7",
  letterSpacing: "-0.02em",
};

const subtitleStyle: CSSProperties = {
  fontSize: "0.95rem",
  lineHeight: 1.55,
  margin: "0 0 24px 0",
  opacity: 0.92,
};

const googleButtonStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 12,
  width: "100%",
  padding: "12px 16px",
  borderRadius: 8,
  border: "1px solid #dadce0",
  backgroundColor: "#ffffff",
  color: "#3c4043",
  fontSize: "0.95rem",
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "system-ui, sans-serif",
  boxSizing: "border-box",
};

const footnoteStyle: CSSProperties = {
  margin: "14px 0 0 0",
  fontSize: "0.78rem",
  opacity: 0.65,
  textAlign: "center",
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

export function LoginModal({ isOpen, onClose }: LoginModalProps): ReactElement | null {
  const { login } = useIotaAuth();

  if (!isOpen) return null;

  function handleOverlayClick(): void {
    onClose();
  }

  function handleCardClick(e: MouseEvent<HTMLDivElement>): void {
    e.stopPropagation();
  }

  function handleGoogleClick(): void {
    login();
  }

  return (
    <div style={overlayStyle} onClick={handleOverlayClick} role="presentation">
      <div style={cardStyle} onClick={handleCardClick} role="dialog" aria-modal="true" aria-labelledby="iota-auth-login-title">
        <h2 id="iota-auth-login-title" style={titleStyle}>
          IOTA Auth
        </h2>
        <p style={subtitleStyle}>
          Accedi con il tuo account Google per ottenere la tua identità decentralizzata su IOTA.
        </p>
        <button type="button" style={googleButtonStyle} onClick={handleGoogleClick}>
          <GoogleIcon />
          <span style={{ color: "#4285F4" }}>Sign in with Google</span>
        </button>
        <p style={footnoteStyle}>Nessun wallet necessario.</p>
      </div>
    </div>
  );
}
