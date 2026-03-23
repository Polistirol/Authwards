import { useCallback, useMemo, useState } from "react";

import { useIotaAuth } from "../sdk";

function truncateMiddle(s: string, head = 14, tail = 10): string {
  if (s.length <= head + tail + 3) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

function MaskedPhrase({ phrase, revealed }: { phrase: string; revealed: boolean }) {
  const masked = useMemo(
    () => "•".repeat(phrase.length),
    [phrase.length],
  );

  return (
    <div className="relative min-h-[3.5rem] w-full">
      <p
        className={`recovery-phrase-crossfade font-mono text-sm leading-relaxed break-all whitespace-pre-wrap ${
          revealed
            ? "pointer-events-none absolute inset-0 opacity-0"
            : "relative opacity-100"
        }`}
        aria-hidden={revealed}
      >
        {masked}
      </p>
      <p
        className={`recovery-phrase-crossfade font-mono text-sm leading-relaxed break-all whitespace-pre-wrap text-[#e2e4ed] selection:bg-[#6ee7b7]/30 ${
          revealed
            ? "relative opacity-100"
            : "pointer-events-none absolute inset-0 opacity-0"
        }`}
      >
        {phrase}
      </p>
    </div>
  );
}

export default function WelcomeModal() {
  const {
    isFirstLogin,
    recoveryPhrase,
    did,
    walletAddress,
    acknowledgeFirstLogin,
  } = useIotaAuth();

  const [revealed, setRevealed] = useState(false);
  const [savedConfirm, setSavedConfirm] = useState(false);
  const [copyPhraseOk, setCopyPhraseOk] = useState(false);
  const [copyDidOk, setCopyDidOk] = useState(false);
  const [copyWalletOk, setCopyWalletOk] = useState(false);

  const phrase = recoveryPhrase ?? "";
  const show = isFirstLogin && Boolean(recoveryPhrase);

  const copyPhrase = useCallback(async () => {
    if (!phrase) return;
    try {
      await navigator.clipboard.writeText(phrase);
      setCopyPhraseOk(true);
      setTimeout(() => setCopyPhraseOk(false), 2000);
    } catch {
      /* ignore */
    }
  }, [phrase]);

  const copyDidVal = useCallback(async () => {
    if (!did) return;
    try {
      await navigator.clipboard.writeText(did);
      setCopyDidOk(true);
      setTimeout(() => setCopyDidOk(false), 2000);
    } catch {
      /* ignore */
    }
  }, [did]);

  const copyWalletVal = useCallback(async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopyWalletOk(true);
      setTimeout(() => setCopyWalletOk(false), 2000);
    } catch {
      /* ignore */
    }
  }, [walletAddress]);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        aria-describedby="welcome-desc"
        className="welcome-modal-enter max-h-[min(92vh,900px)] w-full max-w-[520px] overflow-y-auto rounded-2xl border border-[#2a2d3a] bg-[#12131a] p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#6ee7b7]/15">
            <svg
              className="h-9 w-9 text-[#6ee7b7]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1
            id="welcome-title"
            className="mt-5 text-2xl font-bold tracking-tight text-white"
          >
            Benvenuto su IOTA
          </h1>
          <p id="welcome-desc" className="mt-2 text-sm text-slate-400">
            La tua identità decentralizzata è stata creata
          </p>
        </header>

        <section className="mt-8 rounded-xl border border-[#2a2d3a] bg-[#161821] p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Il tuo DID
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="break-all text-sm text-[#6ee7b7]">
              {did ? truncateMiddle(did) : "—"}
            </code>
            <button
              type="button"
              onClick={() => void copyDidVal()}
              disabled={!did}
              className="shrink-0 rounded-lg border border-[#2a2d3a] bg-white/5 px-2.5 py-1 text-xs font-medium text-[#6ee7b7] hover:bg-white/10 disabled:opacity-40"
            >
              {copyDidOk ? "Copiato ✓" : "Copia"}
            </button>
          </div>

          <p className="mt-5 text-xs font-medium uppercase tracking-wide text-slate-500">
            Il tuo Wallet
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="break-all text-sm text-[#6ee7b7]">
              {walletAddress ? truncateMiddle(walletAddress) : "—"}
            </code>
            <button
              type="button"
              onClick={() => void copyWalletVal()}
              disabled={!walletAddress}
              className="shrink-0 rounded-lg border border-[#2a2d3a] bg-white/5 px-2.5 py-1 text-xs font-medium text-[#6ee7b7] hover:bg-white/10 disabled:opacity-40"
            >
              {copyWalletOk ? "Copiato ✓" : "Copia"}
            </button>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            Questi sono tuoi. Puoi usarli su qualsiasi dApp IOTA, anche al di
            fuori di questo servizio.
          </p>
        </section>

        <section className="mt-8 rounded-xl border border-[#2a2d3a] border-l-[3px] border-l-[#fbbf24] bg-[#161821] p-5">
          <h2 className="text-base font-semibold text-white">
            La tua chiave di recupero
          </h2>

          <div className="mt-4 flex gap-3 rounded-lg bg-[#fbbf24]/10 p-3">
            <span className="text-lg leading-none text-[#fbbf24]" aria-hidden>
              ⚠
            </span>
            <p className="text-sm leading-relaxed text-slate-300">
              Questa è l&apos;unica volta che vedrai questa chiave. Salvala in un
              luogo sicuro. Con questa chiave puoi importare il tuo wallet nel
              wallet ufficiale IOTA e usarlo ovunque.
            </p>
          </div>

          <div className="mt-4 flex gap-2">
            <div className="min-w-0 flex-1 rounded-lg border border-[#6ee7b7]/35 bg-[#0a0b0f] px-3 py-3 transition-shadow duration-300">
              <MaskedPhrase phrase={phrase} revealed={revealed} />
            </div>
            <button
              type="button"
              onClick={() => setRevealed((r) => !r)}
              className="h-11 w-11 shrink-0 rounded-lg border border-[#2a2d3a] bg-white/5 text-lg leading-none text-[#e2e4ed] transition hover:bg-white/10"
              title={revealed ? "Nascondi" : "Mostra"}
              aria-label={revealed ? "Nascondi chiave" : "Mostra chiave"}
            >
              👁
            </button>
          </div>

          <button
            type="button"
            onClick={() => void copyPhrase()}
            className="mt-3 w-full rounded-lg border border-[#2a2d3a] bg-white/5 py-2.5 text-sm font-medium text-[#6ee7b7] transition hover:bg-white/10"
          >
            {copyPhraseOk ? "Copiata ✓" : "Copia"}
          </button>
        </section>

        <footer className="mt-8 border-t border-[#2a2d3a] pt-6">
          <label className="flex cursor-pointer gap-3 text-sm text-slate-300">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#2a2d3a] bg-[#161821] accent-[#6ee7b7]"
              checked={savedConfirm}
              onChange={(e) => setSavedConfirm(e.target.checked)}
            />
            <span>Ho salvato la mia chiave di recupero in un luogo sicuro</span>
          </label>

          <button
            type="button"
            disabled={!savedConfirm}
            onClick={() => acknowledgeFirstLogin()}
            className="mt-3 w-full rounded-xl bg-[#6ee7b7] py-3.5 text-sm font-semibold text-[#0a0b0f] transition hover:bg-[#5dd9a8] disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-400 disabled:hover:bg-slate-600"
          >
            Inizia a usare IOTA
          </button>
        </footer>
      </div>
    </div>
  );
}
