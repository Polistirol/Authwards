import { useState } from "react";

type FundAgentModalProps = {
  open: boolean;
  onClose: () => void;
  toAddress: string;
  backendUrl: string;
  token: string | null;
  onSuccess: () => void;
};

function trimSlash(u: string): string {
  return u.replace(/\/+$/, "");
}

export default function FundAgentModal({
  open,
  onClose,
  toAddress,
  backendUrl,
  token,
  onSuccess,
}: FundAgentModalProps) {
  const [iotaAmount, setIotaAmount] = useState("0.1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function submit(): Promise<void> {
    setError(null);
    const n = parseFloat(iotaAmount.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      setError("Inserisci un importo valido in IOTA (es. 0.1).");
      return;
    }
    const nanos = Math.floor(n * 1e9);
    if (!token) return;
    setBusy(true);
    try {
      const res = await fetch(`${trimSlash(backendUrl)}/wallet/transfer`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ to: toAddress, amount: nanos }),
      });
      const json: unknown = await res.json();
      if (!res.ok) {
        const msg =
          typeof json === "object" && json && "error" in json
            ? String((json as { error: unknown }).error)
            : res.statusText;
        setError(msg);
        return;
      }
      onSuccess();
      onClose();
      setIotaAmount("0.1");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore di rete");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[170] flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="fund-title"
        className="w-full max-w-md rounded-2xl border border-[#2a2d3a] bg-[#12131a] p-6 shadow-2xl"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <h2 id="fund-title" className="text-xl font-semibold text-white">
          Fondi Agente
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Trasferisci IOTA dal tuo wallet collegato all&apos;indirizzo dell&apos;agente.
        </p>
        <p className="mt-3 max-w-full break-all font-mono text-xs text-[#6ee7b7]">
          {toAddress}
        </p>
        <label className="mt-4 block">
          <span className="text-xs uppercase text-slate-500">Importo (IOTA)</span>
          <input
            type="text"
            inputMode="decimal"
            value={iotaAmount}
            onChange={(e) => setIotaAmount(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[#2a2d3a] bg-[#0a0b0f] px-3 py-2 font-mono text-sm text-white"
          />
        </label>
        {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg border border-[#2a2d3a] px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="rounded-lg bg-[#6ee7b7] px-5 py-2 text-sm font-semibold text-[#0a0b0f] disabled:opacity-50"
          >
            {busy ? "Invio…" : "Invia"}
          </button>
        </div>
      </div>
    </div>
  );
}
