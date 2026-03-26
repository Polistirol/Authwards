/**
 * Default Authwards SDK UI tokens (dashboard / TraceFlow: deep blue + amber).
 * Used by ConnectButton, LoginModal, WelcomeModal.
 */
export const AUTHWARDS_UI = {
  accent: "#f59e0b",
  accentHover: "#fbbf24",
  onAccent: "#0c1220",
  bg: "#0c1220",
  panel: "#121c2e",
  surface: "#1e293b",
  inset: "#0f172a",
  border: "#334155",
  text: "#e2e8f0",
  muted: "#94a3b8",
} as const;

/** rgba() tints for borders / backgrounds on dark UI */
export const AUTHWARDS_UI_RGBA = {
  accent08: "rgba(245, 158, 11, 0.08)",
  accent15: "rgba(245, 158, 11, 0.15)",
  accent35: "rgba(245, 158, 11, 0.35)",
  accent45: "rgba(245, 158, 11, 0.45)",
} as const;
