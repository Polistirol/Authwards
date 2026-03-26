import type { DbAgent } from "../types/db.js";

function safeFileNameSegment(name: string): string {
  const s = name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, "-")
    .trim()
    .slice(0, 80);
  return s || "agent";
}

function escapeForJsString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function escapeForDoubleQuotes(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Full GET /agent/:did/snippet payload with downloadable provider bundles.
 * `platformUrl` is the backend base URL passed in from the route (see agent.ts: `process.env.BACKEND_URL` or localhost).
 */
export function buildAgentSnippetPayload(agent: DbAgent, platformUrl: string) {
  const agentToken = agent.agentToken ?? "";
  const agentDid = agent.agentDid;
  const agentName = (agent.name && agent.name.trim()) || "Authward Agent";
  const safeName = safeFileNameSegment(agentName);
  /** Download filenames: authwards_{agent_name}_{platform}.{ext} (hyphens in name → underscores). */
  const agentSlug = safeName.replace(/-/g, "_");
  const snippetFile = (platform: string, ext: string) =>
    `authwards_${agentSlug}_${platform}.${ext}`;
  const platformEscapedInExpr = escapeForDoubleQuotes(platformUrl);

  const n8nTransactBodyExpr = `={"to":"{{$json['recipient']}}","amount":{{$json['amount']}},"unit":"iota","memo":"{{$json['memo']}}"}`;

  const n8nWorkflow = {
    name: `Authward — ${agentName}`,
    pinData: {},
    nodes: [
      {
        parameters: {
          rule: {
            interval: [{ field: "seconds", secondsInterval: 30 }],
          },
        },
        name: "Every 30 seconds",
        type: "n8n-nodes-base.scheduleTrigger",
        typeVersion: 1.2,
        position: [-592, 528],
        id: "authward-schedule-1",
      },
      {
        parameters: {
          method: "GET",
          url: `={{ $json.platformUrl || '${platformEscapedInExpr}' }}/bridge/status`,
          sendHeaders: true,
          headerParameters: {
            parameters: [{ name: "Authorization", value: `Bearer ${agentToken}` }],
          },
          options: {},
        },
        name: "Get Status",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.2,
        position: [-400, 528],
        id: "authward-status-1",
      },
      {
        parameters: {
          conditions: {
            boolean: [
              {
                value1: "={{ $json.status }}",
                value2: "active",
              },
            ],
          },
          options: {},
        },
        name: "Agent active?",
        type: "n8n-nodes-base.if",
        typeVersion: 2,
        position: [-192, 528],
        id: "authward-if-1",
      },
      {
        parameters: {
          assignments: {
            assignments: [
              {
                id: "authward-set-recipient",
                name: "recipient",
                value: "",
                type: "string",
              },
              {
                id: "authward-set-amount",
                name: "amount",
                value: 0,
                type: "number",
              },
              {
                id: "authward-set-memo",
                name: "memo",
                value: "",
                type: "string",
              },
            ],
          },
          options: {},
        },
        type: "n8n-nodes-base.set",
        typeVersion: 3.4,
        position: [64, 512],
        id: "authward-set-1",
        name: "set info",
      },
      {
        parameters: {
          method: "POST",
          url: `${platformUrl}/bridge/transact`,
          sendHeaders: true,
          headerParameters: {
            parameters: [
              { name: "Authorization", value: `Bearer ${agentToken}` },
              { name: "Content-Type", value: "application/json" },
            ],
          },
          sendBody: true,
          specifyBody: "json",
          jsonBody: n8nTransactBodyExpr,
          options: {},
        },
        name: "TRANSACT",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.2,
        position: [240, 512],
        id: "authward-transact-1",
      },
    ],
    connections: {
      "Every 30 seconds": {
        main: [[{ node: "Get Status", type: "main", index: 0 }]],
      },
      "Get Status": {
        main: [[{ node: "Agent active?", type: "main", index: 0 }]],
      },
      "Agent active?": {
        main: [[{ node: "set info", type: "main", index: 0 }], []],
      },
      "set info": {
        main: [[{ node: "TRANSACT", type: "main", index: 0 }]],
      },
    },
    active: false,
    settings: {
      executionOrder: "v1",
      binaryMode: "separate",
    },
    meta: {
      instanceId: "authward-generated",
    },
  };

  const arduinoContent = `#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// PLATFORM_URL: Authward backend base URL (same value the API used when generating this file — see env BACKEND_URL on the server).
const char* PLATFORM_URL = "${platformUrl}";
const char* AGENT_TOKEN = "${agentToken}";
const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASS = "YOUR_PASSWORD";
// IOTA accepts only positive values as amount. Set recipient and amount > 0 before sending.
const char* RECIPIENT = "";
const float AMOUNT_IOTA = 0.0f;
const int POLL_INTERVAL_MS = 30000;

String httpGet(const char* path) {
  HTTPClient http;
  http.begin(String(PLATFORM_URL) + path);
  http.addHeader("Authorization", String("Bearer ") + AGENT_TOKEN);
  int code = http.GET();
  String response = http.getString();
  http.end();
  Serial.printf("[GET %s] %d: %s\\n", path, code, response.c_str());
  return response;
}

String httpPostJson(const char* path, const String& jsonBody) {
  HTTPClient http;
  http.begin(String(PLATFORM_URL) + path);
  http.addHeader("Authorization", String("Bearer ") + AGENT_TOKEN);
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(jsonBody);
  String response = http.getString();
  http.end();
  Serial.printf("[POST %s] %d: %s\\n", path, code, response.c_str());
  return response;
}

void sendTransact() {
  StaticJsonDocument<512> doc;
  doc["to"] = RECIPIENT;
  doc["amount"] = AMOUNT_IOTA;
  doc["unit"] = "iota";
  doc["memo"] = "";
  String body;
  serializeJson(doc, body);
  httpPostJson("/bridge/transact", body);
}

void setup() {
  Serial.begin(115200);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\\nWiFi OK");
}

void loop() {
  String st = httpGet("/bridge/status");
  DynamicJsonDocument doc(2048);
  if (deserializeJson(doc, st) == DeserializationError::Ok && doc["status"] == "active") {
    sendTransact();
  }
  delay(POLL_INTERVAL_MS);
}`;

  const pyName = JSON.stringify(agentName);
  const pyDid = JSON.stringify(agentDid);
  const pyPlatform = JSON.stringify(platformUrl);
  const pyToken = JSON.stringify(agentToken);

  const pythonContent = `#!/usr/bin/env python3
"""Authward Agent client (generated).

Uses only GET /bridge/status and POST /bridge/transact.
PLATFORM_URL is the backend base URL from the server (BACKEND_URL) when this file was generated.
"""
from __future__ import annotations

import time
from typing import Optional

import requests

# === AUTHWARD CONFIG ===
AGENT_NAME = ${pyName}
AGENT_DID = ${pyDid}
PLATFORM_URL = ${pyPlatform}
AGENT_TOKEN = ${pyToken}

# IOTA accepts only positive values as amount. Set recipient and amount > 0 before sending.
RECIPIENT = ""
AMOUNT_IOTA = 0
POLL_INTERVAL = 30  # seconds

AUTH_HEADER = {"Authorization": f"Bearer {AGENT_TOKEN}"}
JSON_HEADERS = {**AUTH_HEADER, "Content-Type": "application/json"}


def status():
    """GET /bridge/status — agent state, balance, permissions."""
    r = requests.get(f"{PLATFORM_URL}/bridge/status", headers=AUTH_HEADER, timeout=60)
    data = r.json()
    print(f"[status] {r.status_code}: {data}")
    return data


def transact(to: str, amount: float, memo: Optional[str] = None):
    """POST /bridge/transact — unit iota for IOTA-denominated amounts. IOTA accepts only positive values as amount."""
    body: dict = {"to": to, "amount": amount, "unit": "iota"}
    if memo is not None:
        body["memo"] = memo
    r = requests.post(f"{PLATFORM_URL}/bridge/transact", headers=JSON_HEADERS, json=body, timeout=120)
    data = r.json()
    print(f"[transact] {r.status_code}: {data}")
    return data


if __name__ == "__main__":
    print(f"Authward Agent: {AGENT_NAME}")
    print(f"DID: {AGENT_DID}")
    print(f"Platform: {PLATFORM_URL}")
    print("---")

    while True:
        s = status()
        if s.get("status") == "active":
            result = transact(RECIPIENT, AMOUNT_IOTA, "")
            if result.get("success") is True:
                print("Transaction succeeded, done.")
                break
        time.sleep(POLL_INTERVAL)`;

  const zapierContent = `Authward Agent — ${agentName}
DID: ${agentDid}

PLATFORM_URL = ${platformUrl}
  (backend base URL from the server BACKEND_URL when this file was generated)

AGENT_TOKEN = ${agentToken}

Only these Bridge endpoints are used:

=== GET /bridge/status ===
URL: ${platformUrl}/bridge/status
Headers:
  Authorization: Bearer <AGENT_TOKEN>

Response includes agent status, wallet balance, task config, permissions.

=== POST /bridge/transact ===
URL: ${platformUrl}/bridge/transact
Headers:
  Authorization: Bearer <AGENT_TOKEN>
  Content-Type: application/json

Body (JSON):
  "to" — required, valid IOTA address
  "amount" — required, positive number (nanos by default; use "unit":"iota" for IOTA amounts)
  "unit" — optional: "nanos" (default) or "iota"
  "memo" — optional, max 256 characters (server logging only)

IOTA accepts only positive values as amount. Defaults in snippets use amount 0 until you set a positive value.

Example:
  {"to":"0x…","amount":0,"unit":"iota","memo":""}

Typical Zap: Trigger → GET status → (optional filter if status is active) → POST transact.`;

  const curlContent = `#!/bin/bash
# Authward Agent — ${agentName}
# DID: ${agentDid}
# PLATFORM_URL matches the server BACKEND_URL used when this snippet was generated.

PLATFORM_URL="${platformUrl}"
AGENT_TOKEN="${agentToken}"
# IOTA accepts only positive values as amount. Set RECIPIENT and amount > 0 before sending.
RECIPIENT=""

# GET /bridge/status
curl -s -X GET "$PLATFORM_URL/bridge/status" \\
  -H "Authorization: Bearer $AGENT_TOKEN" | jq .

# POST /bridge/transact (unit iota = human IOTA amounts, not raw nanos)
curl -s -X POST "$PLATFORM_URL/bridge/transact" \\
  -H "Authorization: Bearer $AGENT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d "{\\"to\\":\\"$RECIPIENT\\",\\"amount\\":0,\\"unit\\":\\"iota\\",\\"memo\\":\\"\\"}" | jq .`;

  const jsContent = `#!/usr/bin/env node
/**
 * Authward Agent — ${agentName}
 * DID: ${agentDid}
 * PLATFORM_URL: backend base URL from server (BACKEND_URL) when this file was generated.
 */

// IOTA accepts only positive values as amount. Set recipient and amount > 0 before sending.
const PLATFORM_URL = '${escapeForJsString(platformUrl)}';
const AGENT_TOKEN = '${escapeForJsString(agentToken)}';
const RECIPIENT = '';

const authHeaders = { Authorization: \`Bearer \${AGENT_TOKEN}\` };
const jsonHeaders = { ...authHeaders, 'Content-Type': 'application/json' };

async function status() {
  const r = await fetch(\`\${PLATFORM_URL}/bridge/status\`, { headers: authHeaders });
  const data = await r.json();
  console.log('[status]', data);
  return data;
}

async function transact(to, amount, memo) {
  const body = { to, amount, unit: 'iota' };
  if (memo !== undefined && memo !== null) body.memo = memo;
  const r = await fetch(\`\${PLATFORM_URL}/bridge/transact\`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(body),
  });
  const data = await r.json();
  console.log('[transact]', data);
  return data;
}

async function main() {
  console.log('Authward Agent: ${escapeForJsString(agentName)}');
  console.log('DID: ${escapeForJsString(agentDid)}');

  const s = await status();
  if (s.status === 'active') {
    await transact(RECIPIENT, 0, '');
  }
}

main();`;

  return {
    agentDid,
    agentName,
    platformUrl,
    agentToken,
    providers: {
      n8n: {
        label: "n8n Workflow",
        description:
          "Import from … → Import from File. Flow: Get Status → Agent active? → set info (recipient, amount, memo) → TRANSACT. IOTA accepts only positive amounts — defaults are empty / 0.",
        fileType: "json",
        fileName: snippetFile("n8n", "json"),
        content: n8nWorkflow,
      },
      arduino: {
        label: "Arduino / ESP32",
        description: "GET /bridge/status then POST /bridge/transact when active",
        fileType: "ino",
        fileName: snippetFile("arduino", "ino"),
        content: arduinoContent,
      },
      python: {
        label: "Python Script",
        description: "Poll GET /bridge/status, POST /bridge/transact when active",
        fileType: "py",
        fileName: snippetFile("python", "py"),
        content: pythonContent,
      },
      zapier: {
        label: "Zapier",
        description: "GET status + POST transact only — reference for Webhooks by Zapier",
        fileType: "txt",
        fileName: snippetFile("zapier", "txt"),
        content: zapierContent,
      },
      curl: {
        label: "cURL (generic)",
        description: "GET /bridge/status and POST /bridge/transact examples",
        fileType: "sh",
        fileName: snippetFile("curl", "sh"),
        content: curlContent,
      },
      javascript: {
        label: "JavaScript / Node.js",
        description: "fetch GET /bridge/status, then POST /bridge/transact if active",
        fileType: "js",
        fileName: snippetFile("javascript", "js"),
        content: jsContent,
      },
    },
  };
}
