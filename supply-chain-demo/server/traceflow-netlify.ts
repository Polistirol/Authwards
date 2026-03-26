import type { Handler, HandlerEvent } from "@netlify/functions";

import { CORS_HEADERS, netlifyApiPath, routeShipments } from "./traceflow-core";

export const traceflowNetlifyHandler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  const path = netlifyApiPath({
    httpMethod: event.httpMethod,
    path: event.path,
    rawUrl: event.rawUrl,
    body: event.body,
    queryStringParameters: event.queryStringParameters,
    headers: event.headers as Record<string, string | undefined>,
  });
  const segments = path.split("/").filter(Boolean);
  return routeShipments(event.httpMethod, segments, event.body);
};
