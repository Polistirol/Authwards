import { Link } from "react-router-dom";

import { ConnectButton, useIotaAuth } from "../../../sdk";
import { TraceFlowFooter, TraceFlowHeader, TraceFlowShell } from "../components/TraceFlowLayout";

export function Landing() {
  const { user, login } = useIotaAuth();

  return (
    <TraceFlowShell>
      <TraceFlowHeader
        right={
          <ConnectButton
            theme="dark"
            label="Sign in with Google"
            frontendUrl={import.meta.env.VITE_FRONTEND_URL || undefined}
          />
        }
      />
      <main className="mx-auto flex max-w-3xl flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-amber-500/90">
          Supply chain visibility
        </p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight text-white md:text-5xl">
          Track your shipments.
          <br />
          <span className="text-amber-400">Automate payments.</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-slate-400">
          Sign in to monitor your shipments and delegate autonomous agents for supplier payments.
        </p>
        <div className="mt-10">
          {user ? (
            <Link
              to="/shipments"
              className="inline-flex rounded-xl bg-amber-500 px-8 py-3 text-base font-semibold text-[#0c1220] shadow-lg shadow-amber-500/20 hover:bg-amber-400"
            >
              Open shipments
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => login()}
              className="inline-flex rounded-xl bg-amber-500 px-8 py-3 text-base font-semibold text-[#0c1220] shadow-lg shadow-amber-500/20 hover:bg-amber-400"
            >
              Sign in with Google
            </button>
          )}
        </div>
      </main>
      <TraceFlowFooter />
    </TraceFlowShell>
  );
}
