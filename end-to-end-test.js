// ==========================================================================
// end-to-end-test.js
//
// Runs the full OAuth2 Client Credentials flow:
//   1. Requests a token from Keycloak
//   2. Calls the protected API with the token
//   3. Calls the API WITHOUT a token (expects 401)
//   4. Calls the API with a GARBAGE token (expects 401)
//
// Usage:  node end-to-end-test.js
// ==========================================================================

// Local dev defaults are preserved; override via env for the Railway deploy.
//   KEYCLOAK_URL — same value as KC_HOSTNAME on Keycloak / KEYCLOAK_URL on the API
//   API_URL      — the API service's public https URL
const KEYCLOAK_URL = process.env.KEYCLOAK_URL || "http://localhost:8080";
const REALM = process.env.REALM || "test-realm";
const API_BASE = process.env.API_URL || "http://localhost:3000";

const KEYCLOAK_TOKEN_URL = `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token`;

const CLIENT_ID = process.env.CLIENT_ID || "my-test-client";
const CLIENT_SECRET = process.env.CLIENT_SECRET || "my-test-secret";

async function getToken() {
  console.log("--- Step 1: Requesting token from Keycloak ---\n");

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });

  const res = await fetch(KEYCLOAK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`Token request failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  console.log("Token received!");
  console.log(`  token_type : ${data.token_type}`);
  console.log(`  expires_in : ${data.expires_in} seconds`);
  console.log(`  scope      : ${data.scope}`);
  console.log(`  token      : ${data.access_token.substring(0, 40)}...\n`);
  return data.access_token;
}

async function callApi(endpoint, token, label) {
  console.log(`--- ${label} ---\n`);

  const headers = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, { headers });
  const data = await res.json();

  console.log(`  Status : ${res.status}`);
  console.log(`  Body   : ${JSON.stringify(data, null, 2)}\n`);
  return res.status;
}

async function main() {
  console.log("=== OAuth2 End-to-End Test ===\n");

  // Step 1 — Get a token
  const token = await getToken();

  // Step 2 — Call protected endpoint WITH valid token (expect 200)
  await callApi("/api/data", token, "Step 2: Call /api/data with valid token (expect 200)");

  // Step 3 — Call another protected endpoint WITH valid token (expect 200)
  await callApi("/api/items", token, "Step 3: Call /api/items with valid token (expect 200)");

  // Step 4 — Call WITHOUT a token (expect 401)
  await callApi("/api/data", null, "Step 4: Call /api/data WITHOUT token (expect 401)");

  // Step 5 — Call with a GARBAGE token (expect 401)
  await callApi("/api/data", "this-is-not-a-real-token", "Step 5: Call /api/data with bad token (expect 401)");

  console.log("=== All tests complete ===");
}

main().catch((err) => {
  console.error("Test failed:", err.message);
  process.exit(1);
});
