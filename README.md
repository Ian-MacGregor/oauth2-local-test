# OAuth2 Test Environment

A complete setup for testing the OAuth2 Client Credentials flow end-to-end
using Keycloak (authorization server) and a suite of mock Node.js API servers
(protected resources). Supports both **local development** (Docker + localhost)
and **remote hosting** (e.g., Railway), controlled by environment variables.

## Prerequisites

- Docker Desktop (running) — for local Keycloak
- Node.js (v18+)
- **Windows users:** If using PowerShell and `npm` fails with an execution policy
  error, run this once in an admin PowerShell session before proceeding:
  ```powershell
  Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
  ```
  Alternatively, use Command Prompt (`cmd.exe`) instead of PowerShell.

## Directory Layout

```
oauth2-local-test/
├── docker-compose.yml        # Local dev: runs Keycloak in Docker
├── Dockerfile                # Remote deploy: Keycloak image for Railway etc.
├── end-to-end-test.js
├── .env
├── .gitignore
├── keycloak-setup/
│   └── test-realm-realm.json
├── test-api/                 # General-purpose test API (ports 3000)
│   ├── package.json
│   └── server.js
├── test-order-api/           # Mock Order API (port 3001)
│   ├── package.json
│   └── server.js
└── test-trade-api/           # Mock Block Trade API (port 3002)
    ├── package.json
    └── server.js
```

> **Important:** The realm file must be named `test-realm-realm.json` (not
> `test-realm.json`). Keycloak requires the filename to follow the pattern
> `<realm-name>-realm.json`.

## Architecture

```
                                        ┌──────────────────┐
              1. POST /token            │                  │
┌──────────┐ ────────────────────────▶ │    Keycloak      │
│          │ ◀────────────────────────  │  (local or remote│
│  Client  │   2. access_token          │   via env var)   │
│          │                            └──────────────────┘
│          │   3. POST /orders
│          │   POST /blockTrades        ┌──────────────────┐
│          │   Authorization:           │   Mock APIs      │
│          │     Bearer <token>         │                  │
│          │ ────────────────────────▶ │  Order API :3001 │
│          │ ◀────────────────────────  │  Trade API :3002 │
└──────────┘   4. JSON response         │  Test API  :3000 │
                                        └──────────────────┘
```

## Environment Variables

All servers and the test script read configuration from environment variables,
falling back to localhost defaults when not set.

| Variable       | Used by                    | Default                 | Description                       |
|----------------|----------------------------|-------------------------|-----------------------------------|
| `KEYCLOAK_URL` | All API servers + test     | `http://localhost:8080` | Base URL of the Keycloak instance |
| `PORT`         | All API servers            | `3000/3001/3002`        | Port each server listens on       |
| `API_URL`      | Test script                | `http://localhost:3000` | Base URL of the general test API  |
| `REALM`        | Test script                | `test-realm`            | Keycloak realm name               |
| `CLIENT_ID`    | All API servers + test     | `my-test-client`        | OAuth2 client ID                  |
| `CLIENT_SECRET`| All API servers + test     | `my-test-secret`        | OAuth2 client secret              |

Set these in a `.env` file or your hosting platform's environment config.

---

## Option A — Local Development

### 1. Start Keycloak

From the `oauth2-local-test/` directory:

```bash
docker compose up -d
```

Wait ~30 seconds for Keycloak to finish initializing. You can verify it's
running by visiting http://localhost:8080 (admin login: `admin` / `admin`).

The realm, client, and credentials are auto-imported from
`keycloak-setup/test-realm-realm.json`. The `docker-compose.yml` mounts the
entire `keycloak-setup/` directory into Keycloak's import path.

**Troubleshooting:** If Keycloak fails to start with a "Is a directory" error,
Docker may have cached a broken volume mount from a previous run. Clean up fully
and retry:

```bash
docker compose down -v
docker volume prune -f
docker compose up -d
```

### 2. Install and start the API servers

Each server runs independently. Open a separate terminal for each one you need:

```bash
# General test API — port 3000
cd test-api && npm install && npm start

# Mock Order API — port 3001
cd test-order-api && npm install && npm start

# Mock Block Trade API — port 3002
cd test-trade-api && npm install && npm start
```

### 3. Run the end-to-end test

Open a new terminal, navigate to the `oauth2-local-test/` directory, and run:

```bash
node end-to-end-test.js
```

---

## Option B — Remote Hosting (e.g., Railway)

Deploy both the Keycloak service and the API service to your hosting platform,
then run the end-to-end test against the live URLs.

### Deploy Keycloak

Use the `Dockerfile` in the project root. It bundles the realm config so the
realm is auto-imported on startup. On Railway (or similar):

