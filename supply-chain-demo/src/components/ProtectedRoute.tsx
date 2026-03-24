import type { ReactElement } from "react";
import { Navigate } from "react-router-dom";

import { useIotaAuth } from "../../../sdk";

export function ProtectedRoute({ children }: { children: ReactElement }) {
  const { user, loading } = useIotaAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0c1220] text-slate-400">
        Caricamento…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return children;
}
