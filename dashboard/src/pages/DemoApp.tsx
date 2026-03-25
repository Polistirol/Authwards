import { useAuthwards } from "../sdk";

const CODE_SNIPPET = `import { AuthwardsProvider, useAuthwards } from "@authwards/sdk";

function App() {
  return (
    <AuthwardsProvider backendUrl="http://localhost:3000">
      <MyDapp />
    </AuthwardsProvider>
  );
}

function MyDapp() {
  const { user, did, isAuthenticated, login, logout } = useAuthwards();
  if (!isAuthenticated) return <button onClick={login}>Sign in</button>;
  return <p>Welcome, {user?.name} — {did}</p>;
}`;

export default function DemoApp() {
  const { user, did, isAuthenticated, loading, login } = useAuthwards();

  return (
    <div className="min-h-screen bg-[#1e293b] text-slate-100">
      <header className="border-b border-white/10 bg-[#0f172a]/80 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <span className="text-lg font-bold tracking-tight text-[#60a5fa]">
            IoTa Data Exchange
          </span>
          <span className="text-xs uppercase tracking-widest text-slate-500">
            demo dApp
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-14">
        {loading ? (
          <p className="text-slate-400">Loading…</p>
        ) : !isAuthenticated ? (
          <div className="rounded-2xl border border-white/10 bg-[#0f172a] p-10 text-center shadow-xl">
            <p className="text-lg text-slate-200">
              To use this dApp, sign in with Authwards
            </p>
            <button
              type="button"
              onClick={() => login()}
              className="mt-8 rounded-xl bg-[#60a5fa] px-8 py-3 font-semibold text-[#0f172a] shadow-[0_0_24px_rgba(96,165,250,0.35)] transition hover:bg-[#93c5fd]"
            >
              Sign in with Authwards
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="rounded-2xl border border-[#60a5fa]/30 bg-[#0f172a] p-8 shadow-lg">
              <p className="text-xl font-semibold text-white">
                Welcome! Your identity:{" "}
                <code className="break-all text-base font-normal text-[#60a5fa]">
                  {did ?? ""}
                </code>
              </p>
              <p className="mt-4 leading-relaxed text-slate-400">
                This dApp is powered by the Authwards SDK. The developer integrated
                authentication in just a few lines of code.
              </p>
            </div>

            <div>
              <p className="mb-3 text-sm font-medium text-slate-500">
                Typical integration
              </p>
              <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/30 p-5 font-mono text-sm leading-relaxed text-slate-300">
                <code>{CODE_SNIPPET}</code>
              </pre>
            </div>

            {user ? (
              <p className="text-center text-sm text-slate-500">
                Signed in as {user.email ?? user.providerId}
              </p>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
