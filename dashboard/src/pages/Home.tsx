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
      <div className="flex min-h-screen items-center justify-center bg-[#0a0b0f] text-[#e2e4ed]">
        <p className="text-sm opacity-70">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0b0f] text-[#e2e4ed]">
      <header className="border-b border-white/5 px-6 py-4">
        <span className="text-sm font-semibold tracking-wide text-[#6ee7b7]">
          Authwards
        </span>
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-24 pt-16">
        <section className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl">
            Authwards
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#a8abb8]">
            Your Google identity becomes an IOTA DID. Create delegate identities with
            verifiable on-chain permissions.
          </p>
          <button
            type="button"
            onClick={() => login()}
            className="mt-10 rounded-xl bg-[#6ee7b7] px-8 py-3.5 text-base font-semibold text-[#0a0b0f] shadow-[0_0_32px_rgba(110,231,183,0.25)] transition hover:bg-[#5dd9a8]"
          >
            Sign in
          </button>
        </section>

        <section className="mt-24 grid gap-6 md:grid-cols-3">
          <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-left shadow-lg">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/5">
              <GoogleGlyph />
            </div>
            <h2 className="text-lg font-semibold text-white">Sign in with Google</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#a8abb8]">
              Secure OAuth authentication; no seed to manage on the device.
            </p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-left shadow-lg">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/5">
              <FingerprintIcon />
            </div>
            <h2 className="text-lg font-semibold text-white">DID on IOTA</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#a8abb8]">
              Self-sovereign identity on the Tangle: public, verifiable DID document.
            </p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-left shadow-lg">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/5">
              <BotIcon />
            </div>
            <h2 className="text-lg font-semibold text-white">Delegates</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#a8abb8]">
              Create delegates with permission profiles and track every action on-chain.
            </p>
          </article>
        </section>
      </main>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="28" height="28" viewBox="0 0 48 48" aria-hidden>
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

function FingerprintIcon() {
  return (
    <svg
      className="h-7 w-7 text-[#6ee7b7]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7.864 4.243A7.5 7.5 0 0119.5 10.5c0 2.92-.87 5.64-2.37 7.91m-4.66-12.12A7.5 7.5 0 004.5 10.5c0 2.92.87 5.64 2.37 7.91M9 10.5h.008v.008H9V10.5zm3 0h.008v.008H12V10.5zm3 0h.008v.008H15V10.5z"
      />
    </svg>
  );
}

function BotIcon() {
  return (
    <svg
      className="h-7 w-7 text-[#6ee7b7]"
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
