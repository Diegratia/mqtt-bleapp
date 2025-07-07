const { startMqttClient } = require("./mqtt");
const { fetchAllFloorplans } = require("./database");
const { saveBeaconPositions } = require("./beaconStorage");

let realtimeBeaconPairs = new Map(); // floorplanId -> Map(dmac -> Map(timestamp -> { gmac: calcDist }))
const timeTolerance = 4000;
let client;
const floorplans = new Map(); // floorplanId -> { name, scale, gateways: Map(gmac -> { x, y }), maskedAreas: [] }
const gmacToFloorplans = new Map(); // gmac -> Set<floorplanId>
let interval;
let refreshInterval;
const maxSpeed = 1;
const lastBeaconState = new Map(); // dmac -> { x, y, timestamp, primaryFloorplanId }
const observationWindow = 10;

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
        console.log(restricted_status);
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

// memeriksa apakah titik berada di dalam poligon
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

//memeriksa apakah titik valid berdasarkan maskedAreas
function isPointValid(point, floorplanId) {
  const floorplan = floorplans.get(floorplanId);
  if (!floorplan) return false;
  const { maskedAreas } = floorplan;
  // const isInRestrictedArea = maskedAreas.some((area) => {
  //   if (area.restricted_status === "restrict") {
  //     try {
  //       const polygon = JSON.parse(area.area_shape);
  //       return pointInPolygon(point, polygon);
  //     } catch {
  //       return false;
  //     }
  //   }
  //   return false;
  // });
  // if (isInRestrictedArea) return false;

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

function isInRestrictedArea(point, floorplanId) {
  const floorplan = floorplans.get(floorplanId);
  if (!floorplan) return false;

  return floorplan.maskedAreas.some((area) => {
    if (area.restricted_status === "restrict") {
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

function determineBestFloorplan(dmac, positions) {
  const validPositions = positions.filter(
    (p) => p.point && isPointValid(p.point, p.floorplanId)
  );
  if (validPositions.length === 0) return null;

  // pilih fp dengan jumlah posisi terbanyak atau rata-rata jarak terkecil
  const floorplanStats = new Map();
  validPositions.forEach((p) => {
    if (!floorplanStats.has(p.floorplanId)) {
      floorplanStats.set(p.floorplanId, { count: 0, totalDist: 0 });
    }
    const stats = floorplanStats.get(p.floorplanId);
    stats.count++;
    // aproksimasi jarak
    stats.totalDist += p.firstDist + p.secondDist;
  });

  // let bestFloorplanId = null;
  // let maxCount = -1;
  // let minAvgDist = Infinity;
  let bestFloorplanId = null;
  let maxScore = -Infinity;

  for (const [floorplanId, stats] of floorplanStats) {
    const avgDist = stats.totalDist / stats.count;
    const score = stats.count - avgDist * 0.01;

    if (score > maxScore) {
      maxScore = score;
      bestFloorplanId = floorplanId;
    }
  }

  return bestFloorplanId;
}

function setupRealtimeStream() {
  if (!client) {
    client = startMqttClient((topic, filteredBeacon) => {
      try {
        const { dmac, gmac, calcDist: calcDistStr, time } = filteredBeacon;
        const calc_dist = parseFloat(calcDistStr);
        const timestamp = new Date(time.replace(",", ".") + "Z").getTime();
        const floorplanIds = Array.from(gmacToFloorplans.get(gmac) || []);
        if (!floorplanIds.length) return;

        let beaconState = lastBeaconState.get(dmac);
        if (!beaconState) {
          beaconState = {
            x: null,
            y: null,
            timestamp: null,
            observationCount: 0,
            positions: [],
          };
          lastBeaconState.set(dmac, beaconState);
        }

        const positions = [];
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
            const pos = generateBeaconPositions(
              floorplanId,
              floorplan.gateways,
              floorplan.scale
            );
            positions.push(...pos.map((p) => ({ ...p, floorplanId })));
          }
        }

        beaconState.observationCount++;
        beaconState.positions.push(...positions);

        if (beaconState.observationCount >= observationWindow) {
          const bestFloorplanId = determineBestFloorplan(
            dmac,
            beaconState.positions
          );
          if (
            bestFloorplanId &&
            bestFloorplanId !== beaconState.primaryFloorplanId
          ) {
            beaconState.primaryFloorplanId = bestFloorplanId;
          }
          beaconState.positions = positions.slice(-observationWindow);
        }

        const primaryFloorplanId = beaconState.primaryFloorplanId;
        if (primaryFloorplanId) {
          const floorplan = floorplans.get(primaryFloorplanId);
          if (floorplan) {
            const validPositions = positions.filter(
              (p) => p.floorplanId === primaryFloorplanId && p.point
            );

            const latestPos = validPositions[0];

            if (latestPos) {
              const currentTime = timestamp;
              const last = {
                x: beaconState.x,
                y: beaconState.y,
                timestamp: beaconState.timestamp,
              };

              let isValidSpeed = true;
              if (last.x !== null && last.y !== null) {
                const dx = latestPos.point.x - last.x;
                const dy = latestPos.point.y - last.y;
                // const rawDt = (currentTime - last.timestamp) / 1000;
                // const dt = Math.max(rawDt, 0.1);
                const dt = (currentTime - last.timestamp) / 1000;

                const dist = Math.sqrt(dx * dx + dy * dy) * floorplan.scale;
                const speed = dist / dt;

                if (speed > maxSpeed) {
                  isValidSpeed = false;
                  // console.log(
                  //   `Beacon ${dmac} ${primaryFloorplanId} terlalu cepat: ${speed.toFixed(
                  //     2
                  //   )} m/s`
                  // );
                }
              }

              if (isValidSpeed) {
                beaconState.x = latestPos.point.x;
                beaconState.y = latestPos.point.y;
                beaconState.timestamp = currentTime;

                if (validPositions.length > 0) {
                  client.publish(
                    `tracking/${primaryFloorplanId}`,
                    JSON.stringify(validPositions),
                    { qos: 1 }
                  );
                  // console.log("validPositions", validPositions);
                }
                // Publish ke topik alarm jika ada beacon di area restrict
                const alarmPositions = validPositions.filter((p) =>
                  isInRestrictedArea(p.point, primaryFloorplanId)
                );
                if (alarmPositions.length > 0) {
                  client.publish(
                    `alarm/${primaryFloorplanId}`,
                    JSON.stringify(alarmPositions),
                    { qos: 1 }
                  );
                }
              } else {
                return;
              }
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
        const valid = positions.filter((p) => p.point);
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
  const lengthPx = Math.sqrt(dx * dx + dy * dy);
  if (lengthPx === 0) return null;

  const ux = dx / lengthPx,
    uy = dy / lengthPx;
  const lengthMeter = lengthPx * scale;

  const totalDist = firstDist + secondDist;
  // console.log(firstDist, secondDist, totalDist);
  if (totalDist === 0 || totalDist > lengthMeter * 2.0) return null;
  // if (Math.abs(firstDist - secondDist) > 2 * lengthMeter) return null;

  // if (totalDist === 0) return null;

  let ratio = firstDist / totalDist;
  let ratioRiyal = Math.max(0.1, Math.min(0.9, ratio));
  // console.log(firstDist, secondDist, ratio);

  const distFromStartPx = ratioRiyal * lengthPx;
  if (distFromStartPx < 0 || distFromStartPx > lengthPx) return null;
  const baseX = start.x + ux * distFromStartPx;
  const baseY = start.y + uy * distFromStartPx;
  const perpX = -uy;
  const perpY = ux;

  const spreadLeft = 0.5;
  const spreadRight = 0.5;
  const spreadAlong = 0.5;
  const maxAttempts = 10;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const offsetPerp =
      Math.random() * (spreadRight + spreadLeft) -
      (spreadRight + spreadLeft) / 2;
    const offsetAlong = Math.random() * spreadAlong - spreadAlong / 2;

    const x = Math.round(baseX + perpX * offsetPerp + ux * offsetAlong);
    const y = Math.round(baseY + perpY * offsetPerp + uy * offsetAlong);

    const point = { x, y };
    // console.log(
    //   `[${floorplanId}] ${firstDist.toFixed(2)}m + ${secondDist.toFixed(
    //     2
    //   )}m = ${totalDist.toFixed(2)}m (Length ${lengthMeter.toFixed(
    //     2
    //   )}m) ➜ ratio ${ratioRiyal.toFixed(2)} → (${point.x}, ${point.y})`
    // );

    return point;
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
          const inRestrictedArea = isInRestrictedArea(point, floorplanId);
          pairs.push({
            beaconId: dmac,
            pair: `${first.gmac}_${second.gmac}`,
            first: first.gmac,
            second: second.gmac,
            firstDist: first.distance,
            secondDist: second.distance,
            point,
            inRestrictedArea,
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
