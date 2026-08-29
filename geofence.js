// geofence.js
const { ROUTES } = require("./checkpoints");

// Haversine formula: distance in km between two lat/lng points
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Find the checkpoint closest to a given position, and estimate how far
// along the route (in km) that position roughly corresponds to.
function locateOnRoute(routeKey, lat, lng) {
  const route = ROUTES[routeKey];
  if (!route) return null;

  let nearest = null;
  let nearestDist = Infinity;
  route.checkpoints.forEach((cp) => {
    const d = haversineKm(lat, lng, cp.lat, cp.lng);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = cp;
    }
  });

  return { nearestCheckpoint: nearest, distanceToNearestKm: nearestDist };
}

// Estimated average speed (km/h) between two GPS pings
function speedKmh(prevPing, currPing) {
  if (!prevPing) return null;
  const distKm = haversineKm(prevPing.lat, prevPing.lng, currPing.lat, currPing.lng);
  const hours = (currPing.timestamp - prevPing.timestamp) / 1000 / 3600;
  if (hours <= 0) return null;
  return distKm / hours;
}

// Compass bearing (0-360, 0 = north) from point A to point B.
// Used to rotate the navigation arrow so it points the direction of travel.
function bearingDeg(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// "Smart" pace estimate: instead of trusting the instantaneous speed between
// only the last two pings (which is noisy -- a single bad GPS fix or a pause
// at a checkpoint swings it wildly), keep a short rolling history of recent
// per-ping speeds and use their weighted average, favoring recent pings.
// This is a lightweight, explainable smoothing filter -- not a trained model --
// but it's what actually makes the ETA stable enough to be useful live.
const paceHistory = {}; // routeKey -> array of recent speedKmh values

function updatePaceHistory(routeKey, speed) {
  if (speed === null || !isFinite(speed) || speed <= 0) return;
  if (!paceHistory[routeKey]) paceHistory[routeKey] = [];
  paceHistory[routeKey].push(speed);
  if (paceHistory[routeKey].length > 8) paceHistory[routeKey].shift();
}

function smoothedPaceKmh(routeKey, fallback) {
  const history = paceHistory[routeKey];
  if (!history || history.length === 0) return fallback;
  // Weighted average: most recent pings count more (recent pace matters most
  // for "when will they arrive", but a single outlier shouldn't dominate).
  let weightedSum = 0;
  let weightTotal = 0;
  history.forEach((speed, i) => {
    const weight = i + 1; // later entries (more recent) get higher weight
    weightedSum += speed * weight;
    weightTotal += weight;
  });
  return weightedSum / weightTotal;
}

// Given the latest and previous ping for a route, produce the full JSON
// payload in the same shape the dashboard's data.json already expects.
function buildRouteStatus(routeKey, latestPing, prevPing) {
  const route = ROUTES[routeKey];
  if (!route || !latestPing) return null;

  const { nearestCheckpoint, distanceToNearestKm } = locateOnRoute(
    routeKey,
    latestPing.lat,
    latestPing.lng
  );

  const totalRouteKm = route.checkpoints[route.checkpoints.length - 1].distanceKm;
  const progressPercent = Math.min(
    100,
    Math.round((nearestCheckpoint.distanceKm / totalRouteKm) * 100)
  );

  const instantSpeed = speedKmh(prevPing, latestPing);
  updatePaceHistory(routeKey, instantSpeed);
  const speed = smoothedPaceKmh(routeKey, instantSpeed);

  const heading = prevPing
    ? bearingDeg(prevPing.lat, prevPing.lng, latestPing.lat, latestPing.lng)
    : null;

  const checkpoints = route.checkpoints
    .filter((cp) => cp.resources) // only checkpoints meant for display have resources defined
    .map((cp) => {
      let statusColor = "green";
      let status = "On track";

      if (cp.id === nearestCheckpoint.id) {
        statusColor = "amber";
        status = "Approaching";
        if (speed !== null && cp.paceAlertThresholdKmh && speed < cp.paceAlertThresholdKmh) {
          statusColor = "red";
          status = "Slow pace";
        }
      } else if (cp.distanceKm < nearestCheckpoint.distanceKm) {
        statusColor = "green";
        status = "Passed";
      } else {
        statusColor = "green";
        status = "On track";
      }

      // rough ETA: remaining distance / assumed walking pace (fallback 3 km/h)
      const remainingKm = cp.distanceKm - nearestCheckpoint.distanceKm;
      const assumedPace = speed && speed > 0.5 ? speed : 3;
      const etaHours = Math.max(0, remainingKm / assumedPace);
      const windowStart = formatEta(etaHours);
      const windowEnd = formatEta(etaHours + 0.5);

      return {
        name: cp.name,
        status,
        statusColor,
        windowStart,
        windowEnd,
        resources: cp.resources,
        lat: cp.lat,
        lng: cp.lng
      };
    });

  const alerts = [];
  if (speed !== null && nearestCheckpoint.paceAlertThresholdKmh && speed < nearestCheckpoint.paceAlertThresholdKmh) {
    alerts.push({
      time: formatNow(latestPing.timestamp),
      text: `Pace near ${nearestCheckpoint.name} dropped below threshold (${speed.toFixed(1)} km/h); flagged for review.`
    });
  }
  const minutesSincePing = (Date.now() - latestPing.timestamp) / 1000 / 60;
  if (minutesSincePing > 10) {
    alerts.push({
      time: formatNow(Date.now()),
      text: `No position update received for ${Math.round(minutesSincePing)} minutes; escalated to supervisor.`
    });
  }

  return {
    label: route.label,
    progressPercent,
    currentPosition: { lat: latestPing.lat, lng: latestPing.lng },
    heading,
    path: route.path,
    checkpoints,
    alerts
  };
}

function formatEta(hoursFromNow) {
  const d = new Date(Date.now() + hoursFromNow * 3600 * 1000);
  return d.toTimeString().slice(0, 5);
}

function formatNow(ts) {
  return new Date(ts).toTimeString().slice(0, 5) + " IST";
}

module.exports = { haversineKm, locateOnRoute, buildRouteStatus };
