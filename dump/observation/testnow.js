const { startMqttClient } = require("./mqtt");
const { fetchAllFloorplans } = require("./database");
const { saveBeaconPositions } = require("./beaconStorage");

let realtimeBeaconPairs = new Map(); // floorplanId -> Map(dmac -> Map(timestamp -> { gmac: calcDist }))
const timeTolerance = 5000;
let client;
const floorplans = new Map(); // floorplanId -> { name, scale, gateways: Map(gmac -> { x, y }), maskedAreas: [] }
const gmacToFloorplans = new Map(); // gmac -> Set<floorplanId>
let interval;
let refreshInterval;

async function initializeAllFloorplans() {
  try {
    const {
      floorplans: floorplanData,
      gateways,
      maskedAreas,
    } = await fetchAllFloorplans();
    floorplans.clear();
    gmacToFloorplans.clear();

    for (const { floorplan_id, name, scale } of floorplanData) {
      floorplans.set(floorplan_id, {
        name,
        scale,
        gateways: new Map(),
        maskedAreas: [],
      });
    }

    for (const { floorplan_id, gmac, pos_px_x, pos_px_y } of gateways) {
      if (floorplans.has(floorplan_id)) {
        floorplans
          .get(floorplan_id)
          .gateways.set(gmac, { x: Number(pos_px_x), y: Number(pos_px_y) });

        if (!gmacToFloorplans.has(gmac)) {
          gmacToFloorplans.set(gmac, new Set());
        }
        gmacToFloorplans.get(gmac).add(floorplan_id);
      }
    }

    for (const { floorplan_id, area_shape, restricted_status } of maskedAreas) {
      if (floorplans.has(floorplan_id) && area_shape) {
        const polygonWithIds = JSON.parse(area_shape);
        const polygon = polygonWithIds.map(({ x_px, y_px }) => ({
          x_px,
          y_px,
        }));
        if (polygon.length >= 3) {
          floorplans.get(floorplan_id).maskedAreas.push({
            area_shape: JSON.stringify(polygon),
            restricted_status,
          });
        }
      }
    }

    console.log(`Initialized ${floorplans.size} floorplans`);
    console.log("gmacToFloorplans:", Object.fromEntries(gmacToFloorplans));
    return floorplans;
  } catch (error) {
    console.error("Inisialisasi floorplan gagal:", error);
    throw error;
  }
}

