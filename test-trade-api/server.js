const express = require("express");
const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3002;
const KEYCLOAK_URL = process.env.KEYCLOAK_URL || "http://localhost:8080";
const REALM = "test-realm";
const ISSUER = `${KEYCLOAK_URL}/realms/${REALM}`;
const JWKS_URI = `${ISSUER}/protocol/openid-connect/certs`;

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

function randAlphaNum(len) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// Timestamp without milliseconds anchored to a given date, random HH:MM:SS
function randTimestamp(dateStr) {
  const h = String(randInt(0, 23)).padStart(2, "0");
  const m = String(randInt(0, 59)).padStart(2, "0");
  const s = String(randInt(0, 59)).padStart(2, "0");
  return `${dateStr}T${h}:${m}:${s}Z`;
}

// Add N calendar days to a YYYY-MM-DD string
function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split("T")[0];
}

// ---------------------------------------------------------------------------
// Domain constants
// ---------------------------------------------------------------------------
const TRANSACTION_TYPES = ["SELL", "BUY"];
const EXECUTION_SOURCES = [
  "EXECUTION_TIME_SOURCE_AUTHORIZED_TIME",
  "EXECUTION_TIME_SOURCE_VENUE",
];
const TRADER_INITIALS = ["AUTOFA", "CONV", "TSGOPS", "FUNDADPT", "AUTOTRD"];
const ENTERED_BY = ["tsgops", "fundadpt", "autofa", "conv"];
const CONFIRMED_WITH = ["CONV", "fundadpt", "ELEC", "PHONE"];
const PURPOSES = ["MAFID", "REBAL", "TAXLOSS"];
const BROKERS = [
  { brokerId: "4069", brokerTicker: "VIRT",   brokerShortname: "VIRT" },
  { brokerId: "1627", brokerTicker: "VPA_US", brokerShortname: "VPA_US" },
  { brokerId: "4606", brokerTicker: "PIPE",   brokerShortname: "PIPE" },
  { brokerId: "2001", brokerTicker: "BAML",   brokerShortname: "BAML" },
  { brokerId: "3302", brokerTicker: "GS",     brokerShortname: "GS" },
  { brokerId: "5510", brokerTicker: "MSCO",   brokerShortname: "MSCO" },
];

// The full set of trade charge categories, padded to 15 characters to match
// the fixed-width format of the real API.
const CHARGE_CATEGORIES = [
  "AMFE", "ASFE", "CCPF", "CHAR", "CLNT", "CLRF", "CNFC", "COCA",
  "CONS", "COUN", "CPFE", "CRCC", "DCMF", "DECO", "DIPR", "ECBE",
  "EXCO", "EXEC", "EXFE", "FEXE", "FTRX", "FUMF", "FWTH", "HAIR",
  "INTT", "ISDI", "LEVY", "LOCL", "LOCO", "MISC", "ORF",  "OTHR",
  "PAYD", "RECO", "REGF", "SIS1", "SIS2", "SLIP", "STAM", "STEX",
  "SWAI", "TIFE", "TRAN", "TRAX", "UFFE", "VATA", "VATO", "WITH",
];
const RATE_TYPE_BLANK = "               "; // 15 spaces

function generateTradeCharges(commission, fee) {
  return CHARGE_CATEGORIES.map((cat) => {
    const category = cat.padEnd(15); // pad to fixed 15-char width
    let amount = 0;
    // LOCO carries the commission, REGF carries the regulatory fee
    if (cat === "LOCO" && commission > 0) amount = commission;
    if (cat === "REGF" && fee > 0) amount = fee;
    return { amount, rate: 0, rateType: RATE_TYPE_BLANK, category };
  });
}

