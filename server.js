// server.js
const express = require("express");
const cors = require("cors");
const path = require("path");
const { ROUTES } = require("./checkpoints");
const { buildRouteStatus } = require("./geofence");

const app = express();
app.use(cors());
app.use(express.json());

// Serve the live map dashboard from /public -- this means the API and the
// website are ONE deployment with ONE public URL. No separate frontend
// hosting, no cross-origin mismatch between "pages.dev" and "localhost".
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 4000;

// In-memory store: swap this for a real database (Postgres, SQLite, etc.)
// once you're past prototyping. Keyed by routeKey -> { latest, previous }.
const pingStore = {
  dehu: { latest: null, previous: null },
  alandi: { latest: null, previous: null }
};

// System-wide status (node count, last sync) -- also in-memory for now.
let systemStatus = { nodesOnline: 0, lastSyncTimestamp: null };

// ---- INGESTION: GPS devices / phones POST here ----
// Body: { routeKey: "dehu" | "alandi", lat: number, lng: number, deviceId: string }
app.post("/api/location", (req, res) => {
  const { routeKey, lat, lng, deviceId } = req.body;

  if (!routeKey || !ROUTES[routeKey]) {
    return res.status(400).json({ error: "routeKey must be 'dehu' or 'alandi'" });
  }
  if (typeof lat !== "number" || typeof lng !== "number") {
    return res.status(400).json({ error: "lat and lng must be numbers" });
  }

  const ping = { lat, lng, deviceId: deviceId || "unknown", timestamp: Date.now() };

  pingStore[routeKey].previous = pingStore[routeKey].latest;
  pingStore[routeKey].latest = ping;

  systemStatus.lastSyncTimestamp = Date.now();
  systemStatus.nodesOnline = Object.values(pingStore).filter(
    (r) => r.latest && Date.now() - r.latest.timestamp < 5 * 60 * 1000
  ).length;

  res.json({ ok: true, received: ping });
});

// ---- READ: dashboard fetches this instead of data.json ----
app.get("/api/wari/:route", (req, res) => {
  const routeKey = req.params.route;
  if (!ROUTES[routeKey]) {
    return res.status(404).json({ error: "unknown route" });
  }

  const { latest, previous } = pingStore[routeKey];
  if (!latest) {
    return res.status(503).json({ error: "no position data yet for this route" });
  }

  const routeStatus = buildRouteStatus(routeKey, latest, previous);
  res.json({
    systemStatus: {
      nodesOnline: systemStatus.nodesOnline,
      syncedSecondsAgo: systemStatus.lastSyncTimestamp
        ? Math.round((Date.now() - systemStatus.lastSyncTimestamp) / 1000)
        : null
    },
    route: routeStatus
  });
});

// Convenience: both routes in one call, matching the original data.json shape
app.get("/api/wari", (req, res) => {
  const result = { systemStatus: {}, routes: {} };
  let anyData = false;

  Object.keys(ROUTES).forEach((routeKey) => {
    const { latest, previous } = pingStore[routeKey];
    if (latest) {
      anyData = true;
      result.routes[routeKey] = buildRouteStatus(routeKey, latest, previous);
    }
  });

  result.systemStatus = {
    nodesOnline: systemStatus.nodesOnline,
    syncedSecondsAgo: systemStatus.lastSyncTimestamp
      ? Math.round((Date.now() - systemStatus.lastSyncTimestamp) / 1000)
      : null
  };

  if (!anyData) return res.status(503).json({ error: "no position data yet for any route" });
  res.json(result);
});

app.get("/api/status", (req, res) => {
  res.json({ status: "Wari tracking backend running", endpoints: ["/api/location (POST)", "/api/wari/:route (GET)", "/api/wari (GET)"] });
});

app.listen(PORT, () => {
  console.log(`Wari tracking backend listening on port ${PORT}`);
});
