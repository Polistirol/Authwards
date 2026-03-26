import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export function TraceFlowHeader({
  right,
}: {
  right?: ReactNode;
}) {
  return (
    <header className="border-b border-sky-200/90 bg-white/90 backdrop-blur-md shadow-sm shadow-sky-100/50">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
        <Link to="/" className="flex items-center gap-2 text-sky-950 no-underline">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-200/90 text-lg font-bold text-sky-800 shadow-inner shadow-sky-300/40">
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
    <footer className="border-t border-sky-200/80 bg-sky-50/80 py-6 text-center text-sm text-sky-700/80">
      <span>
        Powered by <span className="font-medium text-sky-900">Authward</span>
        {" — "}
        Decentralized identity for global trade
      </span>
    </footer>
  );
}

export function TraceFlowShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-sky-50 via-blue-50/40 to-sky-100/60">
      {children}
    </div>
  );
}
