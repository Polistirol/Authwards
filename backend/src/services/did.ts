import crypto from "node:crypto";

import type { PublicKey } from "@iota/iota-sdk/cryptography";
import { decodeIotaPrivateKey } from "@iota/iota-sdk/cryptography";
import { requestIotaFromFaucetV0 } from "@iota/iota-sdk/faucet";
import type { IotaTransactionBlockResponse } from "@iota/iota-sdk/client";
import { IotaClient } from "@iota/iota-sdk/client";
import { getMasterKeypair } from "./masterWallet.js";
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
  if (!url) throw new Error("IOTA_NODE_URL not set");
  return url;
}

function getFaucetHostFromEnv(): string {
  const url = process.env.IOTA_FAUCET_URL;
  if (!url) throw new Error("IOTA_FAUCET_URL not set");
  return url;
}

async function waitForNonZeroBalance(client: IotaClient, owner: string, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    const { totalBalance } = await client.getBalance({ owner });
    if (BigInt(totalBalance) > 0n) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Balance still zero for ${owner} after faucet`);
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
    throw new Error("Expected Ed25519 JWK (OKP) with x and d fields");
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
  if (!publicJwk) throw new Error("toPublic() failed after JWK insert");
  publicJwk.setKid(keyId);
  const vm = VerificationMethod.newFromJwk(doc.id(), publicJwk, fragment);
  doc.insertMethod(vm, MethodScope.VerificationMethod());
  await storage.keyIdStorage().insertKeyId(new MethodDigest(vm), keyId);
}

/** VM with public key only (wallet login: no private key on server). */
async function attachPublicOnlyEd25519Method(
  storage: Storage,
  doc: IotaDocument,
  publicJwk: Jwk,
  fragment: string,
) {
  const keyId = await storage.keyStorage().insert(publicJwk);
  publicJwk.setKid(keyId);
  const vm = VerificationMethod.newFromJwk(doc.id(), publicJwk, fragment);
  doc.insertMethod(vm, MethodScope.VerificationMethod());
  await storage.keyIdStorage().insertKeyId(new MethodDigest(vm), keyId);
}

async function createIdentityClientFromKeypair(
  iotaClient: IotaClient,
  payerKeypair: Ed25519Keypair,
  options: { fundFromFaucet: boolean },
): Promise<IdentityClient> {
  const userAddress = payerKeypair.getPublicKey().toIotaAddress();
  if (options.fundFromFaucet) {
    await fundAddress(iotaClient, userAddress);
  }
  // @iota/iota-interaction-ts types the client as CJS build; force runtime compatibility here.
  const readOnly = await IdentityClientReadOnly.create(iotaClient as never);
  const txSigner = new Ed25519KeypairSigner(payerKeypair as never);
  return IdentityClient.create(readOnly, txSigner);
}

function getDidGasBudget(): bigint {
  const raw = process.env.DID_GAS_BUDGET;
  if (raw?.trim()) return BigInt(raw.trim());
  return 100_000_000n;
}

async function getChainId(client: IotaClient): Promise<string> {
  if (!chainIdPromise) chainIdPromise = client.getChainIdentifier();
  return chainIdPromise;
}

/**
 * Creates a DID on IOTA. `publicKey` is the IOTA SDK `Ed25519Keypair` (full key):
 * public material goes into the DID document; private material is only in memory to sign `createIdentity`.
 * Gas: **master wallet** signs and executes the tx (`IdentityClient` = master). The DID document contains the user's VM.
 * (`withSender`+`withGasOwner` txs need two signatures; `buildAndExecute` provides one — not used here.)
 */
export async function createDid(
  publicKey: Ed25519Keypair,
  options?: { mnemonic?: string },
): Promise<{
  did: string;
  didDocument: Record<string, unknown>;
  DIDCreationTx: string;
  walletAddress: string;
  privateKeyHex: string;
  mnemonic: string | null;
  didGasMode: "master_payer";
}> {
  ensureWasm();
  const walletAddress = publicKey.getPublicKey().toIotaAddress();
  const { secretKey } = decodeIotaPrivateKey(publicKey.getSecretKey());
  const privateKeyHex = Buffer.from(secretKey).toString("hex");
  const mnemonic = options?.mnemonic ?? null;

  const iotaClient = new IotaClient({ url: getNodeUrl() });
  const storage = new Storage(new JwkMemStore(), new KeyIdMemStore());
  const masterKp = getMasterKeypair();
  const identityClient = await createIdentityClientFromKeypair(iotaClient, masterKp, {
    fundFromFaucet: false,
  });
  const networkId = await getChainId(iotaClient);
  const privateJwk = iotaEd25519KeypairToIdentityJwk(publicKey);
  const unpublished = new IotaDocument(networkId);
  await attachExternalEd25519Method(storage, unpublished, privateJwk, "#key-1");

  console.log(
    "[did] User DID creation: gas mode = master_payer (option C: sign+gas from master, VM = user key)",
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const txb: any = identityClient.createIdentity(unpublished).finish();
  const { output: identity, response: rawRes } = await txb
    .withGasBudget(getDidGasBudget())
    .buildAndExecute(identityClient);
  const tx = unwrapTxResponse(rawRes);
  const doc = identity.didDocument();
  const did = doc.id().toString();
  const didDocument = doc.toJSON() as Record<string, unknown>;
  return {
    did,
    didDocument,
    DIDCreationTx: tx.digest,
    walletAddress,
    privateKeyHex,
    mnemonic,
    didGasMode: "master_payer",
  };
}

/**
 * DID for users with only the browser extension wallet: VM uses the Ed25519 public key
 * verified from the signature (no seed on the backend).
 */
export async function createDidForWalletOwner(publicKey: PublicKey): Promise<{
  did: string;
  didDocument: Record<string, unknown>;
  DIDCreationTx: string;
  walletAddress: string;
}> {
  ensureWasm();
  const walletAddress = publicKey.toIotaAddress();
  const x = Buffer.from(publicKey.toRawBytes()).toString("base64url");
  const publicJwk = new Jwk({
    kty: JwkType.Okp,
    crv: "Ed25519",
    x,
    alg: JwsAlgorithm.EdDSA,
  });

  const iotaClient = new IotaClient({ url: getNodeUrl() });
  const storage = new Storage(new JwkMemStore(), new KeyIdMemStore());
  const masterKp = getMasterKeypair();
  const identityClient = await createIdentityClientFromKeypair(iotaClient, masterKp, {
    fundFromFaucet: false,
  });
  const networkId = await getChainId(iotaClient);
  const unpublished = new IotaDocument(networkId);
  await attachPublicOnlyEd25519Method(storage, unpublished, publicJwk, "#key-1");

  console.log(
    "[did] Wallet-login DID creation: gas mode = master_payer, VM = wallet public key (no private key on server)",
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const txb: any = identityClient.createIdentity(unpublished).finish();
  const { output: identity, response: rawRes } = await txb
    .withGasBudget(getDidGasBudget())
    .buildAndExecute(identityClient);
  const tx = unwrapTxResponse(rawRes);
  const doc = identity.didDocument();
  const did = doc.id().toString();
  const didDocument = doc.toJSON() as Record<string, unknown>;
  return {
    did,
    didDocument,
    DIDCreationTx: tx.digest,
    walletAddress,
  };
}

/** Agent: agent VM + user controller; signing and gas from master (option C). */
export async function createAgentDid(params: {
  agentKeypair: Ed25519Keypair;
  ownerDid: string;
}): Promise<{ did: string; didDocument: Record<string, unknown>; walletAddress: string; DIDCreationTx: string }> {
  ensureWasm();
  const { agentKeypair, ownerDid } = params;
  const walletAddress = agentKeypair.getPublicKey().toIotaAddress();

  const iotaClient = new IotaClient({ url: getNodeUrl() });
  const storage = new Storage(new JwkMemStore(), new KeyIdMemStore());
  const masterKp = getMasterKeypair();
  const identityClient = await createIdentityClientFromKeypair(iotaClient, masterKp, {
    fundFromFaucet: false,
  });
  const networkId = await getChainId(iotaClient);
  const ownerIotaDid = IotaDID.parse(ownerDid);
  const agentJwk = iotaEd25519KeypairToIdentityJwk(agentKeypair);
  const unpublished = new IotaDocument(networkId);
  unpublished.setController([ownerIotaDid]);
  await attachExternalEd25519Method(storage, unpublished, agentJwk, "#key-1");

  console.log(
    "[did] Agent DID creation: gas mode = master_payer (option C: sign+gas from master, VM = agent key)",
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const txb: any = identityClient.createIdentity(unpublished).finish();
  const { output: identity, response: rawRes } = await txb
    .withGasBudget(getDidGasBudget())
    .buildAndExecute(identityClient);
  const tx = unwrapTxResponse(rawRes);
  const doc = identity.didDocument();
  return {
    did: doc.id().toString(),
    didDocument: doc.toJSON() as Record<string, unknown>,
    walletAddress,
    DIDCreationTx: tx.digest,
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

/** 32-byte Ed25519 seed from `KeyObject` (JWK `d`). */
export function ed25519SeedFromPrivateKey(privateKey: KeyObject): Uint8Array {
  const j = privateKey.export({ format: "jwk" }) as JsonWebKey;
  if (!j.d) throw new Error("JWK missing `d`");
  return new Uint8Array(Buffer.from(j.d, "base64url"));
}
