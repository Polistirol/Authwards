# Authward SDK

## What is Authward SDK

React SDK for integrating social login, decentralized identity, and delegated identities on IOTA in any dApp.

## Quick start

1. Wrap your app with `<AuthwardsProvider>` (deprecated alias: `<IotaAuthProvider>` — same component).
2. Add `<ConnectButton />` in your navbar (or call `useAuthwards().login()` to open the built-in login modal).
3. Use `useAuthwards()` for `user`, DID, wallet address, and session state.

Minimal example:

```tsx
import {
  AuthwardsProvider,
  ConnectButton,
  useAuthwards,
} from "./index";

function App() {
  return (
    <AuthwardsProvider backendUrl="https://your-authward-instance.com">
      <Navbar />
      <MainContent />
    </AuthwardsProvider>
  );
}

function Navbar() {
  return (
    <nav>
      <h1>My dApp</h1>
      <ConnectButton />
    </nav>
  );
}

function MainContent() {
  const { user, did, walletAddress, isAuthenticated } = useAuthwards();

  if (!isAuthenticated) return <p>Connect to get started</p>;

  return (
    <div>
      <p>Welcome {user?.name}</p>
      <p>DID: {did}</p>
      <p>Wallet: {walletAddress}</p>
    </div>
  );
}
```

**Deprecated names (re-exports):** `IotaAuthProvider`, `useIotaAuth`, `IotaAuthContext`, etc. Prefer `AuthwardsProvider` and `useAuthwards`.

## Components

### `<AuthwardsProvider>`

Root provider that loads session from `sessionStorage`, handles OAuth return URLs, wallet and Telegram flows, and renders the built-in `LoginModal` and optional `WelcomeModal`.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `backendUrl` | `string` | (required) | Base URL of the Authward backend (trailing slashes are trimmed). |
| `children` | `ReactNode` | (required) | App tree. |
| `telegramLoginEnabled` | `boolean \| undefined` | `undefined` | If `true`, shows Telegram sign-in. If omitted, Telegram is shown only when `telegramBotUsername` is set (legacy). If `false`, Telegram is hidden. |
| `telegramBotUsername` | `string \| undefined` | `undefined` | **Deprecated.** Used only when `telegramLoginEnabled` is omitted, to decide if Telegram is shown. |
| `iotaWalletDownloadUrl` | `string \| undefined` | `https://wiki.iota.org/get-started/introduction/` | Link shown when no IOTA wallet extension is found during wallet login. |
| `showWelcomeModal` | `boolean \| undefined` | `true` | If `true`, first-time OAuth login can show the welcome modal (recovery phrase / DID / wallet). Set `false` for white-label; `recoveryPhrase` / `isFirstLogin` remain on context. |

**Example**

```tsx
<AuthwardsProvider
  backendUrl="https://authwards-production.up.railway.app"
  telegramLoginEnabled
  showWelcomeModal
>
  <App />
</AuthwardsProvider>
```

---

### `<ConnectButton />`

