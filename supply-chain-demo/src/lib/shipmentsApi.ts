export type Shipment = {
  id: string;
  product: string;
  origin: string;
  destination: string;
  status: string;
  supplier: string;
  paymentAmount: number;
  createdAt: string;
};

function trimSlash(u: string): string {
  return u.replace(/\/+$/, "");
}

export async function fetchShipments(
  backendUrl: string,
  token: string,
): Promise<Shipment[]> {
  const res = await fetch(`${trimSlash(backendUrl)}/shipments`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as Shipment[];
}

export async function fetchShipmentById(
  backendUrl: string,
  token: string,
  id: string,
): Promise<Shipment> {
  const res = await fetch(`${trimSlash(backendUrl)}/shipments/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as Shipment;
}

export async function patchShipmentStatus(
  backendUrl: string,
  token: string,
  id: string,
  status: string,
): Promise<Shipment> {
  const res = await fetch(`${trimSlash(backendUrl)}/shipments/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as Shipment;
}
