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

/** Example JSON body for n8n transact node (user should replace recipient address). */
const N8N_TRANSACT_JSON_BODY =
  '{"to":"REPLACE_WITH_RECIPIENT_IOTA_ADDRESS","amount":5,"memo":"Payment for invoice #123"}';

/** Full GET /agent/:did/snippet payload with downloadable provider bundles. */
export function buildAgentSnippetPayload(agent: DbAgent, platformUrl: string) {
  const agentToken = agent.agentToken ?? "";
  const agentDid = agent.agentDid;
  const agentName = (agent.name && agent.name.trim()) || "Authward Agent";
  const safeName = safeFileNameSegment(agentName);
  const platformEscapedInExpr = escapeForDoubleQuotes(platformUrl);

  const n8nWorkflow = {
    name: `Authward — ${agentName}`,
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
        position: [250, 300],
        id: "schedule-1",
      },
      {
        parameters: {
          method: "POST",
          url: `={{ $json.platformUrl || '${platformEscapedInExpr}' }}/bridge/check`,
          sendHeaders: true,
          headerParameters: {
            parameters: [{ name: "Authorization", value: `Bearer ${agentToken}` }],
          },
          options: {},
        },
        name: "Check Condition",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.2,
        position: [470, 300],
        id: "check-1",
      },
      {
        parameters: {
          conditions: {
            boolean: [
              {
                value1: "={{ $json.conditionMet }}",
                value2: true,
              },
            ],
          },
        },
        name: "Condition Met?",
        type: "n8n-nodes-base.if",
        typeVersion: 2,
        position: [690, 300],
        id: "if-1",
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
          jsonBody: N8N_TRANSACT_JSON_BODY,
          options: {},
        },
        name: "Send IOTA (transact)",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.2,
        position: [910, 200],
        id: "transact-1",
      },
    ],
    connections: {
      "Every 30 seconds": {
        main: [[{ node: "Check Condition", type: "main", index: 0 }]],
      },
      "Check Condition": {
        main: [[{ node: "Condition Met?", type: "main", index: 0 }]],
      },
      "Condition Met?": {
        main: [[{ node: "Send IOTA (transact)", type: "main", index: 0 }], []],
      },
    },
    settings: { executionOrder: "v1" },
    meta: {
      instanceId: "authward-generated",
    },
  };

  const arduinoContent = `#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// === AUTHWARD CONFIG ===
const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASS = "YOUR_PASSWORD";
const char* PLATFORM_URL = "${platformUrl}";
const char* AGENT_TOKEN = "${agentToken}";
// Recipient IOTA address (required). amount is in IOTA (e.g. 5 or 0.5), NOT nanos.
const char* RECIPIENT = "REPLACE_WITH_RECIPIENT_IOTA_ADDRESS";
const float AMOUNT_IOTA = 5.0f;
const int CHECK_INTERVAL = 30000; // 30 seconds

void setup() {
  Serial.begin(115200);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\\nConnected!");

  callBridge("/bridge/activate", "");
}

void sendTransact() {
  StaticJsonDocument<512> doc;
  doc["to"] = RECIPIENT;
  doc["amount"] = AMOUNT_IOTA;
  doc["memo"] = "Payment for invoice #123";
  String body;
  serializeJson(doc, body);
  callBridge("/bridge/transact", body);
}

void loop() {
  String checkResponse = callBridge("/bridge/check", "");

  DynamicJsonDocument doc(1024);
  deserializeJson(doc, checkResponse);

  if (doc["conditionMet"] == true) {
    Serial.println("Condition met! Sending IOTA via /bridge/transact...");
    sendTransact();
  } else {
    Serial.println("Condition not met, waiting...");
  }

  delay(CHECK_INTERVAL);
}

String callBridge(String endpoint, String body) {
  HTTPClient http;
  http.begin(String(PLATFORM_URL) + endpoint);
  http.addHeader("Authorization", String("Bearer ") + AGENT_TOKEN);
  http.addHeader("Content-Type", "application/json");

  int code;
  if (body.length() > 0) {
    code = http.POST(body);
  } else {
    code = http.POST("");
  }

  String response = http.getString();
  http.end();

  Serial.printf("[%s] %d: %s\\n", endpoint.c_str(), code, response.c_str());
  return response;
}`;

  const pyName = JSON.stringify(agentName);
  const pyDid = JSON.stringify(agentDid);
  const pyPlatform = JSON.stringify(platformUrl);
  const pyToken = JSON.stringify(agentToken);

  const pythonContent = `#!/usr/bin/env python3
"""Authward Agent client (generated).

Primary IOTA transfers: POST /bridge/transact with to, amount (IOTA units, e.g. 5 or 0.5 — not nanos), optional memo.
Optional: /bridge/check + /bridge/execute for dashboard-preconfigured flows (e.g. shipment release_payment).
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
CHECK_INTERVAL = 30  # seconds

# Generic transfer: valid IOTA address; amount in IOTA (not nanos)
RECIPIENT = "REPLACE_WITH_RECIPIENT_IOTA_ADDRESS"
AMOUNT_IOTA = 5  # e.g. 5 or 0.5

HEADERS = {
    "Authorization": f"Bearer {AGENT_TOKEN}",
    "Content-Type": "application/json",
}


def activate():
    """Activate the agent (once)."""
    r = requests.post(f"{PLATFORM_URL}/bridge/activate", headers=HEADERS)
    print(f"[activate] {r.status_code}: {r.json()}")
    return r.json()


def transact(to: str, amount: float, memo: Optional[str] = None):
    """Send IOTA from the agent wallet via POST /bridge/transact (amount in IOTA, not nanos)."""
    body: dict = {"to": to, "amount": amount}
    if memo is not None:
        body["memo"] = memo
    r = requests.post(f"{PLATFORM_URL}/bridge/transact", headers=HEADERS, json=body)
    data = r.json()
    print(f"[transact] {r.status_code}: {data}")
    return data


def check():
    """Poll condition (e.g. shipment delivered) for monitor flows."""
    r = requests.post(f"{PLATFORM_URL}/bridge/check", headers=HEADERS)
    data = r.json()
    print(f"[check] conditionMet: {data.get('conditionMet')}")
    return data


def execute(action="release_payment"):
    """Preconfigured action only (e.g. shipment payment from task config). Not for arbitrary transfers — use transact()."""
    r = requests.post(
        f"{PLATFORM_URL}/bridge/execute",
        headers=HEADERS,
        json={"action": action},
    )
    data = r.json()
    print(f"[execute] {data}")
    return data


if __name__ == "__main__":
    print(f"Authward Agent: {AGENT_NAME}")
    print(f"DID: {AGENT_DID}")
    print(f"Platform: {PLATFORM_URL}")
    print("---")

    activate()

    # Primary: generic IOTA transfer
    transact(RECIPIENT, AMOUNT_IOTA, "Payment for invoice #123")

    # Or — monitor + preconfigured execute (TraceFlow / shipment), not arbitrary sends:
    # while True:
    #     try:
    #         result = check()
    #         if result.get("conditionMet"):
    #             execute("release_payment")
    #     except Exception as e:
    #         print(f"[error] {e}")
    #     time.sleep(CHECK_INTERVAL)`;

  const zapierContent = `Authward Agent — ${agentName}
DID: ${agentDid}

Zapier has no import file. Create a Zap, add Webhooks by Zapier → POST actions,
and use the config below.

=== AUTHWARD CONFIG ===
PLATFORM_URL = ${platformUrl}
AGENT_TOKEN = ${agentToken}

For every POST request, add:
  Authorization: Bearer <paste AGENT_TOKEN>
  Content-Type: application/json   (when sending a JSON body)

=== PRIMARY: SEND IOTA ===
POST ${platformUrl}/bridge/transact
Body (JSON):
  "to": required — valid IOTA address
  "amount": required — number > 0, in IOTA units (e.g. 5 or 0.5), NOT nanos
  "memo": optional — string, max 256 chars (server logging only)

Example:
  {"to":"0x…","amount":5,"memo":"Payment for invoice #123"}

Success: JSON with success, txHash, from, to, amount, remainingDailyBudget, walletBalance, etc.
Errors: 401 invalid token; 403 agent inactive/revoked or permit limits; 400 bad body, invalid address, memo too long, insufficient_balance (+ walletBalance); 500 server/network.

=== OTHER ENDPOINTS (POST) ===
1) ${platformUrl}/bridge/activate — run once before transact (dashboard activation required first).
2) ${platformUrl}/bridge/check — conditionMet for monitor flows (e.g. shipment).

3) ${platformUrl}/bridge/execute — preconfigured tasks only (e.g. action release_payment with task config).
   For arbitrary IOTA sends, use /bridge/transact only.

Typical Zap: Trigger → POST activate (if needed) → POST transact with JSON body above.`;

  const curlContent = `#!/bin/bash
# Authward Agent — ${agentName}
# DID: ${agentDid}
# amount below is in IOTA (e.g. 5 or 0.5), NOT nanos.

PLATFORM_URL="${platformUrl}"
AGENT_TOKEN="${agentToken}"
RECIPIENT="REPLACE_WITH_RECIPIENT_IOTA_ADDRESS"

# 1. Activate the agent (once)
curl -s -X POST "$PLATFORM_URL/bridge/activate" \\
  -H "Authorization: Bearer $AGENT_TOKEN" | jq .

# 2. (Optional) Check monitor condition — shipment / TraceFlow flows
curl -s -X POST "$PLATFORM_URL/bridge/check" \\
  -H "Authorization: Bearer $AGENT_TOKEN" | jq .

# 3. Primary: send IOTA (generic transfer)
curl -s -X POST "$PLATFORM_URL/bridge/transact" \\
  -H "Authorization: Bearer $AGENT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d "{\\"to\\":\\"$RECIPIENT\\",\\"amount\\":5,\\"memo\\":\\"Payment for invoice #123\\"}" | jq .

# Preconfigured execute only (e.g. shipment release_payment) — not for arbitrary transfers:
# curl -s -X POST "$PLATFORM_URL/bridge/execute" \\
#   -H "Authorization: Bearer $AGENT_TOKEN" \\
#   -H "Content-Type: application/json" \\
#   -d '{"action": "release_payment"}' | jq .`;

  const jsContent = `#!/usr/bin/env node
/**
 * Authward Agent — ${agentName}
 * DID: ${agentDid}
 * amount for transact() is in IOTA (e.g. 5 or 0.5), NOT nanos.
 */

const PLATFORM_URL = '${escapeForJsString(platformUrl)}';
const AGENT_TOKEN = '${escapeForJsString(agentToken)}';
const RECIPIENT = '${escapeForJsString("REPLACE_WITH_RECIPIENT_IOTA_ADDRESS")}';
const CHECK_INTERVAL = 30000; // 30 seconds

const headers = {
  'Authorization': \`Bearer \${AGENT_TOKEN}\`,
  'Content-Type': 'application/json'
};

async function activate() {
  const r = await fetch(\`\${PLATFORM_URL}/bridge/activate\`, { method: 'POST', headers });
  const data = await r.json();
  console.log('[activate]', data);
  return data;
}

async function transact(to, amount, memo) {
  const body = { to, amount };
  if (memo !== undefined && memo !== null) body.memo = memo;
  const r = await fetch(\`\${PLATFORM_URL}/bridge/transact\`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  const data = await r.json();
  console.log('[transact]', data);
  return data;
}

async function check() {
  const r = await fetch(\`\${PLATFORM_URL}/bridge/check\`, { method: 'POST', headers });
  const data = await r.json();
  console.log('[check] conditionMet:', data.conditionMet);
  return data;
}

/** Preconfigured shipment/release only — not for arbitrary IOTA sends. */
async function execute(action = 'release_payment') {
  const r = await fetch(\`\${PLATFORM_URL}/bridge/execute\`, {
    method: 'POST', headers,
    body: JSON.stringify({ action })
  });
  const data = await r.json();
  console.log('[execute]', data);
  return data;
}

async function main() {
  console.log('Authward Agent: ${escapeForJsString(agentName)}');
  console.log('DID: ${escapeForJsString(agentDid)}');

  await activate();

  await transact(RECIPIENT, 5, 'Payment for invoice #123');

  // Or — monitor loop + preconfigured execute (not arbitrary transfers):
  // setInterval(async () => {
  //   try {
  //     const result = await check();
  //     if (result.conditionMet) await execute();
  //   } catch (e) {
  //     console.error('[error]', e.message);
  //   }
  // }, CHECK_INTERVAL);
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
          "In n8n, open the … menu at the top right of the workflow, then choose Import from File. Replace the recipient in “Send IOTA (transact)”; amount is in IOTA (e.g. 5 or 0.5), not nanos.",
        fileType: "json",
        fileName: `authward-agent-${safeName}.json`,
        content: n8nWorkflow,
      },
      arduino: {
        label: "Arduino / ESP32",
        description: "WiFi sketch — transact for IOTA (amount in IOTA units, not nanos)",
        fileType: "ino",
        fileName: "authward_agent.ino",
        content: arduinoContent,
      },
      python: {
        label: "Python Script",
        description: "Bots / servers — POST /bridge/transact for transfers (IOTA amount, not nanos)",
        fileType: "py",
        fileName: "authward_agent.py",
        content: pythonContent,
      },
      zapier: {
        label: "Zapier",
        description: "Webhooks (POST) — primary path /bridge/transact; reference file for Zap editor",
        fileType: "txt",
        fileName: `authward-agent-${safeName}-zapier.txt`,
        content: zapierContent,
      },
      curl: {
        label: "cURL (generic)",
        description: "Shell — transact JSON example (IOTA amount, not nanos); execute commented for preconfigured flows",
        fileType: "sh",
        fileName: "authward_agent.sh",
        content: curlContent,
      },
      javascript: {
        label: "JavaScript / Node.js",
        description: "Node — transact() for IOTA sends (amount in IOTA, not nanos)",
        fileType: "js",
        fileName: "authward_agent.js",
        content: jsContent,
      },
    },
  };
}