1. Create a new service pointed at this repo, setting the root `Dockerfile` as
   the build target.
2. Set the following environment variables on the Keycloak service:
   ```
   KEYCLOAK_ADMIN=admin
   KEYCLOAK_ADMIN_PASSWORD=<choose a secure password>
   KC_HOSTNAME=<your-keycloak-public-url>   # e.g. https://keycloak-abc.railway.app
   KC_PROXY=edge
   ```
3. Note the public URL Railway assigns (e.g. `https://keycloak-abc.railway.app`).

### Deploy the API servers

Each server is a separate Railway service. Point each at its respective
subdirectory (`test-api/`, `test-order-api/`, `test-trade-api/`) and set:

```
KEYCLOAK_URL=https://keycloak-abc.railway.app
```

Leave `PORT` unset — Railway injects it automatically. `CLIENT_ID` and
`CLIENT_SECRET` can be omitted; they only appear in startup log output and
are not used for token validation.

### Run the end-to-end test against the remote services

```bash
KEYCLOAK_URL=https://keycloak-abc.railway.app \
API_URL=https://api-xyz.railway.app \
node end-to-end-test.js
```

---

## Mock API Servers

### General Test API (port 3000)

A simple API used by the end-to-end test script to verify the OAuth2 flow.
Returns token metadata and a mock item list.

### Mock Order API (port 3001)

Simulates an order management system API. Accepts a `POST /orders` request and
returns a randomly generated list of orders, each with realistic field shapes
(order IDs, portfolio references, asset identifiers, transaction types, statuses,
timestamps, etc.). All date fields in the response always reflect today's date —
the request payload is not used to filter by date.

### Mock Block Trade API (port 3002)

Simulates a block trade API. Accepts a `POST /blockTrades` request and returns a
randomly generated list of block trades. The `tradeDate` provided in the request
body is used to set all date fields in the response, with `settlementDate` set to
the following calendar day. Each block trade includes portfolio and asset
references, broker details, execution metadata, and a full set of trade charge
categories matching the real API's fixed-width format.

Both mock APIs:
- Require a valid Bearer token issued by the Keycloak instance
- Return a `GET /health` endpoint with no auth required
- Generate fresh random data on every request (same structure, different values)

---

## Endpoints Summary

| Server          | Endpoint            | Auth | Description                        |
|-----------------|---------------------|------|------------------------------------|
| General Test    | GET /health         | No   | Health check                       |
| General Test    | GET /api/data       | Yes  | Returns token info and a message   |
| General Test    | GET /api/items      | Yes  | Returns a list of mock items       |
| Order API       | GET /health         | No   | Health check                       |
| Order API       | POST /orders        | Yes  | Returns mock orders for today      |
| Block Trade API | GET /health         | No   | Health check                       |
| Block Trade API | POST /blockTrades   | Yes  | Returns mock trades for tradeDate  |

## Test Credentials (defaults)

| Setting       | Value             |
|---------------|-------------------|
| Realm         | test-realm        |
| Client ID     | my-test-client    |
| Client Secret | my-test-secret    |

## Manual Testing (curl)

Substitute `http://localhost:8080` and `http://localhost:3000` with your remote
URLs when testing against a deployed environment.

### Get a token

```bash
curl -s -X POST http://localhost:8080/realms/test-realm/protocol/openid-connect/token \
  -d "grant_type=client_credentials" \
  -d "client_id=my-test-client" \
  -d "client_secret=my-test-secret" | jq .
```

### Call the protected API

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/realms/test-realm/protocol/openid-connect/token \
  -d "grant_type=client_credentials" \
  -d "client_id=my-test-client" \
  -d "client_secret=my-test-secret" | jq -r .access_token)

curl -s http://localhost:3000/api/data  -H "Authorization: Bearer $TOKEN" | jq .
curl -s http://localhost:3000/api/items -H "Authorization: Bearer $TOKEN" | jq .
```

## Testing with Your Tool

Point your tool at:

- **Token endpoint:** `{KEYCLOAK_URL}/realms/test-realm/protocol/openid-connect/token`
- **Form data:** `grant_type=client_credentials&client_id=my-test-client&client_secret=my-test-secret`
- **API endpoint:** `{API_URL}/api/data` or `/api/items`
- **Header:** `Authorization: Bearer <token_from_step_above>`

If the token endpoint rejects credentials sent in the form body, try sending
them as HTTP Basic Auth instead: set the Authorization header to
`Basic base64(client_id:client_secret)` and include only
`grant_type=client_credentials` in the form data.

## Cleanup (local)

```bash
docker compose down -v
```
