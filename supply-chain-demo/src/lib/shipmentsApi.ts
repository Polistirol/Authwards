/** Base URL for TraceFlow Netlify Functions (no Authward). */
export function getTraceflowApiBase(): string {
  if (import.meta.env.PROD) return "/api";
  if (
    typeof window !== "undefined" &&
    (window.location.port === "8888" || window.location.port === "5175")
  ) {
    return "/api";
  }
  return "http://localhost:8888/api";
}

function trimSlash(u: string): string {
  return u.replace(/\/+$/, "");
}

export type Shipment = {
  id: string;
  trackingNumber: string;
  product: string;
  origin: string;
  destination: string;
  status: "in_transit" | "delivered" | "payment_released" | string;
  supplierAddress: string;
  supplierDid: string;
  receiverDid: string | null;
  paymentAmount: number;
  txHash: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function fetchShipments(): Promise<Shipment[]> {
  const base = trimSlash(getTraceflowApiBase());
  const res = await fetch(`${base}/shipments`);
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as { shipments: Shipment[] };
  return data.shipments;
}

export async function fetchShipmentById(id: string): Promise<Shipment> {
  const base = trimSlash(getTraceflowApiBase());
  const res = await fetch(`${base}/shipments/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as { shipment: Shipment };
  return data.shipment;
}

export async function patchShipmentStatus(
  id: string,
  status: string,
  txHash?: string | null,
  options?: { demo?: boolean },
): Promise<Shipment> {
  const base = trimSlash(getTraceflowApiBase());
  const body: { status: string; txHash?: string | null; demo?: boolean } = { status };
  if (txHash !== undefined) body.txHash = txHash;
  if (options?.demo === true) body.demo = true;
  const res = await fetch(`${base}/shipments/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as { shipment: Shipment };
  return data.shipment;
}
