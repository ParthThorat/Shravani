// simulate.js
// Pretends to be a GPS device walking along the "dehu" route, posting a
// position update every few seconds. Run alongside the server to see the
// dashboard come alive without needing real hardware yet.
//
// Usage: node simulate.js [routeKey]

const { ROUTES } = require("./checkpoints");

const routeKey = process.argv[2] || "dehu";
const route = ROUTES[routeKey];
if (!route) {
  console.error(`Unknown route "${routeKey}". Use "dehu" or "alandi".`);
  process.exit(1);
}

const SERVER_URL = process.env.SERVER_URL || "http://localhost:4000";
const STEP_INTERVAL_MS = 3000;

const points = route.checkpoints;
let segment = 0; // which pair of checkpoints we're walking between
let t = 0; // 0..1 progress within the current segment

async function tick() {
  const a = points[segment];
  const b = points[segment + 1];

  if (!b) {
    console.log("Reached the end of the route.");
    clearInterval(timer);
    return;
  }

  const lat = a.lat + (b.lat - a.lat) * t;
  const lng = a.lng + (b.lng - a.lng) * t;

  try {
    const res = await fetch(`${SERVER_URL}/api/location`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ routeKey, lat, lng, deviceId: "sim-device-1" })
    });
    const data = await res.json();
    console.log(`[${routeKey}] posted (${lat.toFixed(4)}, ${lng.toFixed(4)}) near ${a.name} -> ${b.name}`, data.ok ? "OK" : data);
  } catch (err) {
    console.error("Failed to post ping:", err.message);
  }

  t += 0.2;
  if (t >= 1) {
    t = 0;
    segment += 1;
  }
}

const timer = setInterval(tick, STEP_INTERVAL_MS);
tick();
