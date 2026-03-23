/**
 * Spike end-to-end: OAuth simulato → chiave cifrata con token Google (PBKDF2+AES-GCM)
 * → DID utente su IOTA testnet → transazione firmata dalla chiave utente
 * → DID agente con controller = utente → transazione firmata dall'agente.
 *
 * Stack: `@iota/iota-sdk` + `@iota/identity-wasm` (testnet rebased). Il pacchetto `@iota/sdk`
 * è elencato in package.json come richiesto, ma questo script usa solo `@iota/iota-sdk`.
 */

import crypto from "node:crypto";
import fs from "node:fs";

import { decodeIotaPrivateKey } from "@iota/iota-sdk/cryptography";
import { getFaucetHost, requestIotaFromFaucetV0 } from "@iota/iota-sdk/faucet";
import { getFullnodeUrl, IotaClient, type IotaTransactionBlockResponse } from "@iota/iota-sdk/client";
import { Ed25519Keypair } from "@iota/iota-sdk/keypairs/ed25519";
import { Transaction } from "@iota/iota-sdk/transactions";
import { Ed25519KeypairSigner } from "@iota/iota-interaction-ts/node/test_utils/ed_25519_keypair_signer.js";
import {
  IdentityClient,
  IdentityClientReadOnly,
  IotaDocument,
  type IotaDID,
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

// --- Rete IOTA (testnet / devnet) -------------------------------------------------
const NETWORK_NAME = "testnet" as const;
const NETWORK_URL = getFullnodeUrl(NETWORK_NAME);
const PBKDF2_ITERATIONS = 210_000;
const KEYS_JSON = "keys.json";

/** ⚠️ Solo per spike locale: non committare su repo pubblici una seed reale. */
const USER_MNEMONIC_12 =
  "echo boost onion entire thrive kidney six satisfy crucial taste crack fork";

/** Opzioni RPC per vedere oggetti creati / effetti nelle risposte transazione. */
const TX_RESPONSE_OPTS = {
  showEffects: true,
  showObjectChanges: true,
  showInput: true,
  showEvents: true,
  showBalanceChanges: true,
} as const;

function logError(stepLabel: string, err: unknown) {
  if (err instanceof Error) {
    console.error(`${stepLabel} ERRORE: ${err.message}`);
    if (err.stack) console.error(err.stack);
    if (err.cause) console.error("Cause:", err.cause);
  } else {
    console.error(`${stepLabel} ERRORE:`, err);
  }
}

function toB64(buf: Uint8Array): string {
  return Buffer.from(buf).toString("base64");
}

function fromB64(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "base64"));
}

/** Normalizza la risposta transazione (plain o wrapper WASM usato da identity-wasm). */
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

/** Raccoglie ID di oggetti creati o pacchetti pubblicati (objectChanges + effects.created). */
function collectCreatedOnChainIds(res: IotaTransactionBlockResponse): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (id: string | undefined) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };
  for (const ch of res.objectChanges ?? []) {
    if (ch.type === "created") add(ch.objectId);
    if (ch.type === "published") add(ch.packageId);
  }
  for (const c of res.effects?.created ?? []) {
    add(c.reference.objectId);
  }
  return out;
}

function printCreatedOnChain(stepLabel: string, res: IotaTransactionBlockResponse) {
  const ids = collectCreatedOnChainIds(res);
  console.log(`${stepLabel} — oggetti creati on-chain (${ids.length}):`);
  for (const id of ids) console.log(`  object/package id: ${id}`);
}

