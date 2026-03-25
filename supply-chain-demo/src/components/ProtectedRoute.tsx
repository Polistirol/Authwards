import type { ReactElement } from "react";
import { Navigate } from "react-router-dom";

import { useAuthwards } from "../../../sdk";

export function ProtectedRoute({ children }: { children: ReactElement }) {
  const { user, loading } = useAuthwards();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0c1220] text-slate-400">
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return children;
}
