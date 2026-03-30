import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { useAuthwards } from "../sdk";

export default function Home() {
  const navigate = useNavigate();
  const { isAuthenticated, loading, login } = useAuthwards();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate("/dashboard", { replace: true });
    }
  }, [loading, isAuthenticated, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-aw-bg text-aw-text">
        <p className="text-sm opacity-70">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-aw-bg text-aw-text">
      <header className="border-b border-white/5 px-6 py-4">
        <span className="text-sm font-semibold tracking-wide text-aw-accent">
          Authwards
        </span>
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-24 pt-16">
        <section className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl">
            Authwards
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-400">
            Sign in with Google, GitHub, or Telegram. OAuth turns your account into an IOTA DID.
            <br />
            Create delegate identities with verifiable on-chain permissions.
          </p>
          <button
            type="button"
            onClick={() => login()}
            className="mt-10 rounded-xl bg-aw-accent px-8 py-3.5 text-base font-semibold text-aw-on-accent shadow-[0_0_32px_rgba(245,158,11,0.22)] transition hover:bg-aw-accent-hover"
          >
            Sign in
          </button>
        </section>

        <section className="mt-24 grid gap-6 md:grid-cols-3">
          <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-left shadow-lg">
            <div className="mb-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white/5 px-3">
              <GoogleGlyph className="h-7 w-7 shrink-0" />
              <GitHubGlyph className="h-7 w-7 shrink-0" />
              <TelegramGlyph className="h-7 w-7 shrink-0" />
            </div>
            <h2 className="text-lg font-semibold text-white">Social OAuth</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Use Google, GitHub, or Telegram.
              <br />
              Quick sign-in, no seed phrase on this device.
              <br />
              No wallet required.
            </p>
          </article>

          <article className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-left shadow-lg">
            <div className="mb-4 flex h-12 w-full items-center justify-center rounded-xl bg-white/5">
              <CodeBracketIcon />
            </div>
            <h2 className="text-lg font-semibold text-white">
              Integrate Authward in your dApp
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Social login, DID, and delegated identities.
              <br />
              In five lines of code.
            </p>
            <a
              href="/authward-sdk-v1_beta.zip"
              download
              className="mt-5 self-center inline-flex items-center justify-center rounded-xl border border-aw-accent/45 bg-transparent px-5 py-2.5 text-sm font-semibold text-aw-accent transition hover:border-aw-accent hover:text-aw-accent-hover"
            >
              Download SDK v1 beta
            </a>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-left shadow-lg">
            <div className="mb-4 flex h-12 w-full items-center justify-center rounded-xl bg-white/5">
              <BotIcon />
            </div>
            <h2 className="text-lg font-semibold text-white">
              Delegate, don&apos;t share keys
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Create identities for agents, teammates, or devices. Permissions enforced
              on-chain, revocable anytime.
            </p>
          </article>
        </section>
      </main>
    </div>
  );
}

function GoogleGlyph({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.58 37.88 46.98 31.75 46.98 24.55z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function GitHubGlyph({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        className="text-white"
        d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"
      />
    </svg>
  );
}

function TelegramGlyph({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="12" fill="#229ED9" />
      <path
        fill="white"
        d="M17.472 7.361l-2.15 10.14c-.162.72-.58.896-1.174.558l-3.24-2.386-1.563 1.505c-.173.173-.318.318-.653.318l.233-3.31 5.98-5.4c.26-.232-.057-.36-.403-.13l-7.39 4.66-3.18-1c-.693-.216-.706-.693.145-.998l12.4-4.78c.577-.216 1.08.13.894.998z"
      />
    </svg>
  );
}

function CodeBracketIcon() {
  return (
    <svg
      className="h-7 w-7 text-aw-accent"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25"
      />
    </svg>
  );
}

function BotIcon() {
  return (
    <svg
      className="h-7 w-7 text-aw-accent"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v.01M16 9v.01M8 9v.01"
      />
    </svg>
  );
}
