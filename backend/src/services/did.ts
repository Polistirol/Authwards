import crypto from "node:crypto";

import { decodeIotaPrivateKey } from "@iota/iota-sdk/cryptography";
import { requestIotaFromFaucetV0 } from "@iota/iota-sdk/faucet";
import type { IotaTransactionBlockResponse } from "@iota/iota-sdk/client";
import { IotaClient } from "@iota/iota-sdk/client";
import { Ed25519Keypair } from "@iota/iota-sdk/keypairs/ed25519";
import { Ed25519KeypairSigner } from "@iota/iota-interaction-ts/node/test_utils/ed_25519_keypair_signer.js";
import {
  IdentityClient,
  IdentityClientReadOnly,
  IotaDocument,
  IotaDID,
  Jwk,
  JwkMemStore,
  JwsAlgorithm,
  JwkType,
  KeyIdMemStore,
  MethodDigest,
  MethodScope,
  start as initIdentityWasmPanicHook,
  Storage,
  VerificationMethod,
} from "@iota/identity-wasm/node";
import type { JsonWebKey, KeyObject } from "node:crypto";

let wasmStarted = false;
let chainIdPromise: Promise<string> | null = null;

function unwrapTxResponse(r: unknown): IotaTransactionBlockResponse {
  if (
    r &&
    typeof r === "object" &&
    "get_response" in r &&
    typeof (r as { get_response: () => IotaTransactionBlockResponse }).get_response === "function"
  ) {
    return (r as { get_response: () => IotaTransactionBlockResponse }).get_response();
  }
  return r as IotaTransactionBlockResponse;
}

function ensureWasm() {
  if (!wasmStarted) {
    initIdentityWasmPanicHook();
    wasmStarted = true;
  }
}

function getNodeUrl(): string {
  const url = process.env.IOTA_NODE_URL;
  if (!url) throw new Error("IOTA_NODE_URL non impostata");
  return url;
}

function getFaucetHostFromEnv(): string {
  const url = process.env.IOTA_FAUCET_URL;
  if (!url) throw new Error("IOTA_FAUCET_URL non impostata");
  return url;
}

