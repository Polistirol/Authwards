export {
  AuthwardsProvider,
  ConnectButton,
  LoginModal,
  useAgent,
  useAuthwards,
  useWallet,
} from "../../sdk";

export type {
  Agent,
  AgentLog,
  AgentStatus,
  CreateAgentInput,
  CreateAgentResult,
  AuthwardsConfig,
  User,
  ConnectButtonProps,
  UseWalletResult,
} from "../../sdk";

/** @deprecated Use `AuthwardsProvider`. */
export { AuthwardsProvider as IotaAuthProvider } from "../../sdk";
/** @deprecated Use `useAuthwards`. */
export { useAuthwards as useIotaAuth } from "../../sdk";
/** @deprecated Use `AuthwardsConfig`. */
export type { AuthwardsConfig as IotaAuthConfig } from "../../sdk";
