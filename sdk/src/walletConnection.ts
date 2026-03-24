/**
 * Connessione al wallet IOTA: Wallet Standard (@wallet-standard/app + iota:signPersonalMessage)
 * con fallback agli oggetti globali legacy (window.iota, …).
 */

import { getWallets } from "@wallet-standard/app";
import { StandardConnect } from "@wallet-standard/features";
import { IotaSignPersonalMessage } from "@iota/wallet-standard";
import type { Wallet } from "@wallet-standard/base";

export type IotaWalletAdapter = {
  connect?: () => Promise<void>;
  /** Alcuni wallet espongono accounts sincroni dopo connect. */
  accounts?: readonly { address: string }[];
  getAccounts?: () => Promise<{ address: string }[]>;
  signPersonalMessage?: (input: { message: Uint8Array }) => Promise<{ signature: string } | string>;
};

function pickLegacyWallet(obj: unknown): IotaWalletAdapter | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  if (typeof o.signPersonalMessage === "function") {
    return obj as IotaWalletAdapter;
  }
  return null;
}

function detectLegacyIotaWallet(): IotaWalletAdapter | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (
    pickLegacyWallet(w.iota) ??
    pickLegacyWallet(w.iotaWallet) ??
    pickLegacyWallet(w.bloom) ??
    pickLegacyWallet(w["@iota/wallet"]) ??
    null
  );
}

function createStandardAdapter(wallet: Wallet): IotaWalletAdapter {
  const connectStd = async (): Promise<void> => {
    const feat = wallet.features[StandardConnect] as
      | { connect?: (input?: { silent?: boolean }) => Promise<{ accounts: readonly { address: string }[] }> }
      | undefined;
    if (feat?.connect) {
      await feat.connect({ silent: false });
    }
  };

  return {
    connect: connectStd,
    get accounts() {
      return wallet.accounts;
    },
    getAccounts: async () => {
      const feat = wallet.features[StandardConnect] as
        | { connect?: (input?: { silent?: boolean }) => Promise<{ accounts: readonly { address: string }[] }> }
        | undefined;
      if (feat?.connect) {
        const { accounts } = await feat.connect({ silent: false });
        return accounts.map((a) => ({ address: a.address }));
      }
      return wallet.accounts.map((a) => ({ address: a.address }));
    },
    signPersonalMessage: async ({ message }) => {
      const f = wallet.features[IotaSignPersonalMessage] as
        | { signPersonalMessage?: (input: { message: Uint8Array; account: (typeof wallet.accounts)[number] }) => Promise<{ signature: string }> }
        | undefined;
      if (!f?.signPersonalMessage) {
        throw new Error("WALLET_NO_SIGN_PERSONAL_MESSAGE");
      }
      const account = wallet.accounts[0];
      if (!account) {
        throw new Error("WALLET_NO_ACCOUNT");
      }
      const out = await f.signPersonalMessage({ message, account });
      return { signature: out.signature };
    },
  };
}

function pickStandardWallet(): Wallet | null {
  if (typeof window === "undefined") return null;
  const walletsApi = getWallets();
  for (const w of walletsApi.get()) {
    if (IotaSignPersonalMessage in w.features) {
      return w;
    }
  }
  return null;
}

/**
 * Rileva subito wallet legacy o già registrato sul Wallet Standard (senza attesa).
 */
export function detectIotaWallet(): IotaWalletAdapter | null {
  const legacy = detectLegacyIotaWallet();
  if (legacy) return legacy;
  const std = pickStandardWallet();
  return std ? createStandardAdapter(std) : null;
}

/**
 * Come {@link detectIotaWallet}, ma se l'estensione non si è ancora registrata aspetta l'evento
 * `register` (utile su cold load / Opera / timing stretti).
 */
export async function resolveIotaWalletAdapter(timeoutMs = 8000): Promise<IotaWalletAdapter | null> {
  const immediate = detectIotaWallet();
  if (immediate) return immediate;

  if (typeof window === "undefined") return null;

  const walletsApi = getWallets();

  return new Promise((resolve) => {
    let settled = false;
    const finish = (adapter: IotaWalletAdapter | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(adapter);
    };

    const tryPick = (): IotaWalletAdapter | null => {
      const w = pickStandardWallet();
      return w ? createStandardAdapter(w) : null;
    };

    const t = setTimeout(() => finish(null), timeoutMs);

    const off = walletsApi.on("register", () => {
      const a = tryPick();
      if (a) finish(a);
    });

    const iv = setInterval(() => {
      const a = tryPick();
      if (a) finish(a);
    }, 150);

    function cleanup() {
      clearTimeout(t);
      clearInterval(iv);
      off();
    }

    const a = tryPick();
    if (a) finish(a);
  });
}

export async function getWalletAddress(adapter: IotaWalletAdapter): Promise<string> {
  if (typeof adapter.connect === "function") {
    await adapter.connect();
  }
  let accounts = adapter.accounts;
  if (!accounts?.length && typeof adapter.getAccounts === "function") {
    accounts = await adapter.getAccounts();
  }
  const first = accounts?.[0];
  const addr = first?.address?.trim();
  if (!addr) {
    throw new Error("WALLET_NO_ACCOUNT");
  }
  return addr;
}

export async function signPersonalMessageWithWallet(
  adapter: IotaWalletAdapter,
  message: Uint8Array,
): Promise<string> {
  const fn = adapter.signPersonalMessage;
  if (typeof fn !== "function") {
    throw new Error("WALLET_NO_SIGN_PERSONAL_MESSAGE");
  }
  const out = await fn.call(adapter, { message });
  if (typeof out === "string") return out;
  if (out && typeof out === "object" && "signature" in out && typeof (out as { signature: string }).signature === "string") {
    return (out as { signature: string }).signature;
  }
  throw new Error("WALLET_BAD_SIGNATURE_SHAPE");
}
