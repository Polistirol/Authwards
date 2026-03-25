export { AuthwardsProvider } from "./src/AuthwardsProvider";
export type { AuthwardsProviderProps } from "./src/AuthwardsProvider";

export { AuthwardsContext } from "./src/AuthwardsContext";
export type { AuthwardsContextValue } from "./src/AuthwardsContext";

export { useAuthwards } from "./src/useAuthwards";
export type { UseAuthwardsResult } from "./src/useAuthwards";

export { useWallet } from "./src/useWallet";
export type { UseWalletResult, WalletBalanceResponse } from "./src/useWallet";

export { useAgent } from "./src/useAgent";
export type { CreateAgentInput, CreateAgentResult, UseAgentResult } from "./src/useAgent";

export { LoginModal } from "./src/LoginModal";
export type { LoginModalProps } from "./src/LoginModal";

export { WelcomeModal } from "./src/WelcomeModal";

export { ConnectButton } from "./src/ConnectButton";
export type { ConnectButtonProps } from "./src/ConnectButton";

export type {
  AuthProviderType,
  AuthwardsConfig,
  User,
  Agent,
  AgentLog,
  AgentStatus,
  AgentTaskConfig,
} from "./src/types";

/** @deprecated Use `AuthwardsProvider`. */
export { AuthwardsProvider as IotaAuthProvider } from "./src/AuthwardsProvider";
/** @deprecated Use `AuthwardsProviderProps`. */
export type { AuthwardsProviderProps as IotaAuthProviderProps } from "./src/AuthwardsProvider";

/** @deprecated Use `AuthwardsContext`. */
export { AuthwardsContext as IotaAuthContext } from "./src/AuthwardsContext";
/** @deprecated Use `AuthwardsContextValue`. */
export type { AuthwardsContextValue as IotaAuthContextValue } from "./src/AuthwardsContext";

/** @deprecated Use `useAuthwards`. */
export { useAuthwards as useIotaAuth } from "./src/useAuthwards";
/** @deprecated Use `UseAuthwardsResult`. */
export type { UseAuthwardsResult as UseIotaAuthResult } from "./src/useAuthwards";
