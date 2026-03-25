import { useState } from "react";

import type { CreateAgentResult } from "../../../sdk";
import { useAgent, useAuthwards } from "../../../sdk";
import { truncateDid } from "../lib/format";
import type { Shipment } from "../lib/shipmentsApi";
import SnippetModal from "./SnippetModal";

export type AgentSetupProps = {
  shipment: Shipment;
  open: boolean;
  onClose: () => void;
};

type ProfileChoice = "low_value" | "full_access";

export function AgentSetup({ shipment, open, onClose }: AgentSetupProps) {
  const { createAgent } = useAgent();
  const { token, backendUrl } = useAuthwards();
  const [profile, setProfile] = useState<ProfileChoice>("low_value");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<CreateAgentResult | null>(null);
  const [snippetOpen, setSnippetOpen] = useState(false);

  if (!open) return null;

  async function handleCreate(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const res = await createAgent({
        permissionProfile: profile,
        name: `TraceFlow · ${shipment.product}`.slice(0, 120),
        description:
          "Automatic payment to the supplier when the shipment is marked delivered (external n8n workflow).",
        taskType: "shipment_monitor",
        taskConfig: { shipmentId: shipment.id, action: "release_payment" },
      });
      if (!res) {
        setError("Creation failed. Please try again.");
        return;
      }
      setSuccess(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  function handleClose(): void {
    setSuccess(null);
    setError(null);
    setProfile("low_value");
    onClose();
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[160] flex items-center justify-center bg-black/65 p-4 backdrop-blur-[1px]"
        role="presentation"
        onClick={handleClose}
      >
        <div
          className="tf-modal-enter max-h-[min(90vh,800px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-600 bg-[#1e293b] shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="agent-setup-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-slate-600 p-6">
            <div className="flex items-start justify-between gap-3">
              <h2 id="agent-setup-title" className="text-xl font-semibold text-white">
                {success
                  ? "Identity created"
                  : `Configure Agent for ${shipment.product}`}
              </h2>
              <button
                type="button"
                onClick={handleClose}
                className="shrink-0 rounded-lg border border-slate-600 px-3 py-1 text-sm text-slate-400 hover:bg-white/5"
              >
                Close
              </button>
            </div>
          </div>

          <div className="p-6 pt-4">
            {success ? (
              <div className="space-y-4">
                <p className="text-sm leading-relaxed text-slate-300">
                  Connect this agent to your n8n workflow or bot.
                </p>
                <div className="rounded-xl border border-slate-600 bg-[#131a2a] p-4">
                  <p className="text-xs uppercase text-slate-500">Agent DID</p>
                  <code className="mt-1 block break-all text-sm text-amber-400">{success.agentDid}</code>
                  <p className="mt-3 text-xs uppercase text-slate-500">Status</p>
                  <p className="mt-1 text-sm font-medium text-amber-200">Pending activation</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSnippetOpen(true)}
                  className="w-full rounded-xl border border-amber-500/50 bg-amber-500/15 py-3 text-sm font-semibold text-amber-200 hover:bg-amber-500/25"
                >
                  View Snippet to connect the agent
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm leading-relaxed text-slate-300">
                  Create an agent identity on the Authward platform. Then connect an external workflow to
                  automate the payment (n8n, bot, script).
                </p>
                <div className="mt-5 space-y-2 rounded-xl border border-slate-600 bg-[#131a2a] p-4 text-sm text-slate-300">
                  <p>
                    <span className="text-slate-500">Shipment:</span>{" "}
                    <span className="text-white">{shipment.id}</span>
                  </p>
                  <p>
                    <span className="text-slate-500">Action:</span> release payment on delivery
                  </p>
                  <p>
                    <span className="text-slate-500">Amount:</span>{" "}
                    <span className="text-white">{shipment.paymentAmount} IOTA</span>
                  </p>
                  <p>
                    <span className="text-slate-500">Recipient:</span>{" "}
                    <span className="break-all text-slate-200">{truncateDid(shipment.supplier)}</span>
                  </p>
                </div>

                <fieldset className="mt-6">
                  <legend className="text-sm font-medium text-white">Permission profile</legend>
                  <div className="mt-3 space-y-3">
                    <label className="flex cursor-pointer gap-3 rounded-xl border border-slate-600 bg-[#131a2a] p-4 has-[:checked]:border-amber-500/60">
                      <input
                        type="radio"
                        name="perm"
                        className="mt-1 accent-amber-500"
                        checked={profile === "low_value"}
                        onChange={() => setProfile("low_value")}
                      />
                      <div>
                        <p className="font-medium text-white">Standard</p>
                        <p className="text-sm text-slate-400">max 50 IOTA per transazione</p>
                      </div>
                    </label>
                    <label className="flex cursor-pointer gap-3 rounded-xl border border-slate-600 bg-[#131a2a] p-4 has-[:checked]:border-amber-500/60">
                      <input
                        type="radio"
                        name="perm"
                        className="mt-1 accent-amber-500"
                        checked={profile === "full_access"}
                        onChange={() => setProfile("full_access")}
                      />
                      <div>
                        <p className="font-medium text-white">Premium</p>
                        <p className="text-sm text-slate-400">no practical limit (full_access)</p>
                      </div>
                    </label>
                  </div>
                </fieldset>

                {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleCreate()}
                  className="mt-6 w-full rounded-xl bg-amber-500 py-3 text-sm font-semibold text-[#0c1220] hover:bg-amber-400 disabled:opacity-50"
                >
                  {busy ? "Creating…" : "Create Agent Identity"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {success ? (
        <SnippetModal
          open={snippetOpen}
          onClose={() => setSnippetOpen(false)}
          agentDid={success.agentDid}
          agentStatus="created"
          backendUrl={backendUrl}
          token={token}
        />
      ) : null}
    </>
  );
}