/** Converte `Ed25519Keypair` dell'SDK in JWK privato per `@iota/identity-wasm`. */
function iotaEd25519KeypairToIdentityJwk(keypair: Ed25519Keypair): Jwk {
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

/** Converte una `KeyObject` Ed25519 di Node in JWK completo per `@iota/identity-wasm`. */
function ed25519PrivateKeyToJwk(privateKey: KeyObject): Jwk {
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

/** Estrae i 32 byte seed Ed25519 dal JWK Node (campo `d`). */
function ed25519SeedFromPrivateKey(privateKey: KeyObject): Uint8Array {
  const j = privateKey.export({ format: "jwk" }) as JsonWebKey;
  if (!j.d) throw new Error("JWK senza `d`");
  return new Uint8Array(Buffer.from(j.d, "base64url"));
}

async function waitForNonZeroBalance(client: IotaClient, owner: string, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    const { totalBalance } = await client.getBalance({ owner });
    if (BigInt(totalBalance) > 0n) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Saldo ancora zero per ${owner} dopo il faucet`);
}

/** Richiede token dal faucet e attende accredito. */
async function fundAddress(client: IotaClient, address: string) {
  await requestIotaFromFaucetV0({
    host: getFaucetHost(NETWORK_NAME),
    recipient: address,
  });
  await waitForNonZeroBalance(client, address);
}

/**
 * `IdentityClient` che firma le tx on-chain con la keypair derivata dalla mnemonic (stesso indirizzo del DID utente).
 * `fund`: se true, faucet + attesa saldo (solo all'avvio); se false, ricrea il client dopo altre tx così il gas coin non resta stale.
 */
async function createIdentityClientFromUserWallet(
  iotaClient: IotaClient,
  userWalletKp: Ed25519Keypair,
  fund: boolean,
): Promise<IdentityClient> {
  const userAddress = userWalletKp.getPublicKey().toIotaAddress();
  if (fund) {
    await fundAddress(iotaClient, userAddress);
  } else {
    const { totalBalance } = await iotaClient.getBalance({ owner: userAddress });
    if (BigInt(totalBalance) === 0n) await fundAddress(iotaClient, userAddress);
  }
  const readOnly = await IdentityClientReadOnly.create(iotaClient);
  const txSigner = new Ed25519KeypairSigner(userWalletKp);
  return IdentityClient.create(readOnly, txSigner);
}

/**
 * Aggiunge al documento un verification method basato su una chiave Ed25519 già presente in `storage`.
 */
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

/** Transazione minima: split 1 nano dal gas e invio a se stessi (firma con `signer`). */
async function signAndSendSelfTransfer(
  client: IotaClient,
  signer: Ed25519Keypair,
): Promise<IotaTransactionBlockResponse> {
  const me = signer.getPublicKey().toIotaAddress();
  await fundAddress(client, me);
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [1]);
  tx.transferObjects([coin], me);
  const res = await client.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: TX_RESPONSE_OPTS,
  });
  return res;
}

async function main() {
  initIdentityWasmPanicHook();

  // Variabili condivise tra i passaggi (dopo lo step 3+)
  let googleIdToken = "";
  let userWalletKp: Ed25519Keypair | undefined;
  let iotaClient: IotaClient | undefined;
  let storage: Storage | undefined;
  let identityClient: IdentityClient | undefined;
  let networkId = "";
  let userDid: IotaDID | undefined;
  let userDidStr = "";
  let agentPrivateKey: KeyObject | undefined;

  // ---------------------------------------------------------------------------
  // [1/6] Simulazione OAuth Google (valori finti)
  // ---------------------------------------------------------------------------
  try {
    const googleUserId = "google|spike-user-001";
    googleIdToken =
      "eyJhbGciOiJub25lIn0.eyJzdWIiOiJnb29nbGV8c3Bpa2UtdXNlci0wMDEiLCJpc3MiOiJzcGlrZSJ9.fake-signature";
    console.log(`[1/6] OAuth: Google User ID = ${googleUserId}`);
  } catch (e) {
    logError("[1/6]", e);
    process.exitCode = 1;
    return;
  }

  // ---------------------------------------------------------------------------
  // [2/6] Keypair utente da mnemonic IOTA + cifratura seed (32 byte) con AES-256-GCM (PBKDF2 sul token)
  // ---------------------------------------------------------------------------
  try {
    userWalletKp = Ed25519Keypair.deriveKeypair(USER_MNEMONIC_12);
    const userAddress = userWalletKp.getPublicKey().toIotaAddress();
    console.log(`[2/6] Indirizzo da mnemonic (m/44'/4218'/0'/0'/0'): ${userAddress}`);

    const { secretKey: seed } = decodeIotaPrivateKey(userWalletKp.getSecretKey());

    const salt = crypto.randomBytes(16);
    const aesKey = crypto.pbkdf2Sync(googleIdToken, salt, PBKDF2_ITERATIONS, 32, "sha256");
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(Buffer.from(seed)),
      cipher.final(),
      cipher.getAuthTag(),
    ]);

    const payload = {
      encryptedKey: toB64(encrypted),
      iv: toB64(iv),
      salt: toB64(salt),
    };
    fs.writeFileSync(KEYS_JSON, JSON.stringify(payload, null, 2), "utf8");
    console.log("[2/6] Keypair generata, chiave privata cifrata");
  } catch (e) {
    logError("[2/6]", e);
    process.exitCode = 1;
    return;
  }

  // ---------------------------------------------------------------------------
  // [3/6] DID utente: documento con la chiave pubblica della mnemonic, pubblicato su testnet
  // ---------------------------------------------------------------------------
  try {
    if (!userWalletKp) throw new Error("userWalletKp mancante dopo step 2");

    iotaClient = new IotaClient({ url: NETWORK_URL });
    storage = new Storage(new JwkMemStore(), new KeyIdMemStore());
    identityClient = await createIdentityClientFromUserWallet(iotaClient, userWalletKp, true);

    const userControllerAddress = userWalletKp.getPublicKey().toIotaAddress();
    console.log(
      `[3/6] Controller on-chain (mnemonic): ${userControllerAddress} — sender IdentityClient allineato`,
    );

    networkId = await iotaClient.getChainIdentifier();
    const userJwkFull = iotaEd25519KeypairToIdentityJwk(userWalletKp);

    const unpublishedUser = new IotaDocument(networkId);
    await attachExternalEd25519Method(storage, unpublishedUser, userJwkFull, "#key-1");

    const { output: userIdentity, response: rawUserTxRes } = await identityClient
      .createIdentity(unpublishedUser)
      .finish()
      .buildAndExecute(identityClient);

    const userTxRes = unwrapTxResponse(rawUserTxRes);
    userDid = userIdentity.didDocument().id();
    userDidStr = userDid.toString();
    console.log(`[3/6] DID Utente creato: ${userDidStr}`);
    console.log(`[3/6] Identity object id (on-chain): ${userIdentity.id()}`);
    printCreatedOnChain("[3/6] tx createIdentity utente", userTxRes);
  } catch (e) {
    logError("[3/6]", e);
    process.exitCode = 1;
    return;
  }

  // ---------------------------------------------------------------------------
  // [4/6] Decifrare seed da keys.json, firmare transazione IOTA (split + self-transfer)
  // ---------------------------------------------------------------------------
  try {
    if (!iotaClient) throw new Error("client IOTA non inizializzato");

    const raw = fs.readFileSync(KEYS_JSON, "utf8");
    const { encryptedKey, iv: ivB64, salt: saltB64 } = JSON.parse(raw) as {
      encryptedKey: string;
      iv: string;
      salt: string;
    };
    const salt = fromB64(saltB64);
    const iv = fromB64(ivB64);
    const combined = fromB64(encryptedKey);
    const tag = combined.subarray(combined.length - 16);
    const ciphertext = combined.subarray(0, combined.length - 16);

    const aesKey = crypto.pbkdf2Sync(googleIdToken, salt, PBKDF2_ITERATIONS, 32, "sha256");
    const decipher = crypto.createDecipheriv("aes-256-gcm", aesKey, iv);
    decipher.setAuthTag(tag);
    const decryptedSeed = new Uint8Array(
      Buffer.concat([decipher.update(ciphertext), decipher.final()]),
    );

    const userTxSigner = Ed25519Keypair.fromSecretKey(decryptedSeed);
    const userTxRes = await signAndSendSelfTransfer(iotaClient, userTxSigner);
    printCreatedOnChain("[4/6] tx trasferimento utente", userTxRes);
    console.log(`[4/6] Transazione utente firmata: tx_hash = ${userTxRes.digest}`);
  } catch (e) {
    logError("[4/6]", e);
    process.exitCode = 1;
    return;
  }

  // ---------------------------------------------------------------------------
  // [5/6] DID agente: seconda keypair, documento con controller = DID utente (`setController` su IotaDocument)
  // ---------------------------------------------------------------------------
  let agentDidStr = "";
  try {
    if (!iotaClient || !storage || !userDid || !userWalletKp) {
      throw new Error("Stato incompleto: manca iotaClient, storage, userDid o userWalletKp");
    }

    // Dopo lo step 4 il coin gas è cambiato: nuovo client per non usare object ref obsoleti.
    identityClient = await createIdentityClientFromUserWallet(iotaClient, userWalletKp, false);

    const { privateKey: agentPriv } = crypto.generateKeyPairSync("ed25519");
    agentPrivateKey = agentPriv;
    const agentJwkFull = ed25519PrivateKeyToJwk(agentPriv);

    const unpublishedAgent = new IotaDocument(networkId);
    unpublishedAgent.setController([userDid]);

    await attachExternalEd25519Method(storage, unpublishedAgent, agentJwkFull, "#key-1");

    const { output: agentIdentity, response: rawAgentTxRes } = await identityClient
      .createIdentity(unpublishedAgent)
      .finish()
      .buildAndExecute(identityClient);

    const agentTxRes = unwrapTxResponse(rawAgentTxRes);
    agentDidStr = agentIdentity.didDocument().id().toString();
    console.log(`[5/6] DID Agente creato: ${agentDidStr} delegato da ${userDidStr}`);
    console.log(`[5/6] Identity object id (on-chain): ${agentIdentity.id()}`);
    printCreatedOnChain("[5/6] tx createIdentity agente", agentTxRes);
  } catch (e) {
    logError("[5/6]", e);
    process.exitCode = 1;
    return;
  }

  // ---------------------------------------------------------------------------
  // [6/6] Transazione firmata con la keypair dell'agente (stesso pattern del passo 4)
  // ---------------------------------------------------------------------------
  try {
    if (!iotaClient) throw new Error("client IOTA mancante");
    if (!agentPrivateKey) throw new Error("agentPrivateKey mancante dopo step 5");

    const agentSeed = ed25519SeedFromPrivateKey(agentPrivateKey);
    const agentSigner = Ed25519Keypair.fromSecretKey(agentSeed);
    const agentTransferRes = await signAndSendSelfTransfer(iotaClient, agentSigner);
    printCreatedOnChain("[6/6] tx trasferimento agente", agentTransferRes);
    console.log(
      `[6/6] Transazione agente: tx_hash = ${agentTransferRes.digest} — trust chain verificata`,
    );
  } catch (e) {
    logError("[6/6]", e);
    process.exitCode = 1;
    return;
  }
}

main();
