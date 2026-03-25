import { Navigate } from "react-router-dom";

import { ConnectButton, useAuthwards } from "../../../sdk";
import { TraceFlowFooter, TraceFlowHeader, TraceFlowShell } from "../components/TraceFlowLayout";

export function Landing() {
  const { user, loading } = useAuthwards();

  if (loading) {
    return (
      <TraceFlowShell>
        <TraceFlowHeader
          right={
            <ConnectButton
              theme="dark"
              frontendUrl={import.meta.env.VITE_FRONTEND_URL || undefined}
            />
          }
        />
        <main className="mx-auto flex max-w-3xl flex-1 flex-col items-center justify-center px-4 py-16 text-center text-slate-400">
          Loading…
        </main>
        <TraceFlowFooter />
      </TraceFlowShell>
    );
  }

  if (user) {
    return <Navigate to="/shipments" replace />;
  }

  return (
    <TraceFlowShell>
      <TraceFlowHeader
        right={
          <ConnectButton
            theme="dark"
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
      </main>
      <TraceFlowFooter />
    </TraceFlowShell>
  );
}
