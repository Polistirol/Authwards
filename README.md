# Authwards

Identity, permission, and signing layer for IOTA.


---

## What it is

Authwards is an SDK and platform that gives any IOTA application social login, decentralized identity (DID), and delegated permissions enforced on-chain by a Move smart contract.

It is infrastructure, not a dApp. The goal is that other applications integrate Authwards to handle identity so they don't have to.

Built for the MasterZ x IOTA Hackathon 2026. Deployed on IOTA Mainnet.

## The problem

Using any dApp on IOTA today requires a wallet extension, a seed phrase, and tokens for gas. Most users never get past this step.

Beyond users, there is no standard way for software agents or IoT devices to hold identity on IOTA and operate with bounded, verifiable permissions.

## How it works

1. **User logs in** with Google, GitHub, Telegram, or IOTA Wallet
2. **Authwards creates** a W3C DID and wallet on IOTA; gas sponsored, user pays nothing
3. **User creates a delegate** (agent, collaborator, device) with spending limits enforced on-chain
4. **Delegate operates** via the Bridge API and it never holds private keys
5. **Anyone can verify** the full trust chain through a public resolver API

## Architecture

| Component | Stack | Deployment |
|---|---|---|
| Backend API | Express.js + TypeScript | Railway |
| Dashboard | React + Vite + Tailwind | Netlify |
| React SDK | Downloadable zip | From dashboard |
| Smart Contract | Move (AgentPermit) | IOTA Mainnet |
| TraceFlow (demo) | React + Netlify Functions | Netlify |

TraceFlow is a separate supply chain app demo that integrates the Authwards SDK. It has its own backend and data layer, Authwards doesn't know what a shipment is. This separation is intentional: it proves the SDK works as a third-party integration.

## IOTA Technologies Used

- **Move Smart Contracts** — AgentPermit is a shared object with native ownership. Spending limits are enforced by the contract, not the server.
- **IOTA Identity** — W3C DID Documents anchored on L1. Delegate DIDs use the `controller` field to link back to the owner.
- **Gas Station** — Native gas sponsorship so the user is always the transaction sender. DIDs and permits are owned by the user, not the platform.
- **IOTA SDK** — `@iota/sdk` and `@iota/identity-wasm` for wallet management, transaction signing, and DID operations.

## SDK Integration

```jsx
import { IotaAuthProvider, ConnectButton } from 'authwards-sdk';

<IotaAuthProvider backendUrl="https://authwards-production.up.railway.app">
  <ConnectButton />
</IotaAuthProvider>
```

Hooks: `useIotaAuth()`, `useAgent()`, `useWallet()`, `useResolve()`.

## API Surface

**Auth** — `GET /auth/google`, `/auth/github`, `POST /auth/wallet/challenge`, `/auth/wallet/verify`, `/auth/telegram/verify`, `GET /auth/me`

**Agents** (JWT) — `POST /agent/create`, `GET /agent/list`, `POST /agent/:did/activate`, `GET /agent/:did/snippet`

**Bridge** (agent token) — `POST /bridge/transact`, `/bridge/execute`, `/bridge/check`, `GET /bridge/status`, `POST /bridge/revoke`

**Resolver** (public) — `GET /resolve/delegate/:did`, `/resolve/owner/:did/delegates`, `/resolve/tx/:txHash`

**Wallet** (JWT) — `GET /wallet/balance/:address`, `POST /wallet/transfer`, `GET /wallet/transactions/:address`

## Key Management

- **User keys**: Ed25519, encrypted AES-256-GCM with key derived from PBKDF2(JWT_SECRET + providerId). Stored server-side.
- **Agent keys**: Deterministically derived via HKDF. Never stored — recomputed on every Bridge call.
- **Gas**: Master wallet sponsors gas; user retains ownership of all on-chain objects.

## Trade-offs

This is a hackathon MVP. These are conscious decisions, not oversights:

- **Custodial key management.** User keys are encrypted server-side. Production path: client-side key generation with MPC/SSS for recovery.
- **Static agent tokens.** No rotation or expiration. On-chain AgentPermit limits are the primary security boundary.
- **Ephemeral storage.** `db.json` on Railway's filesystem. Container restart = reset. Production: persistent database.
- **Trust chain resolver** works with Authwards-managed DIDs only, not arbitrary DIDs on IOTA.

## Project Structure

```
backend/          Express.js API — auth, agents, bridge, resolver, wallet
dashboard/        React dashboard — identity management, delegation, wallet
sdk/              React SDK — IotaAuthProvider, ConnectButton, hooks
traceflow/        Demo dApp — supply chain tracking with Authwards integration
contracts/        Move smart contract — AgentPermit
```

## Running Locally

```bash
# Backend
cd backend
cp .env.example .env    # fill in OAuth credentials, IOTA keys
npm install
npm run dev

# Dashboard
cd dashboard
cp .env.example .env    # set VITE_BACKEND_URL
npm install
npm run dev
```

Required environment variables for the backend: `JWT_SECRET`, `PLATFORM_DERIVATION_SECRET`, `MASTER_WALLET_MNEMONIC`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `AGENT_PERMIT_PACKAGE_ID`.


*Hackathon project — March 2026. Code reflects MVP constraints and a one-week timeline.*
