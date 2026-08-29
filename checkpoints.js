// checkpoints.js
//
// NOTE: The lat/lng values below are illustrative placeholders spaced along a
// straight-line approximation of the Dehu -> Pandharpur corridor, just so the
// geofencing math has real numbers to work with. Replace them with the actual
// surveyed coordinates of your checkpoints (medical camps, ghat sections,
// market junctions, etc.) before using this for real navigation.

const ROUTES = {
  dehu: {
    label: "Sant Tukaram Maharaj Palkhi · Dehu to Pandharpur",
    checkpoints: [
      { id: "dehu-origin", name: "Dehu", lat: 18.7167, lng: 73.7833, distanceKm: 0 },
      { id: "village", name: "Village Waypoint", lat: 18.55, lng: 74.05, distanceKm: 32 },
      {
        id: "bridge-14",
        name: "Bridge 14 · Medical Camp 4",
        lat: 18.30,
        lng: 74.35,
        distanceKm: 68,
        resources: [
          { label: "Medical confirmed", state: "confirmed" },
          { label: "Sanitation pending", state: "pending" }
        ]
      },
      {
        id: "ghat-climb-2",
        name: "Ghat Climb 2",
        lat: 18.05,
        lng: 74.65,
        distanceKm: 104,
        resources: [{ label: "Crowd control pending", state: "pending" }],
        // below this average km/h between pings, we flag a "slow pace" alert
        paceAlertThresholdKmh: 2.0
      },
      {
        id: "market-junction",
        name: "Market Junction",
        lat: 17.90,
        lng: 74.95,
        distanceKm: 138,
        resources: [{ label: "Marshals deployed", state: "confirmed" }]
      },
      {
        id: "water-point-7",
        name: "Water Point 7",
        lat: 17.78,
        lng: 75.15,
        distanceKm: 162,
        resources: [{ label: "Vendors confirmed", state: "confirmed" }]
      },
      { id: "pandharpur", name: "Pandharpur", lat: 17.6792, lng: 75.3317, distanceKm: 195 }
    ]
  },
  alandi: {
    label: "Sant Dnyaneshwar Maharaj Palkhi · Alandi route overview",
    checkpoints: [
      { id: "alandi-origin", name: "Alandi", lat: 18.6789, lng: 73.9040, distanceKm: 0 },
      { id: "village", name: "Village Waypoint", lat: 18.50, lng: 74.15, distanceKm: 30 },
      {
        id: "bridge-14",
        name: "Bridge 14 · Medical Camp 4",
        lat: 18.28,
        lng: 74.42,
        distanceKm: 66,
        resources: [
          { label: "Medical confirmed", state: "confirmed" },
          { label: "Sanitation pending", state: "pending" }
        ]
      },
      {
        id: "ghat-climb-2",
        name: "Ghat Climb 2",
        lat: 18.02,
        lng: 74.70,
        distanceKm: 100,
        resources: [{ label: "Crowd control pending", state: "pending" }],
        paceAlertThresholdKmh: 2.0
      },
      {
        id: "market-junction",
        name: "Market Junction",
        lat: 17.88,
        lng: 75.00,
        distanceKm: 134,
        resources: [{ label: "Marshals deployed", state: "confirmed" }]
      },
      {
        id: "water-point-7",
        name: "Water Point 7",
        lat: 17.76,
        lng: 75.18,
        distanceKm: 158,
        resources: [{ label: "Vendors confirmed", state: "confirmed" }]
      },
      { id: "pandharpur", name: "Pandharpur", lat: 17.6792, lng: 75.3317, distanceKm: 190 }
    ]
  }
};

// Build a denser "path" polyline for each route by linearly interpolating
// between consecutive checkpoints. This is a placeholder so the map has a
// real line to draw and a real line to snap the tracker to. Replace with
// actual surveyed/road-following coordinates (e.g. traced in Google Earth or
// pulled from an OSRM/GraphHopper route) before using this for real navigation.
const POINTS_PER_SEGMENT = 12;

function buildPath(checkpoints) {
  const path = [];
  for (let i = 0; i < checkpoints.length - 1; i++) {
    const a = checkpoints[i];
    const b = checkpoints[i + 1];
    for (let step = 0; step < POINTS_PER_SEGMENT; step++) {
      const t = step / POINTS_PER_SEGMENT;
      path.push({
        lat: a.lat + (b.lat - a.lat) * t,
        lng: a.lng + (b.lng - a.lng) * t,
        distanceKm: a.distanceKm + (b.distanceKm - a.distanceKm) * t
      });
    }
  }
  const last = checkpoints[checkpoints.length - 1];
  path.push({ lat: last.lat, lng: last.lng, distanceKm: last.distanceKm });
  return path;
}

Object.keys(ROUTES).forEach((key) => {
  ROUTES[key].path = buildPath(ROUTES[key].checkpoints);
});

module.exports = { ROUTES };
