# OAuth2 Local Test Environment

A complete local setup for testing the OAuth2 Client Credentials flow end-to-end
using Keycloak (authorization server) and a Node.js API (protected resource).

## Prerequisites

- Docker Desktop (running)
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
├── docker-compose.yml
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
│  or Script   │ ◀───────────────────  │  localhost:8080   │
│              │    2. access_token     │                  │
│              │                       └──────────────────┘
│              │    3. GET /api/data
│              │    Authorization:      ┌──────────────────┐
│              │      Bearer <token>    │                  │
│              │ ───────────────────▶  │   Test API       │
│              │                       │  localhost:3000   │
│              │ ◀───────────────────  │                  │
└──────────────┘    4. JSON response    └──────────────────┘
```

## Quick Start

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

From the `oauth2-local-test/` directory:

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

This will:
1. Request a token from Keycloak using client credentials
2. Call `/api/data` with the valid token (expect 200)
3. Call `/api/items` with the valid token (expect 200)
4. Call `/api/data` without a token (expect 401)
5. Call `/api/data` with a garbage token (expect 401)

## API Endpoints

| Endpoint       | Auth Required | Description                          |
|----------------|---------------|--------------------------------------|
| GET /health    | No            | Health check                         |
| GET /api/data  | Yes           | Returns token info and a message     |
| GET /api/items | Yes           | Returns a list of mock items         |

## Manual Testing (curl)

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

curl -s http://localhost:3000/api/data -H "Authorization: Bearer $TOKEN" | jq .
curl -s http://localhost:3000/api/items -H "Authorization: Bearer $TOKEN" | jq .
```

## Test Credentials

| Setting       | Value             |
|---------------|-------------------|
| Realm         | test-realm        |
| Client ID     | my-test-client    |
| Client Secret | my-test-secret    |
| Token URL     | http://localhost:8080/realms/test-realm/protocol/openid-connect/token |

## Testing with Your Tool

Point your tool at:

- **Token endpoint:** `http://localhost:8080/realms/test-realm/protocol/openid-connect/token`
- **Form data:** `grant_type=client_credentials&client_id=my-test-client&client_secret=my-test-secret`
- **API endpoint:** `http://localhost:3000/api/data` or `/api/items`
- **Header:** `Authorization: Bearer <token_from_step_above>`

If the token endpoint rejects credentials sent in the form body, try sending
them as HTTP Basic Auth instead: set the Authorization header to
`Basic base64(client_id:client_secret)` and include only
`grant_type=client_credentials` in the form data.

## Cleanup

```bash
docker compose down -v
```
