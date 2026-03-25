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
          url: `${platformUrl}/bridge/execute`,
          sendHeaders: true,
          headerParameters: {
            parameters: [
              { name: "Authorization", value: `Bearer ${agentToken}` },
              { name: "Content-Type", value: "application/json" },
            ],
          },
          sendBody: true,
          specifyBody: "json",
          jsonBody: '{"action":"release_payment"}',
          options: {},
        },
        name: "Execute Action",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.2,
        position: [910, 200],
        id: "execute-1",
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
        main: [[{ node: "Execute Action", type: "main", index: 0 }], []],
      },
    },
    settings: { executionOrder: "v1" },
    meta: {
      instanceId: "authward-generated",
    },
  };

  /** C++ string literal for JSON body: `{"action":"release_payment"}` */
  const arduinoExecuteJson = `"{\\"action\\":\\"release_payment\\"}"`;

  const arduinoContent = `#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// === AUTHWARD CONFIG ===
const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASS = "YOUR_PASSWORD";
const char* PLATFORM_URL = "${platformUrl}";
const char* AGENT_TOKEN = "${agentToken}";
const int CHECK_INTERVAL = 30000; // 30 seconds

void setup() {
  Serial.begin(115200);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\\nConnected!");
  
  // Activate the agent (once)
  callBridge("/bridge/activate", "");
}

void loop() {
  // Check condition
  String checkResponse = callBridge("/bridge/check", "");
  
  DynamicJsonDocument doc(1024);
  deserializeJson(doc, checkResponse);
  
  if (doc["conditionMet"] == true) {
    Serial.println("Condition met! Executing...");
    String execResponse = callBridge(
      "/bridge/execute",
      ${arduinoExecuteJson}
    );
    Serial.println(execResponse);
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
"""Authward Agent client (generated)."""
import requests
import time

# === AUTHWARD CONFIG ===
AGENT_NAME = ${pyName}
AGENT_DID = ${pyDid}
PLATFORM_URL = ${pyPlatform}
AGENT_TOKEN = ${pyToken}
CHECK_INTERVAL = 30  # seconds

HEADERS = {
    "Authorization": f"Bearer {AGENT_TOKEN}",
    "Content-Type": "application/json"
}

def activate():
    """Activate the agent (once)"""
    r = requests.post(f"{PLATFORM_URL}/bridge/activate", headers=HEADERS)
    print(f"[activate] {r.status_code}: {r.json()}")
    return r.json()

def check():
    """Check the condition"""
    r = requests.post(f"{PLATFORM_URL}/bridge/check", headers=HEADERS)
    data = r.json()
    print(f"[check] conditionMet: {data.get('conditionMet')}")
    return data

def execute(action="release_payment"):
    """Execute the action"""
    r = requests.post(
        f"{PLATFORM_URL}/bridge/execute",
        headers=HEADERS,
        json={"action": action}
    )
    data = r.json()
    print(f"[execute] {data}")
    return data

if __name__ == "__main__":
    print(f"Authward Agent: {AGENT_NAME}")
    print(f"DID: {AGENT_DID}")
    print(f"Platform: {PLATFORM_URL}")
    print("---")
    
    # Activate
    activate()
    
    # Main loop
    while True:
        try:
            result = check()
            if result.get("conditionMet"):
                execute()
        except Exception as e:
            print(f"[error] {e}")
        
        time.sleep(CHECK_INTERVAL)`;

  const curlContent = `#!/bin/bash
# Authward Agent — ${agentName}
# DID: ${agentDid}

PLATFORM_URL="${platformUrl}"
AGENT_TOKEN="${agentToken}"

# 1. Activate the agent (once)
curl -s -X POST "$PLATFORM_URL/bridge/activate" \\
  -H "Authorization: Bearer $AGENT_TOKEN" | jq .

# 2. Check the condition
curl -s -X POST "$PLATFORM_URL/bridge/check" \\
  -H "Authorization: Bearer $AGENT_TOKEN" | jq .

# 3. Execute the action
curl -s -X POST "$PLATFORM_URL/bridge/execute" \\
  -H "Authorization: Bearer $AGENT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"action": "release_payment"}' | jq .`;

  const jsContent = `#!/usr/bin/env node
/**
 * Authward Agent — ${agentName}
 * DID: ${agentDid}
 */

const PLATFORM_URL = '${escapeForJsString(platformUrl)}';
const AGENT_TOKEN = '${escapeForJsString(agentToken)}';
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

async function check() {
  const r = await fetch(\`\${PLATFORM_URL}/bridge/check\`, { method: 'POST', headers });
  const data = await r.json();
  console.log('[check] conditionMet:', data.conditionMet);
  return data;
}

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
  
  setInterval(async () => {
    try {
      const result = await check();
      if (result.conditionMet) await execute();
    } catch (e) {
      console.error('[error]', e.message);
    }
  }, CHECK_INTERVAL);
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
        description: "Import this file into n8n to get a ready-made workflow",
        fileType: "json",
        fileName: `authward-agent-${safeName}.json`,
        content: n8nWorkflow,
      },
      arduino: {
        label: "Arduino / ESP32",
        description: "C++ sketch for microcontrollers with WiFi",
        fileType: "ino",
        fileName: "authward_agent.ino",
        content: arduinoContent,
      },
      python: {
        label: "Python Script",
        description: "Python script for bots, servers, or Raspberry Pi",
        fileType: "py",
        fileName: "authward_agent.py",
        content: pythonContent,
      },
      curl: {
        label: "cURL (generic)",
        description: "Shell commands for testing or integration in any language",
        fileType: "sh",
        fileName: "authward_agent.sh",
        content: curlContent,
      },
      javascript: {
        label: "JavaScript / Node.js",
        description: "Node.js script or module for integration into any JS project",
        fileType: "js",
        fileName: "authward_agent.js",
        content: jsContent,
      },
    },
  };
}
