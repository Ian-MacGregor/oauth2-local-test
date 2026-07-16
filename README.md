# OAuth2 Test Environment

A complete setup for testing the OAuth2 Client Credentials flow end-to-end
using Keycloak (authorization server) and a Node.js API (protected resource).
Supports both **local development** (Docker + localhost) and **remote hosting**
(e.g., Railway), controlled by environment variables.

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
└── test-api/
    ├── package.json
    └── server.js
```

> **Important:** The realm file must be named `test-realm-realm.json` (not
> `test-realm.json`). Keycloak requires the filename to follow the pattern
> `<realm-name>-realm.json`.

## Architecture

```
┌──────────────┐    1. POST /token     ┌──────────────────┐
│              │ ───────────────────▶  │                  │
│  Your Tool   │    (client creds)     │    Keycloak      │
│  or Script   │ ◀───────────────────  │  (local or remote│
│              │    2. access_token     │   via env var)   │
│              │                       └──────────────────┘
│              │    3. GET /api/data
│              │    Authorization:      ┌──────────────────┐
│              │      Bearer <token>    │                  │
│              │ ───────────────────▶  │   Test API       │
│              │                       │  (local or remote│
│              │ ◀───────────────────  │   via env var)   │
└──────────────┘    4. JSON response    └──────────────────┘
```

## Environment Variables

Both the API server and the end-to-end test script read configuration from
environment variables, falling back to localhost defaults when not set.

| Variable       | Used by             | Default                    | Description                        |
|----------------|---------------------|----------------------------|------------------------------------|
| `KEYCLOAK_URL` | API server + test   | `http://localhost:8080`    | Base URL of the Keycloak instance  |
| `PORT`         | API server          | `3000`                     | Port the API server listens on     |
| `API_URL`      | Test script         | `http://localhost:3000`    | Base URL of the API service        |
| `REALM`        | Test script         | `test-realm`               | Keycloak realm name                |
| `CLIENT_ID`    | API server + test   | `my-test-client`           | OAuth2 client ID                   |
| `CLIENT_SECRET`| API server + test   | `my-test-secret`           | OAuth2 client secret               |

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

### 2. Install and start the test API

```bash
cd test-api
npm install
npm start
```

You should see the server running on port 3000 with a list of available
endpoints.

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

### Deploy the API

Point Railway at the `test-api/` directory and set:

```
KEYCLOAK_URL=https://keycloak-abc.railway.app
PORT=<Railway-assigned port, or leave unset to use 3000>
CLIENT_ID=my-test-client
CLIENT_SECRET=my-test-secret
```

### Run the end-to-end test against the remote services

```bash
KEYCLOAK_URL=https://keycloak-abc.railway.app \
API_URL=https://api-xyz.railway.app \
node end-to-end-test.js
```

---

## API Endpoints

| Endpoint       | Auth Required | Description                          |
|----------------|---------------|--------------------------------------|
| GET /health    | No            | Health check                         |
| GET /api/data  | Yes           | Returns token info and a message     |
| GET /api/items | Yes           | Returns a list of mock items         |

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