Connect / account button: when disconnected, opens the login modal (`login()` with no args). When connected, shows avatar, truncated DID, dropdown with wallet balance, DID copy/explorer links, optional “Manage delegated identities” (if `frontendUrl` or `dashboardUrl` is set), and disconnect.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string \| undefined` | `"Connect"` | Button label when not authenticated. |
| `theme` | `"dark" \| "light"` | `"dark"` | Light or dark dropdown/palette. |
| `size` | `"sm" \| "md" \| "lg"` | `"md"` | Padding, font size, and avatar size. |
| `dashboardUrl` | `string \| undefined` | `undefined` | Dashboard URL for “Manage delegated identities”; `?token=` is appended with the JWT. |
| `frontendUrl` | `string \| undefined` | `undefined` | Same purpose as `dashboardUrl` (either can be set; `frontendUrl` is preferred if both apply). |
| `showBalance` | `boolean \| undefined` | `true` | Show IOTA balance line in the dropdown when authenticated. |
| `onConnect` | `(user: User) => void \| undefined` | `undefined` | Called after a **new** login (not when restoring session from storage). |
| `onDisconnect` | `() => void \| undefined` | `undefined` | Called after logout from the menu. |
| `landingUrl` | `string \| undefined` | `undefined` | If set, “Powered by Authwards” in the footer links to this URL. |

There are no `variant`, `className`, `style`, or arbitrary color props — styling is inline and controlled via `theme` and `size`.

**Example**

```tsx
<ConnectButton size="lg" theme="dark" label="Sign in" />
```

---

### `<LoginModal />`

Low-level sign-in dialog (Google, GitHub, optional Telegram, IOTA wallet). Normally **you do not render this yourself** — `AuthwardsProvider` mounts it and drives `isOpen` / `onClose`. Export exists for advanced embedding or testing.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `isOpen` | `boolean` | — | Visibility. |
| `onClose` | `() => void` | — | Close handler. |
| `backendUrl` | `string` | — | Backend base URL. |
| `connectWallet` | `() => Promise<void>` | — | Wallet challenge/verify flow (same as context `connectWallet`). |
| `showTelegram` | `boolean` | — | Whether to show the Telegram button. |
| `onTelegramLogin` | `() => void` | — | Opens Telegram popup flow. |
| `telegramError` | `string \| null` | — | Error message under Telegram when set. |
| `iotaWalletDownloadUrl` | `string` | — | Install link if wallet is missing. |

Title and copy are fixed in the component (“Sign in to Authwards”, etc.) — **no props for title or provider list**.

---

### `<WelcomeModal />`

First-login experience: recovery phrase, DID, wallet — driven by `isFirstLogin` and `recoveryPhrase` from context. Rendered by `AuthwardsProvider` when `showWelcomeModal` is true.

**No configurable props.**

---

### `useAuthwards()`

Must be used under `AuthwardsProvider`. Throws if used outside the provider.

| Field | Type | Description |
|------|------|-------------|
| `user` | `User \| null` | Current user from `/auth/me`, or `null`. |
| `did` | `string \| undefined` | `user?.did` |
| `walletAddress` | `string \| undefined` | `user?.walletAddress` |
| `isAuthenticated` | `boolean` | `user !== null && token !== null` |
| `loading` | `boolean` | Initial session bootstrap in progress. |
| `token` | `string \| null` | JWT (also persisted in `sessionStorage`). |
| `login` | `(provider?: AuthProviderType) => void` | No arg: opens modal. `"google"` / `"github"`: redirect OAuth. `"wallet"`: extension flow. `"telegram"`: popup. |
| `loginGitHub` | `() => void` | **Deprecated.** Same as `login("github")`. |
| `connectWallet` | `() => Promise<void>` | IOTA wallet sign-in. |
| `logout` | `() => void` | Clears session and state. |
| `backendUrl` | `string` | Normalized backend URL. |
| `isFirstLogin` | `boolean` | First-login welcome flow. |
| `recoveryPhrase` | `string \| null` | Recovery phrase when returned by OAuth redirect. |
| `acknowledgeFirstLogin` | `() => void` | Dismiss welcome state after user confirms. |
| `completeSession` | `(token: string, user: User) => void` | Persist JWT after in-page wallet/Telegram login. |
| `telegramLoginEnabled` | `boolean \| undefined` | Prop echo from provider. |
| `telegramBotUsername` | `string \| undefined` | **Deprecated.** Prop echo from provider. |
| `telegramPopupError` | `string \| null` | Telegram popup error message. |
| `iotaWalletDownloadUrl` | `string` | Wallet install URL in use. |

---

### `useAgent()`

Must be used under `AuthwardsProvider`. Manages delegate agents: list, create, logs, revoke, activate, delete.

| Field | Type | Description |
|------|------|-------------|
| `agents` | `Agent[]` | From `GET /agent/list` (refreshed on mount and when the session or token changes). |
| `loading` | `boolean` | Loading list (non-silent fetch). |
| `refreshAgents` | `() => Promise<void>` | Reload list (e.g. after revoke, funding, or other actions). |
| `createAgent` | `(input: CreateAgentInput) => Promise<CreateAgentResult \| null>` | `POST /agent/create`. Returns `null` on error or if not authenticated. |
| `agentLogs` | `Map<string, AgentLog[]>` | Cached logs per `agentDid`. |
| `fetchAgentLogs` | `(agentDid: string) => Promise<void>` | `GET /agent/logs/:agentDid`. |
| `revokeAgent` | `(agentDid: string) => Promise<boolean>` | `POST /bridge/revoke`. |
| `activateAgent` | `(agentDid: string) => Promise<{ ok: boolean; error?: string }>` | `POST /agent/:agentDid/activate`. |
| `deleteAgent` | `(agentDid: string) => Promise<boolean>` | `DELETE /agent/:agentDid` — removes a **revoked** delegate from the platform DB only; on-chain DID/wallet unchanged. |

**`CreateAgentInput`** (all fields as implemented):

| Field | Type | Description |
|------|------|-------------|
| `permissionProfile` | `string` | Required. Backend accepts: `"readonly"` \| `"custom"` \| `"full_access"` \| `"low_value"`. |
| `name` | `string` | Trimmed display name. |
| `description` | `string` | Trimmed description. |
| `customMaxPerTxIota` | `number \| undefined` | For `"custom"`: max IOTA per tx (≥ 0). |
| `customMaxPerDayIota` | `number \| undefined` | For `"custom"`: max IOTA per day. |
| `permitExpiresAtMs` | `number \| null \| undefined` | Permit expiry (Unix ms); `0` or omit = no expiry. |
| `taskType` | `string \| undefined` | Optional task type. |
| `taskConfig` | `{ recipientAddress?: string; amountNanos?: number; action?: string } \| undefined` | Optional; sent with `taskType`. |

---

### `useWallet()`

Must be used under `AuthwardsProvider`.

| Field | Type | Description |
|------|------|-------------|
| `loading` | `boolean` | True while `getBalance`, `transferToAgent`, or `withdrawFromDelegate` is in flight. |
| `balance` | `string \| null` | Last nanos string from `getBalance` (`balanceNanos` or `balance` from API). |
| `getBalance` | `(address: string) => Promise<WalletBalanceResponse>` | `GET /wallet/balance/:address` (public; no auth header in SDK). |
| `transferToAgent` | `(agentAddress: string, amountNanos: number) => Promise<{ txHash: string; from: string; to: string; amount: number }>` | `POST /wallet/transfer` with Bearer token. Throws if not authenticated. |
| `withdrawFromDelegate` | `(agentDid: string, amount: number, options?: { unit?: "nanos" \| "iota" }) => Promise<WithdrawFromDelegateResult>` | `POST /wallet/withdraw-from-agent` — withdraw from a delegate wallet to the account wallet (sponsored gas). Default `unit` is `"nanos"`; use `"iota"` for whole/fractional IOTA. Throws if not authenticated. |

**`WalletBalanceResponse`:** `address`, optional `coinType`, `balanceNanos`, `balance`, optional `balanceIota`, `nanos`.

**`WithdrawFromDelegateResult`:** `txHash`, `from`, `to`, `amountNanos` (string), `amountIota` (number).

---

### Exported types (`types.ts` and re-exports)

Types exported from the package entry include:

- **`AuthwardsConfig`**: `{ backendUrl: string }`
- **`AuthProviderType`**: `"google" \| "github" \| "wallet" \| "telegram"`
- **`User`**: `providerId`, `providerType`, `email`, `name`, `picture`, `did`, `didDocument`, optional `walletAddress`
- **`AgentStatus`**: `"created" \| "pending_activation" \| "active" \| "revoked"`
- **`AgentTaskConfig`**: optional `action`, `amountNanos`, `recipientAddress`
- **`Agent`**: `agentDid`, `ownerDid`, optional `name`, `description`, `permissionProfile`, `permitMaxPerTxIota`, `permitMaxPerDayIota`, `permitExpiresAtMs`, `createdAt`, optional `active`, `walletAddress`, `status`, `activatedAt`, `spentTodayNanos`, `spentTodayDate`, masked `agentToken`, `taskType`, `taskConfig`, `permitObjectId`, optional `permitExplorerUrl`
- **`AgentLog`**: `agentDid`, `timestamp`, `type`, `data`

Deprecated: `IotaAuthConfig` (alias of `AuthwardsConfig`).

### Theme helpers

- **`AUTHWARDS_UI`**: default color tokens (accent, surfaces, text, etc.).
- **`AUTHWARDS_UI_RGBA`**: rgba variants for borders/backgrounds.

---

## Delegated identities

Delegated identities are separate DIDs controlled by your account with on-chain permit limits (per profile). You create them after sign-in via `useAgent().createAgent()`, which registers the agent with the backend and returns credentials including `agentDid` and `agentToken` for automation.

Example:

```tsx
const { createAgent } = useAgent();

