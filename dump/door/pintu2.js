const { startMqttClient } = require("./mqtt");
const { fetchAllFloorplans } = require("./database");
const {
  saveBeaconPositions,
  saveAlarmTriggers,
  checkActiveAlarm,
} = require("./beaconStorage");

let realtimeBeaconPairs = new Map(); // floorplanId -> Map(dmac -> Map(timestamp -> { gmac: calcDist }))
const timeTolerance = 2000;
let client;
const floorplans = new Map(); // floorplanId -> { name, scale, gateways: Map(gmac -> { x, y }), maskedAreas: [], accessDoors: [] }
const gmacToFloorplans = new Map(); // gmac -> Set<floorplanId>
let interval;
let refreshInterval;
const maxSpeed = 0.6;
const lastBeaconState = new Map(); // dmac -> { x, y, timestamp, observationCount, positions, lastFloorplanId }
const observationWindow = 10;
const alarmCooldown = 10 * 60 * 1000;

async function initializeAllFloorplans() {
  try {
    const {
      floorplans: floorplanData,
      gateways,
      maskedAreas,
      accessDoors,
    } = await fetchAllFloorplans();
    floorplans.clear();
    gmacToFloorplans.clear();

    for (const { floorplan_id, name, scale } of floorplanData) {
      floorplans.set(floorplan_id, {
        name,
        scale,
        gateways: new Map(),
        maskedAreas: [],
        accessDoors: [], // Tetap simpan untuk potensi penggunaan di masa depan
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

    for (const {
      floorplan_id,
      area_shape,
      restricted_status,
      name,
    } of maskedAreas) {
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
            name,
          });
        }
      }
    }

    for (const { floorplan_id, pos_px_x, pos_px_y, door_id } of accessDoors) {
      if (floorplans.has(floorplan_id)) {
        floorplans.get(floorplan_id).accessDoors.push({
          door_id,
          x: Number(pos_px_x),
          y: Number(pos_px_y),
        });
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

function pointInPolygon(point, polygon) {
  const { x, y } = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x_px,
      yi = polygon[i].y_px;
    const xj = polygon[j].x_px,
      yj = polygon[j].y_px;

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-10) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}

function isPointValid(point, floorplanId) {
  const floorplan = floorplans.get(floorplanId);
  if (!floorplan) {
    console.warn(`Floorplan ${floorplanId} not found`);
    return false;
  }
  const { maskedAreas } = floorplan;

  if (maskedAreas.length === 0) {
    console.log(
      `No masked areas for ${floorplanId}, point ${point.x},${point.y} considered valid`
    );
    return true;
  }

  let isInsideAnyPolygon = false;
  for (const area of maskedAreas) {
    try {
      const polygon = JSON.parse(area.area_shape);
      const isInside = pointInPolygon(point, polygon);
      if (isInside) {
        isInsideAnyPolygon = true;
        console.log(
          `Point ${point.x},${point.y} inside polygon ${area.name} (${area.restricted_status}) in ${floorplanId}`
        );
        break;
      }
    } catch (error) {
      console.error(`Error parsing polygon for ${floorplanId}:`, error);
    }
  }
  return isInsideAnyPolygon;
}

function isInRestrictedArea(point, floorplanId) {
  const floorplan = floorplans.get(floorplanId);
  if (!floorplan) return false;

  return floorplan.maskedAreas.some((area) => {
    if (area.restricted_status === "restrict") {
      try {
        const polygon = JSON.parse(area.area_shape);
        const inside = pointInPolygon(point, polygon);
        console.log(
          `Point ${JSON.stringify(point)} in restrict area ${
            area.name
          }: ${inside}`
        );
        return inside;
      } catch {
        return false;
      }
    }
    return false;
  });
}

function isValidFloorplanTransition(dmac, position, lastFloorplanId) {
  const floorplanId = position.floorplanId;
  if (!lastFloorplanId || floorplanId === lastFloorplanId) {
    return true; // Tidak ada transisi atau floorplan sama
  }

  // Validasi berdasarkan gateway yang digunakan
  const gateways = [position.first, position.second];
  const valid = gateways.every((gmac) => {
    const floorplanIds = gmacToFloorplans.get(gmac) || new Set();
    return floorplanIds.has(floorplanId);
  });

  if (valid) {
    console.log(
      `Valid transition for beacon ${dmac} from ${lastFloorplanId} to ${floorplanId} based on gateways ${gateways.join(
        ", "
      )}`
    );
  } else {
    console.log(
      `Invalid transition for beacon ${dmac} from ${lastFloorplanId} to ${floorplanId}: gateways ${gateways.join(
        ", "
      )} not in target floorplan`
    );
  }
  return valid;
}

function determineBestFloorplan(dmac, positions) {
  const validPositions = positions.filter(
    (p) => p.point && isPointValid(p.point, p.floorplanId)
  );
  if (validPositions.length === 0) return null;

  const beaconState = lastBeaconState.get(dmac);
  const lastFloorplanId = beaconState ? beaconState.lastFloorplanId : null;

  // Filter posisi berdasarkan validasi gateway
  const validTransitionPositions = validPositions.filter((p) =>
    isValidFloorplanTransition(dmac, p, lastFloorplanId)
  );

  if (validTransitionPositions.length === 0) {
    console.log(`No valid floorplan transition for beacon ${dmac}`);
    return lastFloorplanId;
  }

  const floorplanStats = new Map();
  validTransitionPositions.forEach((p) => {
    if (!floorplanStats.has(p.floorplanId)) {
      floorplanStats.set(p.floorplanId, { count: 0, totalDist: 0 });
    }
    const stats = floorplanStats.get(p.floorplanId);
    stats.count++;
    stats.totalDist += p.firstDist + p.secondDist;
  });

  let bestFloorplanId = null;
  let maxScore = -Infinity;

  for (const [floorplanId, stats] of floorplanStats) {
    const avgDist = stats.totalDist / stats.count;
    const score = stats.count - avgDist * 0.001;

    if (score > maxScore) {
      maxScore = score;
      bestFloorplanId = floorplanId;
    }
  }

  console.log(`Best floorplan for beacon ${dmac}: ${bestFloorplanId}`);
  return bestFloorplanId;
}

async function handleAlarmTrigger(positions, floorplanId, timestamp) {
  if (!positions || positions.length === 0) return;

  const alarmPositions = positions.filter((p) =>
    isInRestrictedArea(p.point, floorplanId)
  );
  if (alarmPositions.length === 0) return;

  for (const pos of alarmPositions) {
    const { beaconId: dmac, maskedAreaName } = pos;
    const currentTime = timestamp;

    const activeAlarm = await checkActiveAlarm(dmac);
    if (
      !activeAlarm ||
      currentTime - new Date(activeAlarm.trigger_time).getTime() >=
        alarmCooldown
    ) {
      pos.is_active = true;
      await saveAlarmTriggers([pos]);

      client.publish(
        `alarm/topic`,
        JSON.stringify([
          {
            ...pos,
            floorplanName: floorplans.get(floorplanId)?.name,
            maskedAreaName,
          },
        ]),
        { qos: 1 }
      );

      console.log(
        `Alarm triggered for beacon ${dmac} on floorplan ${floorplanId}, area: ${
          maskedAreaName || "Unknown"
        }`
      );
    }
  }
}

function setupRealtimeStream() {
  if (!client) {
    client = startMqttClient((topic, message) => {
      try {
        const { dmac, gmac, calcDist: calcDistStr, time } = message;
        const calc_dist = parseFloat(calcDistStr);
        const timestamp = new Date(time.replace(",", ".") + "Z").getTime();
        const now = Date.now();

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
            lastFloorplanId: null,
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
            beaconState.lastFloorplanId = bestFloorplanId;
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
                const dt = (currentTime - last.timestamp) / 1000;

                const dist = Math.sqrt(dx * dx + dy * dy) * floorplan.scale;
                const speed = dist / dt;

                if (speed > maxSpeed) {
                  isValidSpeed = false;
                  console.log(
                    `Beacon ${dmac} in ${primaryFloorplanId} too fast: ${speed.toFixed(
                      2
                    )} m/s`
                  );
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
                }

                handleAlarmTrigger(
                  validPositions,
                  primaryFloorplanId,
                  currentTime
                );
              }
            }
          }
        }
      } catch (error) {
        console.error(
          "Error processing MQTT message:",
          error,
          buffer.toString()
        );
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

  if (
    firstDist < 0 ||
    secondDist < 0 ||
    firstDist > lengthMeter * 1.5 ||
    secondDist > lengthMeter * 1.5
  ) {
    return null;
  }

  const totalDist = firstDist + secondDist;
  if (totalDist === 0) return null;

  let ratio = firstDist / totalDist;
  let ratioRiyal = Math.max(0, Math.min(1, ratio));

  const distFromStartPx = ratioRiyal * lengthPx;
  if (distFromStartPx < 0 || distFromStartPx > lengthPx) return null;
  const baseX = start.x + ux * distFromStartPx;
  const baseY = start.y + uy * distFromStartPx;

  const x = Math.round(baseX);
  const y = Math.round(baseY);
  const point = { x, y };

  console.log(
    `[${floorplanId}] ${firstDist.toFixed(2)}m + ${secondDist.toFixed(
      2
    )}m = ${totalDist.toFixed(2)}m (Length ${lengthMeter.toFixed(
      2
    )}m) ➜ ratio ${ratioRiyal.toFixed(2)} → (${point.x}, ${point.y})`
  );

  return point;
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
          let maskedAreaName = null;
          const floorplan = floorplans.get(floorplanId);
          if (floorplan) {
            for (const area of floorplan.maskedAreas) {
              try {
                const polygon = JSON.parse(area.area_shape);
                if (pointInPolygon(point, polygon)) {
                  maskedAreaName = area.name;
                  console.log(
                    `Point ${JSON.stringify(
                      point
                    )} assigned area: ${maskedAreaName} (${
                      area.restricted_status
                    })`
                  );
                  break;
                }
              } catch {
                console.error(`Error parsing polygon for ${floorplanId}`);
              }
            }
          }
          pairs.push({
            beaconId: dmac,
            pair: `${first.gmac}_${second.gmac}`,
            first: first.gmac,
            second: second.gmac,
            firstDist: first.distance,
            secondDist: second.distance,
            point,
            inRestrictedArea,
            maskedAreaName,
            firstReaderCoord: { id: first.gmac, ...start },
            secondReaderCoord: { id: second.gmac, ...end },
            time: new Date(time).toISOString(),
            floorplanId,
            floorplanName: floorplans.get(floorplanId).name,
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
