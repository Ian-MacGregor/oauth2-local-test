const express = require("express");
const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;
const KEYCLOAK_URL = process.env.KEYCLOAK_URL || "http://localhost:8080";
const REALM = "test-realm";
const ISSUER = `${KEYCLOAK_URL}/realms/${REALM}`;
const JWKS_URI = `${ISSUER}/protocol/openid-connect/certs`;
const REQUIRED_SCOPE = "trading.order_management.order.v1.Order:read";

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
const jwks = jwksClient({ jwksUri: JWKS_URI });

function getKey(header, callback) {
  jwks.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

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
      return res.status(401).json({ error: "invalid_token", message: err.message });
    }
    const grantedScopes = (decoded.scope || "").split(" ");
    if (!grantedScopes.includes(REQUIRED_SCOPE)) {
      return res.status(403).json({
        error: "insufficient_scope",
        message: `Required scope '${REQUIRED_SCOPE}' was not granted`,
      });
    }
    req.auth = decoded;
    next();
  });
}

// ---------------------------------------------------------------------------
// Random helpers
// ---------------------------------------------------------------------------
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min, max, decimals = 2) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function randChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randLower(len) {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function randUpper(len) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function randAlphaNum(len) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function randDigits(len) {
  return String(randInt(10 ** (len - 1), 10 ** len - 1));
}

// Timestamp with milliseconds anchored to a given date, random HH:MM:SS.mmm
function randTimestampMs(dateStr) {
  const h = String(randInt(0, 23)).padStart(2, "0");
  const m = String(randInt(0, 59)).padStart(2, "0");
  const s = String(randInt(0, 59)).padStart(2, "0");
  const ms = String(randInt(0, 999)).padStart(3, "0");
  return `${dateStr}T${h}:${m}:${s}.${ms}Z`;
}

// Today as YYYY-MM-DD
function todayStr() {
  return new Date().toISOString().split("T")[0];
}

// ---------------------------------------------------------------------------
// Domain constants
// ---------------------------------------------------------------------------
const ORDER_STATUSES = ["Authorized", "Active", "Booked", "Sent"];
const TRANSACTION_TYPES = ["SELL", "BUY"];
const OWNER_TYPES = ["OWNER_TYPE_HYBRID", "OWNER_TYPE_PM", "OWNER_TYPE_SYSTEM"];
const PM_INITIALS = ["TESTVLD1", "TESTVLD2", "TESTVLD3", "PMUSER1", "PMUSER2"];
const TRADER_INITIALS = ["AUTOFA", "CONV", "TSGOPS", "FUNDADPT", "AUTOTRD"];
const MODIFIERS = ["ouncroni", "fundadpt", "oukdarce", "tsgops", "autofa", "rebaladt"];
const TRADE_PURPOSES = [
  "MA - Flow Investment / Divestment",
  "MA - Rebalance",
  "MA - Tax Loss Harvesting",
];
const EXCHANGES = ["OQ", "N", "O", "A"];
const ASSET_TICKERS = ["BND", "SPY", "IWM", "QQQ", "AGG", "VTI", "GLD", "TLT", "LQD", "HYG"];

function generatePortfolioTicker() {
  // Matches pattern: D_BL<digit><2 alpha>J<digit>A   e.g. D_BL2BAJ2A
  return `D_BL${randInt(1, 9)}${randUpper(2)}J${randInt(1, 9)}A`;
}

// 9-digit numeric CUSIP-style
function generateNumericAssetId() {
  return randDigits(9);
}

// 9-char alphanumeric asset ID  e.g. BEE0YXYD9
function generateAlphaAssetId() {
  return randAlphaNum(3) + randInt(0, 9) + randAlphaNum(4) + randInt(0, 9);
}

function generateAssetReference(assetId) {
  // Numeric IDs get the full ISIN/SEDOL/RIC treatment occasionally
  if (/^\d+$/.test(assetId) && Math.random() > 0.4) {
    const ticker = randChoice(ASSET_TICKERS);
    const exchange = randChoice(EXCHANGES);
    return {
      snpCusip: assetId,
      isin: `US${assetId}${randInt(0, 9)}`,
      sedol: randAlphaNum(7),
      ric: `${ticker}.${exchange}`,
    };
  }
  return { snpCusip: assetId };
}

function generateOrder(date) {
  const id = String(randInt(400000, 700000));
  const orderDetailId = parseInt(id) + randInt(0, 200);
  const portfolioId = String(randInt(5100, 5500));
  const portfolioTicker = generatePortfolioTicker();

  const txType = randChoice(TRANSACTION_TYPES);
  const sign = txType === "SELL" ? -1 : 1;
  const quantity = sign * randFloat(100, 200000, 4);
  const price = randFloat(5, 250, 2);
  const principal = parseFloat((quantity * price).toFixed(2));

  const status = randChoice(ORDER_STATUSES);
  const modifier = randChoice(MODIFIERS);
  const pm = randChoice(PM_INITIALS);
  const version = randInt(1, 5);
  const touchCount = version + randInt(0, 2);

  const entryTime = randTimestampMs(date);
  // authorizeTime is slightly after entry
  const authorizeTime = randTimestampMs(date);
  const modifyTime = authorizeTime;

  const useNumericId = Math.random() > 0.4;
  const assetId = useNumericId ? generateNumericAssetId() : generateAlphaAssetId();
  const assetReference = generateAssetReference(assetId);

  const basketId = `A4_REBALANCE_RUN_${randInt(1000, 2000)}`;

  const order = {
    id,
    orderStatus: status,
    orderDetails: [
      {
        orderDetailId,
        version: 1,
        portfolioReference: { portfolioId, portfolioTicker },
        quantity,
        strategyId: 0,
        strategyName: "Unassigned",
        quantityBooked: 0,
        modifier,
        modifyTime: entryTime,
        requestStatus: "ASSIGNED_TO_STATUS_UNSPECIFIED",
        reservations: [],
      },
    ],
    assetId,
    assetReference,
    transactionType: txType,
    settleDate: date,
    orderDate: date,
    basketId,
    marketPrice: price,
    settleCurrencyCode: "USD",
    orderType: "Market on Close",
    expirationType: "Good Till Cancel",
    expirationDate: "2222-12-31",
    pmInitials: pm,
    tradePurpose: randChoice(TRADE_PURPOSES),
    assignedToStatus: "ASSIGNED_TO_STATUS_UNSPECIFIED",
    tradingBenchmark: "Market on Close",
    tradingBenchmarkDate: date,
    authorizeTime,
    entryTime,
    factor: 1,
    interest: 0,
    modifier,
    modifyTime,
    principal,
    version,
    ownerType: randChoice(OWNER_TYPES),
    raiser: pm,
    touchCount,
    orderComments: [],
    flags: [],
    financingType: "FINANCING_TYPE_UNSPECIFIED",
    face: quantity,
    relationships: [],
    fillAmount: 0,
    orderCustomFields: [],
  };

  // Active orders have extra fields
  if (status === "Active") {
    order.activeTime = authorizeTime;
    order.traderInitials = randChoice(TRADER_INITIALS);
    order.tradeDate = date;
    order.unitType = "VALUE";
  }

  // Sent orders also carry traderInitials
  if (status === "Sent") {
    order.traderInitials = randChoice(TRADER_INITIALS);
  }

  return order;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// POST /orders — mirrors BlackRock Aladdin Orders API shape
app.post("/orders", authenticate, (req, res) => {
  const date = todayStr();
  const count = randInt(2, 6);
  const orders = Array.from({ length: count }, () => generateOrder(date));

  res.json({
    orders,
    nextPageToken: "",
    status: `${count} result(s) processed, 0 result(s) not found, 0 result(s) hidden, 0 duplicate key(s) found in total`,
  });
});

// POST /orders/bulk — additional testing endpoint; same auth/shape as
// /orders (per v1FilterOrdersResponse in the Order API OpenAPI spec), but
// always returns a fixed 1211 randomized orders instead of a random 2-6.
const BULK_ORDER_COUNT = 1211;

app.post("/orders/bulk", authenticate, (req, res) => {
  const date = todayStr();
  const orders = Array.from({ length: BULK_ORDER_COUNT }, () => generateOrder(date));

  res.json({
    orders,
    nextPageToken: "",
    status: `${BULK_ORDER_COUNT} result(s) processed, 0 result(s) not found, 0 result(s) hidden, 0 duplicate key(s) found in total`,
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`\n=== Mock Order API ===`);
  console.log(`Server listening on port ${PORT}`);
  console.log(`\nEndpoints:`);
  console.log(`  GET  /health      — no auth required`);
  console.log(`  POST /orders      — requires Bearer token`);
  console.log(`  POST /orders/bulk — requires Bearer token; always returns ${BULK_ORDER_COUNT} orders`);
  console.log(`\nKeycloak issuer: ${ISSUER}\n`);
});