// Fungsi untuk memeriksa apakah titik berada di dalam poligon
function pointInPolygon(point, polygon) {
  let x = point.x,
    y = point.y,
    inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    let xi = polygon[i].x_px,
      yi = polygon[i].y_px;
    let xj = polygon[j].x_px,
      yj = polygon[j].y_px;
    let intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Fungsi untuk memeriksa apakah titik valid berdasarkan maskedAreas
function isPointValid(point, floorplanId) {
  const floorplan = floorplans.get(floorplanId);
  if (!floorplan) return false;
  const { maskedAreas } = floorplan;
  // Periksa apakah ada area restrict
  const isInRestrictedArea = maskedAreas.some((area) => {
    if (area.restricted_status === "restrict") {
      try {
        const polygon = JSON.parse(area.area_shape);
        console.log(`Restricted area check: ${pointInPolygon(point, polygon)}`);
        return pointInPolygon(point, polygon);
      } catch {
        return false;
      }
    }
    return false;
  });
  if (isInRestrictedArea) return false;

  // Periksa apakah ada area non-restrict dan apakah titik berada di dalamnya
  const hasNonRestrict = maskedAreas.some(
    (a) => a.restricted_status === "non-restrict"
  );
  if (hasNonRestrict) {
    return maskedAreas.some((area) => {
      if (area.restricted_status === "non-restrict") {
        try {
          const polygon = JSON.parse(area.area_shape);
          return pointInPolygon(point, polygon);
        } catch {
          return false;
        }
      }
      return false;
    });
  }

  return true;
}

function setupRealtimeStream() {
  if (!client) {
    client = startMqttClient((topic, filteredBeacon) => {
      try {
        const { dmac, gmac, calcDist: calcDistStr, time } = filteredBeacon;
        const calc_dist = parseFloat(calcDistStr);
        const timestamp = new Date(time.replace(",", ".") + "Z").getTime();
        const floorplanIds = gmacToFloorplans.get(gmac);
        if (!floorplanIds) return;

        for (const floorplanId of floorplanIds) {
          if (!realtimeBeaconPairs.has(floorplanId)) {
            realtimeBeaconPairs.set(floorplanId, new Map());
          }
          const floorplanBeacons = realtimeBeaconPairs.get(floorplanId);

          if (!floorplanBeacons.has(dmac)) {
            floorplanBeacons.set(dmac, new Map());
          }
          const dmacData = floorplanBeacons.get(dmac);

          let closestTime = null,
            minDiff = Infinity;
          for (let [t] of dmacData) {
            const diff = Math.abs(timestamp - t);
            if (diff < minDiff && diff <= timeTolerance) {
              minDiff = diff;
              closestTime = t;
            }
          }

          if (!closestTime) closestTime = timestamp;
          if (!dmacData.has(closestTime)) dmacData.set(closestTime, {});
          dmacData.get(closestTime)[gmac] = calc_dist;

          const floorplan = floorplans.get(floorplanId);
          if (floorplan) {
            const positions = generateBeaconPositions(
              floorplanId,
              floorplan.gateways,
              floorplan.scale
            );
            const validPositions = positions.filter(
              (p) => p.point && isPointValid(p.point, floorplanId)
            );
            if (validPositions.length > 0) {
              client.publish(`${floorplanId}`, JSON.stringify(validPositions), {
                qos: 1,
              });
            }
          }
        }
      } catch (error) {
        console.error("Error processing beacon:", error, filteredBeacon);
      }
    });
  }

  if (interval) clearInterval(interval);
  interval = setInterval(async () => {
    const now = Date.now();
    for (const [floorplanId, beacons] of realtimeBeaconPairs) {
      const floorplan = floorplans.get(floorplanId);
      if (floorplan) {
        const positions = generateBeaconPositions(
          floorplanId,
          floorplan.gateways,
          floorplan.scale
        );
        const valid = positions.filter(
          (p) => p.point && isPointValid(p.point, floorplanId)
        );
        if (valid.length > 0) await saveBeaconPositions(valid);
      }

      for (const [dmac, timestamps] of beacons) {
        for (const [t] of timestamps) {
          if (now - t > timeTolerance) timestamps.delete(t);
        }
        if (timestamps.size === 0) beacons.delete(dmac);
      }
      if (beacons.size === 0) realtimeBeaconPairs.delete(floorplanId);
    }
  }, timeTolerance);

  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(
    () => initializeAllFloorplans().catch(console.error),
    120000
  );
}

function generateBeaconPointsBetweenReaders(
  start,
  end,
  firstDist,
  secondDist,
  scale,
  floorplanId
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length === 0) return null;

  const ux = dx / length,
    uy = dy / length;
  const lengthMeter = length * scale;
  const totalDist = firstDist + secondDist;
  if (totalDist === 0 || totalDist > lengthMeter) return null;

  const ratio = firstDist / totalDist;
  const distFromStart = ratio * lengthMeter;
  const baseX = start.x + ux * distFromStart;
  const baseY = start.y + uy * distFromStart;
  const perpX = -uy;
  const perpY = ux;
  // const spread = 1,
  //   maxAttempts = 10;

  // for (let i = 0; i < maxAttempts; i++) {
  //   const offsetP = Math.random() * spread * 2 - spread;
  //   const offsetA = Math.random() * spread * 2 - spread;
  //   const x = Math.round(baseX + perpX * offsetP + ux * offsetA);
  //   const y = Math.round(baseY + perpY * offsetP + uy * offsetA);

  const spreadLeft = 1;
  const spreadRight = 1;
  const spreadAlong = 1;
  const maxAttempts = 10;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const offsetPerp =
      Math.random() * (spreadRight + spreadLeft) -
      (spreadRight + spreadLeft) / 2;
    const offsetAlong = Math.random() * spreadAlong - spreadAlong / 2;

    const x = Math.round(baseX + perpX * offsetPerp + ux * offsetAlong);
    const y = Math.round(baseY + perpY * offsetPerp + uy * offsetAlong);

    const point = { x, y };
    if (isPointValid(point, floorplanId)) return point;
  }
  return null;
}

function generateBeaconPositions(floorplanId, gateways, scale) {
  const pairs = [];
  const floorplanBeacons = realtimeBeaconPairs.get(floorplanId) || new Map();
  for (let [dmac, timestamps] of floorplanBeacons) {
    for (let [time, distances] of timestamps) {
      const readerDistances = Array.from(gateways.keys())
        .map((gmac) => ({ gmac, distance: distances[gmac] ?? Infinity }))
        .sort((a, b) => a.distance - b.distance)
        .filter((r) => r.distance !== Infinity);

      if (readerDistances.length >= 2) {
        const [first, second] = readerDistances;
        const start = gateways.get(first.gmac);
        const end = gateways.get(second.gmac);
        const point = generateBeaconPointsBetweenReaders(
          start,
          end,
          first.distance,
          second.distance,
          scale,
          floorplanId
        );
        if (point) {
          pairs.push({
            beaconId: dmac,
            pair: `${first.gmac}_${second.gmac}`,
            first: first.gmac,
            second: second.gmac,
            firstDist: first.distance,
            secondDist: second.distance,
            point,
            firstReaderCoord: { id: first.gmac, ...start },
            secondReaderCoord: { id: second.gmac, ...end },
            time: new Date(time).toISOString(),
            floorplanId,
          });
        }
      }
    }
  }
  return pairs;
}

module.exports = {
  setupRealtimeStream,
  generateBeaconPositions,
  initializeAllFloorplans,
};
