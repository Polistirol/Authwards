/**
 * TraceFlow shipment API — shared logic (no Netlify / Vite imports).
 */



export type Shipment = {
  id: string;
  trackingNumber: string;
  product: string;
  origin: string;
  destination: string;
  status: "in_transit" | "delivered" | "payment_released";
  supplierAddress: string;
  supplierDid: string;
  recipientDid: string;
  paymentAmount: number;
  txHash: string | null;
  /** Set when the shipment reaches `delivered`; cleared when demo resets to `in_transit`. */
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const initialShipments: Shipment[] = [
  {
    id: "SHIP-001",
    trackingNumber: "TF-2026-48210",
    product: "Arabica Coffee - Lot #4821",
    origin: "Bogotá, Colombia",
    destination: "Genova, Italia",
    status: "in_transit",
    supplierAddress: "0xad3f8f9c6e6f51d82bcc448b9b53280067cd0bc91f81561dc5d5b576ed642d84",
    supplierDid: "did:iota:testnet:0x33bd4c85972ed72636f1bbe196d40ed2669e2f90bdf14a558dd8a43f9f0d744c",
    recipientDid: "did:iota:0xc44e4c3516667592166d9e1f1b035dc072720e22a651c831b0ea80788582554e",
    paymentAmount: 1,
    txHash: null,
    deliveredAt: null,
    createdAt: "2026-03-20T10:00:00Z",
    updatedAt: "2026-03-20T10:00:00Z",
  },
  {
    id: "SHIP-002",
    trackingNumber: "TF-2026-11903",
    product: "Extra Virgin Olive Oil - Lot #1190",
    origin: "Kalamata, Grecia",
    destination: "Rotterdam, Paesi Bassi",
    status: "in_transit",
    supplierAddress: "0xad3f8f9c6e6f51d82bcc448b9b53280067cd0bc91f81561dc5d5b576ed642d84",
    supplierDid: "did:iota:testnet:0x33bd4c85972ed72636f1bbe196d40ed2669e2f90bdf14a558dd8a43f9f0d744c",
    recipientDid: "did:iota:0xc44e4c3516667592166d9e1f1b035dc072720e22a651c831b0ea80788582554e",
    paymentAmount: 0.5,
    txHash: null,
    deliveredAt: null,
    createdAt: "2026-03-20T11:00:00Z",
    updatedAt: "2026-03-20T11:00:00Z",
  },
];

let shipments: Shipment[] = initialShipments.map((s) => ({ ...s }));

function getShipments(): Shipment[] {
  return shipments.map((s) => ({ ...s }));
}

function getShipmentById(id: string): Shipment | undefined {
  const s = shipments.find((x) => x.id === id);
  return s ? { ...s } : undefined;
}

function patchShipment(
  id: string,
  body: { status: string; txHash?: string | null; demo?: boolean },
): { ok: true; shipment: Shipment } | { ok: false; error: string } {
  const idx = shipments.findIndex((x) => x.id === id);
  if (idx === -1) return { ok: false, error: "not_found" };

  const cur = shipments[idx];
  const nextStatus = body.status;
  const now = new Date().toISOString();

  if (body.demo === true) {
    let next = nextStatus === "completed" ? "payment_released" : nextStatus;
    if (next !== "in_transit" && next !== "delivered" && next !== "payment_released") {
      return { ok: false, error: "invalid_status" };
    }
    if (next === "in_transit") {
      shipments[idx] = {
        ...cur,
        status: "in_transit",
        txHash: null,
        deliveredAt: null,
        updatedAt: now,
      };
      return { ok: true, shipment: { ...shipments[idx] } };
    }
    if (next === "delivered") {
      shipments[idx] = {
        ...cur,
        status: "delivered",
        txHash: null,
        deliveredAt: now,
        updatedAt: now,
      };
      return { ok: true, shipment: { ...shipments[idx] } };
    }
    /* payment_released */
    shipments[idx] = {
      ...cur,
      status: "payment_released",
      txHash: body.txHash ?? cur.txHash,
      deliveredAt: cur.deliveredAt ?? now,
      updatedAt: now,
    };
    return { ok: true, shipment: { ...shipments[idx] } };
  }

  if (cur.status === "in_transit" && nextStatus === "delivered") {
    shipments[idx] = {
      ...cur,
      status: "delivered",
      deliveredAt: now,
      updatedAt: now,
    };
    return { ok: true, shipment: { ...shipments[idx] } };
  }

  if (cur.status === "delivered" && nextStatus === "payment_released") {
    shipments[idx] = {
      ...cur,
      status: "payment_released",
      txHash: body.txHash ?? cur.txHash,
      updatedAt: now,
    };
    return { ok: true, shipment: { ...shipments[idx] } };
  }

  return { ok: false, error: "invalid_transition" };
}

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
};