function generatePortfolioTicker() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const seg = Array.from({ length: 7 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `D_${seg}`;
}

function generateAssetId() {
  // Mix of 9-digit numeric and 9-char alphanumeric IDs
  if (Math.random() > 0.5) {
    return String(randInt(100000000, 999999999));
  }
  return randAlphaNum(3) + randInt(0, 9) + randAlphaNum(4) + randInt(0, 9);
}

function generateBlockTrade(tradeDate) {
  const settlementDate = addDays(tradeDate, 1);

  const tradeNumber = randInt(1, 500);
  const invnum = -tradeNumber;

  const txType = randChoice(TRANSACTION_TYPES);
  const sign = txType === "SELL" ? -1 : 1;
  const quantity = parseFloat((sign * randFloat(1, 1000, 4)).toFixed(4));
  const price = randFloat(5, 250, 4);
  const principal = parseFloat((quantity * price).toFixed(2));

  const portfolioId = String(randInt(5100, 5500));
  const portfolioTicker = generatePortfolioTicker();

  const commission = parseFloat(randFloat(0, 0.5, 2).toFixed(2));
  const fee = parseFloat(randFloat(0, 0.05, 2).toFixed(2));
  const hasFullCharges = Math.random() > 0.35; // ~65% of trades carry the full charge list

  const orderId = Math.random() > 0.4 ? String(randInt(400000, 700000)) : "0";
  const settlementInstructionId1 = orderId === "0" ? "-1" : String(randInt(1000, 9999));
  const currentFactoredDownAmount = parseFloat(Math.abs(quantity).toFixed(4));

  const broker = randChoice(BROKERS);
  const confirmedStr = randChoice(CONFIRMED_WITH);
  const enteredByStr = randChoice(ENTERED_BY);
  const traderStr = randChoice(TRADER_INITIALS);
  const execSource = randChoice(EXECUTION_SOURCES);
  const multiFundId = randInt(1600000, 1700000);
  const placementId = orderId === "0" ? "0" : String(randInt(500000, 700000));
  const touchCount = randInt(1, 5);
  const version = randInt(1, 4);

  // Timestamps — execution on tradeDate, entry/review on settlementDate morning
  const executionTime = randTimestamp(tradeDate);
  const entryTime = randTimestamp(settlementDate);
  const reviewTime = executionTime;
  const authorizedTime = executionTime;
  const modifyTime = randTimestamp(settlementDate);

  const trade = {
    id: "",
    portfolioReference: { portfolioId, portfolioTicker },
    invnum,
    tradeNumber,
    quantity,
    tradeRelationships: [],
    modifyTime,
    interest: 0,
    principal,
    orderId,
    strategyReference: { strategyId: "0", strategyName: "Unassigned" },
    seriesNumber: 0,
    commission,
    fee,
    settlementInstructionId1,
    allocationAmount: 0,
    exchangeRate: 1,
    exchange: "",
    rollFee: 0,
    effectiveTermDate: null,
    collaterals: [],
    currentFactoredDownAmount,
    externalTradeReferences: [],
    tradeCharges: hasFullCharges ? generateTradeCharges(commission, fee) : [],
    tradeFlags: {
      cashHaircut: false,
      deliveryFreePayment: false,
      electronicPoolNotificationEligible: false,
      fullyAllocated: false,
      netted: false,
      allowDirtyPrice: false,
      compliancePending: false,
      beneficialOwnershipChange: true,
      outsideCommitment: false,
      suppressContract: false,
    },
    forwardExternalTradeReferences: [],
    contracts: [],
    fxLegs: null,
  };

  // Some trades carry additionalTradeCharge
  if (Math.random() > 0.6) {
    trade.additionalTradeCharge = 0;
  }

  const blockTrade = {
    trades: [trade],
    dropRate: 0,
    executionTimeSource: execSource,
    executionTime,
    settlementCurrency: "USD",
    coupon: 0,
    duration: 0,
    factor: 1,
    pricingIndex: "",
    pricingSpread: 0,
    tradeDate,
    factorDate: null,
    settlementDate,
    assetReference: { assetId: generateAssetId() },
    authorizedTime,
    brokerReference: { ...broker },
    brokerDeskId: Math.random() > 0.5 ? "0" : String(randInt(1000, 9999)),
    confirmedWith: confirmedStr,
    confirmedBy: confirmedStr,
    convexity: 0,
    enteredBy: enteredByStr,
    entryTime,
    executingBrokerReference: { ...broker },
    executingBrokerDeskId: Math.random() > 0.5 ? "0" : String(randInt(1000, 9999)),
    multiFundId,
    percentYield: 0,
    placementId,
    price: Math.abs(price),
    psa: 100,
    reviewTime,
    touchCount,
    transactionType: txType,
    traderInitials: traderStr,
    version,
    userDefinedFields: [],
    effectiveRate: 0,
    tradeYieldToCall: 0,
    transferPortfolioReference: null,
    priceType: "PRICE_TYPE_UNSPECIFIED",
    settlementFxRate: 1,
    tradeComments: [],
    tradeQuotes: [],
    daysToMaturity2a7: 0,
    forwardAssetReference: null,
    asset: null,
  };

  // Some trades include purpose
  if (Math.random() > 0.5) {
    blockTrade.purpose = randChoice(PURPOSES);
  }

  return blockTrade;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// POST /blockTrades — mirrors BlackRock Aladdin Block Trades API shape
app.post("/blockTrades", authenticate, (req, res) => {
  const tradeDate =
    req.body?.query?.criteria?.dateTime?.tradeDate ||
    new Date().toISOString().split("T")[0];

  const count = randInt(2, 5);
  const blockTrades = Array.from({ length: count }, () => generateBlockTrade(tradeDate));

  res.json({
    blockTrades,
    status: {
      code: 200,
      message: `Number of results processed successfully: ${count}/${count}`,
      details: [],
    },
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`\n=== Mock Block Trade API ===`);
  console.log(`Server listening on port ${PORT}`);
  console.log(`\nEndpoints:`);
  console.log(`  GET  /health      — no auth required`);
  console.log(`  POST /blockTrades — requires Bearer token; include tradeDate in request body`);
  console.log(`\nKeycloak issuer: ${ISSUER}\n`);
});