async function waitForNonZeroBalance(client: IotaClient, owner: string, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    const { totalBalance } = await client.getBalance({ owner });
    if (BigInt(totalBalance) > 0n) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Saldo ancora zero per ${owner} dopo il faucet`);
}

async function fundAddress(client: IotaClient, address: string) {
  await requestIotaFromFaucetV0({
    host: getFaucetHostFromEnv(),
    recipient: address,
  });
  await waitForNonZeroBalance(client, address);
}

export function iotaEd25519KeypairToIdentityJwk(keypair: Ed25519Keypair): Jwk {
  const { secretKey } = decodeIotaPrivateKey(keypair.getSecretKey());
  const d = Buffer.from(secretKey).toString("base64url");
  const x = Buffer.from(keypair.getPublicKey().toRawBytes()).toString("base64url");
  return new Jwk({
    kty: JwkType.Okp,
    crv: "Ed25519",
    x,
    d,
    alg: JwsAlgorithm.EdDSA,
  });
}

export function ed25519PrivateKeyToJwk(privateKey: KeyObject): Jwk {
  const j = privateKey.export({ format: "jwk" }) as JsonWebKey;
  if (j.kty !== "OKP" || j.crv !== "Ed25519" || !j.x || !j.d) {
    throw new Error("Atteso JWK Ed25519 (OKP) con campi x e d");
  }
  return new Jwk({
    kty: JwkType.Okp,
    crv: "Ed25519",
    x: j.x,
    d: j.d,
    alg: JwsAlgorithm.EdDSA,
  });
}

async function attachExternalEd25519Method(
  storage: Storage,
  doc: IotaDocument,
  privateJwk: Jwk,
  fragment: string,
) {
  const keyId = await storage.keyStorage().insert(privateJwk);
  const publicJwk = privateJwk.toPublic();
  if (!publicJwk) throw new Error("toPublic() fallito dopo insert JWK");
  publicJwk.setKid(keyId);
  const vm = VerificationMethod.newFromJwk(doc.id(), publicJwk, fragment);
  doc.insertMethod(vm, MethodScope.VerificationMethod());
  await storage.keyIdStorage().insertKeyId(new MethodDigest(vm), keyId);
}

async function createIdentityClientFromKeypair(
  iotaClient: IotaClient,
  payerKeypair: Ed25519Keypair,
  fund: boolean,
): Promise<IdentityClient> {
  const userAddress = payerKeypair.getPublicKey().toIotaAddress();
  if (fund) {
    await fundAddress(iotaClient, userAddress);
  } else {
    const { totalBalance } = await iotaClient.getBalance({ owner: userAddress });
    if (BigInt(totalBalance) === 0n) await fundAddress(iotaClient, userAddress);
  }
  // @iota/iota-interaction-ts tipizza il client come build CJS; qui forziamo compatibilità runtime.
  const readOnly = await IdentityClientReadOnly.create(iotaClient as never);
  const txSigner = new Ed25519KeypairSigner(payerKeypair as never);
  return IdentityClient.create(readOnly, txSigner);
}

async function getChainId(client: IotaClient): Promise<string> {
  if (!chainIdPromise) chainIdPromise = client.getChainIdentifier();
  return chainIdPromise;
}

/**
 * Crea un DID su IOTA. Il parametro `publicKey` è l’`Ed25519Keypair` dell’SDK IOTA (chiave completa):
 * la parte pubblica entra nel DID Document; la parte privata serve solo in memoria per firmare `createIdentity`.
 */
export async function createDid(publicKey: Ed25519Keypair): Promise<{
  did: string;
  didDocument: Record<string, unknown>;
  DIDCreationTx: string;
}> {
  ensureWasm();
  const iotaClient = new IotaClient({ url: getNodeUrl() });
  const storage = new Storage(new JwkMemStore(), new KeyIdMemStore());
  const identityClient = await createIdentityClientFromKeypair(iotaClient, publicKey, true);
  const networkId = await getChainId(iotaClient);
  const privateJwk = iotaEd25519KeypairToIdentityJwk(publicKey);
  const unpublished = new IotaDocument(networkId);
  await attachExternalEd25519Method(storage, unpublished, privateJwk, "#key-1");
  const { output: identity, response: rawRes } = await identityClient
    .createIdentity(unpublished)
    .finish()
    .buildAndExecute(identityClient);
  const tx = unwrapTxResponse(rawRes);
  const doc = identity.didDocument();
  const did = doc.id().toString();
  const didDocument = doc.toJSON() as Record<string, unknown>;
  return { did, didDocument, DIDCreationTx: tx.digest };
}

/** Agente: VM con chiave Node Ed25519; controller = DID utente; gas da `payerKeypair`. */
export async function createAgentDid(params: {
  payerKeypair: Ed25519Keypair;
  agentPrivateKey: KeyObject;
  ownerDid: string;
  fundPayer: boolean;
}): Promise<{ did: string; didDocument: Record<string, unknown> }> {
  ensureWasm();
  const { payerKeypair, agentPrivateKey, ownerDid, fundPayer } = params;
  const iotaClient = new IotaClient({ url: getNodeUrl() });
  const storage = new Storage(new JwkMemStore(), new KeyIdMemStore());
  const identityClient = await createIdentityClientFromKeypair(iotaClient, payerKeypair, fundPayer);
  const networkId = await getChainId(iotaClient);
  const ownerIotaDid = IotaDID.parse(ownerDid);
  const agentJwk = ed25519PrivateKeyToJwk(agentPrivateKey);
  const unpublished = new IotaDocument(networkId);
  unpublished.setController([ownerIotaDid]);
  await attachExternalEd25519Method(storage, unpublished, agentJwk, "#key-1");
  const { output: identity } = await identityClient
    .createIdentity(unpublished)
    .finish()
    .buildAndExecute(identityClient);
  const doc = identity.didDocument();
  return {
    did: doc.id().toString(),
    didDocument: doc.toJSON() as Record<string, unknown>,
  };
}

export async function resolveDid(did: string): Promise<Record<string, unknown>> {
  ensureWasm();
  const iotaClient = new IotaClient({ url: getNodeUrl() });
  const readOnly = await IdentityClientReadOnly.create(iotaClient as never);
  const iotaDid = IotaDID.parse(did);
  const doc = await readOnly.resolveDid(iotaDid);
  return doc.toJSON() as Record<string, unknown>;
}

/** Seed Ed25519 32 byte da `KeyObject` (JWK `d`). */
export function ed25519SeedFromPrivateKey(privateKey: KeyObject): Uint8Array {
  const j = privateKey.export({ format: "jwk" }) as JsonWebKey;
  if (!j.d) throw new Error("JWK senza `d`");
  return new Uint8Array(Buffer.from(j.d, "base64url"));
}
