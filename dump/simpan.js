const { startMqttClient } = require("./mqtt");
const { fetchAllFloorplans } = require("./database");
const { saveBeaconPositions } = require("./beaconStorage");

let realtimeBeaconPairs = new Map(); // floorplanId -> Map(dmac -> Map(timestamp -> { gmac: calcDist }))
const timeTolerance = 5000;
let client;
const floorplans = new Map(); // floorplanId -> { name, scale, gateways: Map(gmac -> { x, y }), maskedAreas: [] }
const gmacToFloorplan = new Map(); // gmac -> floorplanId
let interval;
let refreshInterval; // Interval untuk memeriksa perubahan database

async function initializeAllFloorplans() {
  try {
    const {
      floorplans: floorplanData,
      gateways,
      maskedAreas,
    } = await fetchAllFloorplans();
    floorplans.clear();
    gmacToFloorplan.clear();

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
        if (!gmacToFloorplan.has(gmac)) {
          gmacToFloorplan.set(gmac, floorplan_id);
        } else if (gmacToFloorplan.get(gmac) !== floorplan_id) {
          console.error(`GMAC ${gmac} associated with multiple floorplans`);
        }
      }
    }

    for (const { floorplan_id, area_shape, restricted_status } of maskedAreas) {
      if (floorplans.has(floorplan_id) && area_shape) {
        const polygonWithIds = JSON.parse(area_shape);

        const polygon = polygonWithIds.map(({ x_px, y_px }) => ({
          x_px,
          y_px,
        }));
        // Validasi minimal 3 node untuk poligon
        if (polygon.length < 3) {
          console.warn(
            `Polygon for floorplan ${floorplan_id} has less than 3 nodes, skipping.`
          );
          continue;
        }
        floorplans.get(floorplan_id).maskedAreas.push({
          area_shape: JSON.stringify(polygon),
          restricted_status,
        });
      }
    }

    console.log(`Initialized ${floorplans.size} floorplans`);
    return floorplans;
  } catch (error) {
    console.error("Inisialisasi floorplan gagal:", error);
    throw error;
  }
}

// Fungsi untuk memeriksa apakah titik berada di dalam poligon
function pointInPolygon(point, polygon) {
  let x = point.x,
    y = point.y;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    let xi = polygon[i].x_px,
      yi = polygon[i].y_px;
    let xj = polygon[j].x_px,
      yj = polygon[j].y_px;
    let intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  // console.log(
  //   `Point (${x}, ${y}) checked against polygon: [${polygon
  //     .map((p) => `(${p.x_px}, ${p.y_px})`)
  //     .join(", ")}], Result: ${inside}`
  // );
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
        const result = pointInPolygon(point, polygon);
        console.log(`Restricted area check: ${result}`);
        return result;
      } catch (error) {
        console.error(
          `Error parsing area_shape for floorplan ${floorplanId}:`,
          error
        );
        return false;
      }
    }
    return false;
  });

  if (isInRestrictedArea) return false;

  // Periksa apakah ada area non-restrict dan apakah titik berada di dalamnya
  const hasNonRestrictAreas = maskedAreas.some(
    (area) => area.restricted_status === "non-restrict"
  );
  if (hasNonRestrictAreas) {
    const isInNonRestrictArea = maskedAreas.some((area) => {
      if (area.restricted_status === "non-restrict") {
        try {
          const polygon = JSON.parse(area.area_shape);
          const result = pointInPolygon(point, polygon);
          return result;
        } catch (error) {
          console.error(
            `Error parsing area_shape for floorplan ${floorplanId}:`,
            error
          );
          return false;
        }
      }
      return false;
    });
    return isInNonRestrictArea;
  }

  return true;
}