export function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export type NetlifyLikeEvent = {
  httpMethod: string;
  path?: string;
  rawUrl?: string;
  body: string | null;
  queryStringParameters: Record<string, string | undefined> | null;
  headers: Record<string, string | undefined>;
};

export function netlifyApiPath(event: NetlifyLikeEvent): string {
  const fromQuery = event.queryStringParameters?.path;
  if (typeof fromQuery === "string" && fromQuery.length > 0) {
    const decoded = decodeURIComponent(fromQuery.replace(/\+/g, " "));
    const parts = decoded.split("/").filter(Boolean);
    const p = `/${parts.join("/")}`;
    return p.replace(/\/+$/, "") || "/";
  }

  let pathname = event.path ?? "/";
  try {
    if (event.rawUrl) {
      pathname = new URL(event.rawUrl).pathname;
    }
  } catch {
    /* ignore */
  }
  const fromHeader =
    event.headers["x-netlify-original-path"] ?? event.headers["x-invoke-path"];
  if (typeof fromHeader === "string" && fromHeader.startsWith("/api")) {
    pathname = fromHeader.split("?")[0];
  }

  let p = pathname;
  if (p.includes("/.netlify/functions/api")) {
    p = p.replace(/^.*\/\.netlify\/functions\/api/, "") || "/";
  } else {
    p = p.replace(/^\/api/, "") || "/";
  }
  if (!p.startsWith("/")) p = `/${p}`;
  return p.replace(/\/+$/, "") || "/";
}

export function routeShipments(
  method: string,
  segments: string[],
  rawBody: string | null,
): ReturnType<typeof json> {
  if (segments[0] !== "shipments") {
    return json(404, { error: "not_found" });
  }

  if (segments.length === 1 && method === "GET") {
    return json(200, { shipments: getShipments() });
  }

  if (segments.length === 2 && method === "GET") {
    const id = decodeURIComponent(segments[1]);
    const shipment = getShipmentById(id);
    if (!shipment) return json(404, { error: "not_found" });
    return json(200, { shipment });
  }

  if (segments.length === 2 && method === "PATCH") {
    const id = decodeURIComponent(segments[1]);
    let body: { status?: string; txHash?: string | null; demo?: boolean };
    try {
      body = JSON.parse(rawBody || "{}") as {
        status?: string;
        txHash?: string | null;
        demo?: boolean;
      };
    } catch {
      return json(400, { error: "invalid_json" });
    }
    if (typeof body.status !== "string") {
      return json(400, { error: "status_required" });
    }
    const result = patchShipment(id, {
      status: body.status,
      txHash: body.txHash,
      demo: body.demo === true,
    });
    if (!result.ok) {
      if (result.error === "not_found") return json(404, { error: "not_found" });
      if (result.error === "invalid_status") return json(400, { error: "invalid_status" });
      return json(400, { error: "invalid_transition" });
    }
    return json(200, { shipment: result.shipment });
  }

  return json(404, { error: "not_found" });
}
