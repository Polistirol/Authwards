import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export function TraceFlowHeader({
  right,
}: {
  right?: ReactNode;
}) {
  return (
    <header className="border-b border-slate-700/80 bg-[#0c1220]/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
        <Link to="/" className="flex items-center gap-2 text-white no-underline">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/20 text-lg font-bold text-amber-400">
            TF
          </span>
          <span className="text-lg font-semibold tracking-tight">TraceFlow</span>
        </Link>
        {right}
      </div>
    </header>
  );
}

export function TraceFlowFooter() {
  return (
    <footer className="border-t border-slate-700/80 py-6 text-center text-sm text-slate-500">
      Powered by <span className="text-slate-400">IOTA Auth</span>
    </footer>
  );
}

export function TraceFlowShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[#0c1220]">
      {children}
    </div>
  );
}
