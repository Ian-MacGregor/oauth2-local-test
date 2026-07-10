const express = require("express");
const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Configuration — points at the Keycloak realm running in Docker
// ---------------------------------------------------------------------------
const KEYCLOAK_URL = process.env.KEYCLOAK_URL || "http://localhost:8080";
const REALM = "test-realm";
const ISSUER = `${KEYCLOAK_URL}/realms/${REALM}`;
const JWKS_URI = `${ISSUER}/protocol/openid-connect/certs`;

// OAuth2.0 server credentials (with test defaults):
const CLIENT_ID = process.env.CLIENT_ID || "my-test-client";
const CLIENT_SECRET = process.env.CLIENT_SECRET || "my-test-secret";

// JWKS client fetches Keycloak's public signing keys so we can verify tokens
const client = jwksClient({ jwksUri: JWKS_URI });

function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

// ---------------------------------------------------------------------------
// Middleware — verifies the Bearer token on protected routes
// ---------------------------------------------------------------------------
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Missing or malformed Authorization header. Expected: Bearer <token>",
    });
  }

  const token = authHeader.split(" ")[1];

  jwt.verify(token, getKey, { issuer: ISSUER, algorithms: ["RS256"] }, (err, decoded) => {
    if (err) {
      console.error("Token verification failed:", err.message);
      return res.status(401).json({
        error: "invalid_token",
        message: err.message,
      });
    }

    // Attach decoded token to request so routes can inspect claims
    req.auth = decoded;
    next();
  });
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Health check — no auth required
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Protected endpoint — requires a valid Keycloak token
app.get("/api/data", authenticate, (req, res) => {
  res.json({
    message: "You have successfully accessed the protected resource!",
    timestamp: new Date().toISOString(),
    tokenInfo: {
      clientId: req.auth.clientId || req.auth.azp,
      issuer: req.auth.iss,
      scope: req.auth.scope,
      expiresAt: new Date(req.auth.exp * 1000).toISOString(),
    },
  });
});

// Another protected endpoint — returns a list of mock items
app.get("/api/items", authenticate, (req, res) => {
  res.json({
    items: [
      { id: 1, name: "Widget A", status: "active" },
      { id: 2, name: "Widget B", status: "inactive" },
      { id: 3, name: "Widget C", status: "active" },
    ],
    requestedBy: req.auth.clientId || req.auth.azp,
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`\n=== OAuth2 Test API ===`);
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`\nEndpoints:`);
  console.log(`  GET /health          — no auth required`);
  console.log(`  GET /api/data        — requires Bearer token`);
  console.log(`  GET /api/items       — requires Bearer token`);
  console.log(`\nKeycloak issuer: ${ISSUER}`);
  console.log(`\nTo get a token:`);
  console.log(`  curl -X POST ${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token \\`);
  console.log(`    -d "grant_type=client_credentials" \\`);
  console.log(`    -d "client_id=${CLIENT_ID}" \\`);
  console.log(`    -d "client_secret=${CLIENT_SECRET}"\n`);
});