const agent = await createAgent({
  permissionProfile: "readonly",
  name: "Payment Bot",
  description: "Automated low-value payments",
});

if (agent) {
  console.log(agent.agentDid); // did:iota:0x...
  console.log(agent.agentToken); // agt_... (use only in secure server-side or agent runtimes)
}
```

There is no `delegateType` field; use `permissionProfile` and `name` / `description` as above.

---

## Bridge API (for external agents)

External automation (non-browser) uses the **agent token** to call the backend over HTTP, e.g. **`POST /bridge/transact`**, with JSON bodies as documented for your deployment. The SDK’s `useAgent` helpers are for the logged-in user in React; **bridge** traffic is typically from a separate process using the issued token.

Full HTTP reference (status endpoint, request shapes, examples): see the **Authward dashboard** developer/agent documentation, or the main project README for bridge and agent runtime details.

- Dashboard: https://authwards.netlify.app

---

## Requirements

- **React 18+** (React 19 supported as peer).
- **react-dom** 18+ as peer.
- The SDK uses **inline styles**; no extra CSS bundle is required.
- A running **Authward backend** must be configured via `backendUrl`.
- The SDK depends on **`@iota/wallet-standard`**, **`@wallet-standard/app`**, and **`@wallet-standard/features`** for wallet connect (see `package.json`).

---

## Links

| Resource | URL |
|----------|-----|
| Dashboard | https://authwards.netlify.app |
| Backend (example) | https://authwards-production.up.railway.app |
| GitHub | https://github.com/Polistirol/Authwards |