function setupRealtimeStream() {
  if (!client) {
    client = startMqttClient((topic, beacon) => {
      try {
        const { dmac, gmac, calcDist: calcDistStr, time } = beacon;
        const calc_dist = parseFloat(calcDistStr);
        const timestamp = new Date(time.replace(",", ".") + "Z").getTime();
        const floorplanId = gmacToFloorplan.get(gmac);

        if (!floorplanId) {
          console.error(`No floorplan found for GMAC: ${gmac}`);
          return;
        }

        if (!realtimeBeaconPairs.has(floorplanId)) {
          realtimeBeaconPairs.set(floorplanId, new Map());
        }
        const floorplanBeacons = realtimeBeaconPairs.get(floorplanId);

        if (!floorplanBeacons.has(dmac)) {
          floorplanBeacons.set(dmac, new Map());
        }
        const dmacData = floorplanBeacons.get(dmac);

        let closestTime = null;
        let minDiff = Infinity;
        for (let [t, distances] of dmacData) {
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

          // Filter posisi berdasarkan masked area
          const validPositions = positions.filter((pos) => {
            const { point, beaconId, floorplanId } = pos;
            if (!point) return false;
            const isValid = isPointValid(point, floorplanId);
            // console.log(
            //   `Position (${point.x}, ${point.y}) for beacon ${beaconId} is valid: ${isValid}`
            // );
            return isValid;
          });

          if (validPositions.length > 0) {
            client.publish(
              `${floorplanId}`,
              JSON.stringify(validPositions),
              { qos: 1 },
              (err) => {
                if (err) {
                  console.error(`Failed to publish to ${floorplanId}:`, err);
                }
              }
            );
          }
        }
      } catch (error) {
        console.error("Error processing beacon:", error, beacon);
      }
    });
  }

  if (interval) {
    clearInterval(interval);
  }

  interval = setInterval(async () => {
    const now = Date.now();

    for (const [floorplanId, floorplanBeacons] of realtimeBeaconPairs) {
      const floorplan = floorplans.get(floorplanId);
      if (floorplan) {
        const positions = generateBeaconPositions(
          floorplanId,
          floorplan.gateways,
          floorplan.scale
        );

        // Filter posisi untuk penyimpanan
        const validPositions = positions.filter((pos) => {
          const { point, beaconId, floorplanId } = pos;
          if (!point) return false;
          return isPointValid(point, floorplanId);
        });

        if (validPositions.length > 0) {
          await saveBeaconPositions(validPositions);
        }
      }

      // Bersihkan data lama
      for (const [dmac, timestamps] of floorplanBeacons) {
        for (const [t] of timestamps) {
          if (now - t > timeTolerance) {
            timestamps.delete(t);
          }
        }
        if (timestamps.size === 0) {
          floorplanBeacons.delete(dmac);
        }
      }
      if (floorplanBeacons.size === 0) {
        realtimeBeaconPairs.delete(floorplanId);
      }
    }
  }, 5000);

  // Tambahkan polling untuk memeriksa perubahan database
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
  refreshInterval = setInterval(async () => {
    try {
      await initializeAllFloorplans();
    } catch (error) {
      console.error("Failed to refresh database:", error);
    }
  }, 600000); // Periksa setiap 600 detik
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

  const ux = dx / length;
  const uy = dy / length;
  const lengthMeter = length * scale;

  const totalDist = firstDist + secondDist;
  if (totalDist === 0 || totalDist > lengthMeter) return null;

  const ratio = firstDist / totalDist;
  const distFromStart = ratio * lengthMeter;

  const baseX = start.x + ux * distFromStart;
  const baseY = start.y + uy * distFromStart;
  const perpX = -uy;
  const perpY = ux;

  const spreadLeft = 0.1;
  const spreadRight = 0.1;
  const spreadAlong = 0.1;
  const maxAttempts = 10;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const offsetPerp =
      Math.random() * (spreadRight + spreadLeft) -
      (spreadRight + spreadLeft) / 2;
    const offsetAlong = Math.random() * spreadAlong - spreadAlong / 2;

    const x = Math.round(baseX + perpX * offsetPerp + ux * offsetAlong);
    const y = Math.round(baseY + perpY * offsetPerp + uy * offsetAlong);

    const point = { x, y };

    if (isPointValid(point, floorplanId)) {
      return point;
    }
  }

  // console.log(
  //   `No valid point found after ${maxAttempts} attempts for floorplan ${floorplanId}`
  // );
  return null;
}

function generateBeaconPositions(floorplanId, gateways, scale) {
  const pairs = [];
  const floorplanBeacons = realtimeBeaconPairs.get(floorplanId) || new Map();

  for (let [dmac, timestamps] of floorplanBeacons) {
    for (let [time, distances] of timestamps) {
      const readerDistances = Array.from(gateways.keys())
        .map((gmac) => ({
          gmac,
          distance: distances[gmac] !== undefined ? distances[gmac] : Infinity,
        }))
        .sort((a, b) => a.distance - b.distance);

      const validReaders = readerDistances.filter(
        (r) =>
          r.distance !== Infinity && gmacToFloorplan.get(r.gmac) === floorplanId
      );

      if (validReaders.length >= 2) {
        const firstReader = validReaders[0].gmac;
        const secondReader = validReaders[1].gmac;
        const firstDist = validReaders[0].distance;
        const secondDist = validReaders[1].distance;

        const start = gateways.get(firstReader);
        const end = gateways.get(secondReader);
        const point = generateBeaconPointsBetweenReaders(
          start,
          end,
          firstDist,
          secondDist,
          scale,
          floorplanId
        );

        if (point) {
          pairs.push({
            beaconId: dmac,
            pair: `${firstReader}_${secondReader}`,
            first: firstReader,
            second: secondReader,
            firstDist: firstDist,
            secondDist: secondDist,
            point,
            firstReaderCoord: { id: firstReader, ...start },
            secondReaderCoord: { id: secondReader, ...end },
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
