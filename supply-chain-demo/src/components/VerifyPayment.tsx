import { useCallback, useState, type ReactNode } from "react";

import type { TxResolution } from "../../../sdk";
import { useResolve } from "../../../sdk";
import { explorerDidUrl, explorerObjectUrl, explorerTxUrl } from "../lib/explorer";

const NANOS_PER_IOTA = 1_000_000_000;

function truncateMiddle(s: string, head = 8, tail = 6): string {
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

function formatPermitIota(nanos: number | undefined): string {
  if (nanos === undefined || Number.isNaN(nanos)) return "—";
  return (nanos / NANOS_PER_IOTA).toLocaleString(undefined, { maximumFractionDigits: 6 });
}

export interface VerifyPaymentProps {
  txHash: string;
  /** DID of the party that was expected to authorize payment (e.g. shipment recipient). */
  expectedReceiverDid: string;
}

export function VerifyPayment({ txHash, expectedReceiverDid }: VerifyPaymentProps) {
  const { resolveTransaction } = useResolve();
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<TxResolution | null>(null);
  const [visibleSteps, setVisibleSteps] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = useCallback(async () => {
    setVerifying(true);
    setError(null);
    setResult(null);
    setVisibleSteps(0);
    try {
      const res = await resolveTransaction(txHash);
      setResult(res);
      setVerifying(false);
      for (let i = 1; i <= 5; i++) {
        await new Promise((r) => setTimeout(r, 200));
        setVisibleSteps(i);
      }
    } catch {
      setError("Verification unavailable — the resolve service could not be reached.");
      setVerifying(false);
    }
  }, [resolveTransaction, txHash]);

  const btnClass =
    "rounded-lg border border-sky-300 bg-white px-4 py-2.5 text-sm font-semibold text-sky-800 shadow-sm transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60";

  const linkClass = "font-medium text-sky-600 underline decoration-sky-300 hover:text-sky-800";

  if (error && !result) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-sky-800/90">{error}</p>
        <p className="font-mono text-xs text-sky-700/85">
          {truncateMiddle(txHash)}{" "}
          <a href={explorerTxUrl(txHash)} target="_blank" rel="noreferrer" className={linkClass}>
            ↗
          </a>
        </p>
        <button type="button" disabled={verifying} onClick={() => void handleVerify()} className={btnClass}>
          {verifying ? "⏳ Verifying…" : "🔍 Verify payment"}
        </button>
      </div>
    );
  }

  if (!result) {
    return (
      <div>
        <button type="button" disabled={verifying} onClick={() => void handleVerify()} className={btnClass}>
          {verifying ? "⏳ Verifying…" : "🔍 Verify payment"}
        </button>
        <p className="mt-2 max-w-md text-xs text-sky-700/80">
          Resolve the trust chain for this transaction via Authward SDK
        </p>
      </div>
    );
  }

  const permit = result.permit;
  const step1Ok = Boolean(result.txHash);
  const step2Ok = result.isDelegate;
  const step3Ok = Boolean(permit?.isActive);
  const resolvedRecipientDid = result.isDelegate ? result.ownerDid : result.senderDid;
  const step4Ok =
    resolvedRecipientDid !== null &&
    resolvedRecipientDid !== undefined &&
    resolvedRecipientDid === expectedReceiverDid;
  const allStepsGreen =
    result.trustChain.verified &&
    step4Ok &&
    (result.isDelegate ? step2Ok && step3Ok : true);

  return (
    <div className="rounded-2xl border border-sky-200/90 bg-white/95 p-5 shadow-md shadow-sky-100/50">
      <div className="space-y-5">
        {visibleSteps >= 1 ? (
          <VerifyStep
            ok={step1Ok}
            title="Transaction found"
            body={
              <>
                <p className="text-sky-800/90">
                  Hash:{" "}
                  <span className="font-mono text-sky-950">{truncateMiddle(result.txHash)}</span>{" "}
                  <a href={explorerTxUrl(result.txHash)} target="_blank" rel="noreferrer" className={linkClass}>
                    ↗
                  </a>
                </p>
                <p className="text-sky-700/85">
                  Signed by: <span className="font-mono text-sky-900">{truncateMiddle(result.sender)}</span>
                </p>
              </>
            }
          />
        ) : null}

        {visibleSteps >= 2 ? (
          <VerifyStep
            ok={step2Ok}
            title="Delegate identity resolved"
            body={
              result.isDelegate ? (
                <>
                  <p className="text-sky-800/90">
                    DID:{" "}
                    {result.senderDid ? (
                      <a
                        href={explorerDidUrl(result.senderDid)}
                        target="_blank"
                        rel="noreferrer"
                        className={`font-mono ${linkClass}`}
                      >
                        {truncateMiddle(result.senderDid)}
                      </a>
                    ) : (
                      "—"
                    )}{" "}
                    {result.senderDid ? (
                      <a href={explorerDidUrl(result.senderDid)} target="_blank" rel="noreferrer" className={linkClass}>
                        ↗
                      </a>
                    ) : null}
                  </p>
                  <p className="text-sky-700/85">Name: Payment delegate</p>
                  {result.ownerDid ? (
                    <p className="text-sky-700/85">
                      Controlled by:{" "}
                      <span className="font-mono text-sky-900">{truncateMiddle(result.ownerDid)}</span>
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-sky-700/85">This transaction was not sent via a delegate identity.</p>
              )
            }
          />
        ) : null}

        {visibleSteps >= 3 ? (
          <VerifyStep
            ok={step3Ok}
            title="AgentPermit verified on-chain"
            body={
              permit?.permitObjectId ? (
                <>
                  <p className="text-sky-800/90">
                    Permit:{" "}
                    <a
                      href={explorerObjectUrl(permit.permitObjectId)}
                      target="_blank"
                      rel="noreferrer"
                      className={`font-mono ${linkClass}`}
                    >
                      {truncateMiddle(permit.permitObjectId)}
                    </a>{" "}
                    <a
                      href={explorerObjectUrl(permit.permitObjectId)}
                      target="_blank"
                      rel="noreferrer"
                      className={linkClass}
                    >
                      ↗
                    </a>
                  </p>
                  <p className="text-sky-700/85">
                    Limit: {formatPermitIota(permit.maxPerTx)} IOTA/tx · {formatPermitIota(permit.maxPerDay)} IOTA/day
                  </p>
                  <p className="text-sky-700/85">Status: {permit.isActive ? "Active" : "Inactive"}</p>
                </>
              ) : (
                <p className="text-sky-700/85">No permit object linked to this resolution.</p>
              )
            }
          />
        ) : null}

        {visibleSteps >= 4 ? (
          <VerifyStep
            ok={step4Ok}
            title="Owner matches shipment recipient"
            body={
              <>
                <p className="text-sky-700/85">
                  Expected:{" "}
                  <span className="font-mono text-sky-950">{truncateMiddle(expectedReceiverDid)}</span>
                </p>
                <p className="text-sky-700/85">
                  Resolved:{" "}
                  <span className="font-mono text-sky-950">
                    {resolvedRecipientDid ? truncateMiddle(resolvedRecipientDid) : "—"}
                  </span>
                </p>
              </>
            }
          />
        ) : null}

        {visibleSteps >= 5 ? (
          <>
            <div className="border-t border-sky-200/90 pt-4" />
            {allStepsGreen ? (
              <div className="rounded-xl border border-sky-200 bg-sky-50/90 p-4 text-sky-900 shadow-sm shadow-sky-100/80">
                <p className="font-semibold text-sky-950">✅ Payment verified</p>
                <p className="mt-2 text-sm text-sky-800/90">
                  This transaction was authorized by the shipment recipient through a delegated identity with
                  on-chain verifiable permissions.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-4 text-sky-900 shadow-sm shadow-sky-100/80">
                <p className="font-semibold text-sky-950">Payment not fully verified</p>
                <p className="mt-2 text-sm text-sky-800/85">
                  Some trust-chain checks did not match the expected recipient or delegate path. The transaction
                  hash on the explorer remains valid for inspection.
                </p>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

function VerifyStep({
  ok,
  title,
  body,
}: {
  ok: boolean;
  title: string;
  body: ReactNode;
}) {
  return (
    <div className="border-b border-sky-200/80 pb-4 last:border-0 last:pb-0">
      <div className="flex gap-3">
        <span className="shrink-0 text-lg" style={{ color: ok ? "#22c55e" : "#ef4444" }}>
          {ok ? "✓" : "✗"}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium text-sky-950">{title}</p>
          <div className="text-sm">{body}</div>
        </div>
      </div>
    </div>
  );
}
