const ntfyPublish = require("@cityssm/ntfy-publish").default;
const inside = require("point-in-polygon");
const { startMqttClient } = require("./mqtt");
const {
  fetchAllFloorplans,
  fetchAllCardsWithDmac,
  fetchAllVisitorBlacklistArea,
} = require("./database");
const {
  saveBeaconPositions,
  saveTrackingTransactions,
  saveAlarmTriggers,
  checkActiveAlarm,
} = require("./beaconStorage");

let realtimeBeaconPairs = new Map(); // floorplanId -> Map(dmac -> Map(timestamp -> { gmac: calcDist }))
const timeTolerance = 2500;
const cardCache = new Map(); // dmac -> cardData
const visitorBlacklistCache = new Map();
let client;
const floorplans = new Map(); // floorplanId -> { name, scale, gateways: Map(gmac -> { x, y }), maskedAreas: [] }
const gmacToFloorplans = new Map(); // gmac -> Set<floorplanId>
let interval;
let refreshInterval;
const maxSpeed = 1;
const lastBeaconState = new Map(); // dmac -> { x, y, timestamp, primaryFloorplanId }
const observationWindow = 10;
const alarmCooldown = 10 * 60 * 1000;

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

    for (const {
      floorplan_id,
      gmac,
      pos_px_x,
      pos_px_y,
      reader_id,
    } of gateways) {
      if (floorplans.has(floorplan_id)) {
        floorplans.get(floorplan_id).gateways.set(gmac, {
          x: Number(pos_px_x),
          y: Number(pos_px_y),
          readerId: reader_id,
        });

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
      area_id,
    } of maskedAreas) {
      if (floorplans.has(floorplan_id) && area_shape) {
        const polygonWithIds = JSON.parse(area_shape);

        if (!Array.isArray(polygonWithIds)) {
          console.warn(
            `Invalid area_shape for floorplan ${floorplan_id} (not array)`
          );
          continue;
        }

        const polygon = polygonWithIds.map(({ x_px, y_px }) => ({
          x_px,
          y_px,
        }));

        console.log(restricted_status);
        if (polygon.length >= 3) {
          floorplans.get(floorplan_id).maskedAreas.push({
            area_shape: JSON.stringify(polygon),
            parsed_shape: polygon,
            restricted_status,
            name,
            area_id,
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

async function sendTestNtfy() {
  try {
    const result = await ntfyPublish({
      server: "http://192.168.1.116:6099",
      topic: "tracking-ntfy",
      priority: "high",
      title: "Alarm Test",
      message: "Test Alarm Notification",
      // tags: ["warning", "computer"],
    });

    console.log("NTFY published:", result);
  } catch (error) {
    console.error("NTFY publish failed:", error.message);
  }
}

async function initializeBlacklistArea() {
  const blacklist = await fetchAllVisitorBlacklistArea();
  visitorBlacklistCache.clear();

  for (const row of blacklist) {
    const visitorId = row.visitor_id;
    const areaId = row.floorplan_masked_area_id;

    if (!visitorBlacklistCache.has(visitorId)) {
      visitorBlacklistCache.set(visitorId, new Set());
    }

    visitorBlacklistCache.get(visitorId).add(areaId);
  }

  console.log("Initialized blacklist area cache");
}

async function initializeCardCache() {
  try {
    const cards = await fetchAllCardsWithDmac();
    cardCache.clear();
    for (const card of cards) {
      if (card.dmac) {
        cardCache.set(card.dmac.toLowerCase(), card);
        console.log(card.dmac);
      }
    }
    console.log(`Initialized ${cardCache.size} cards`);
  } catch (error) {
    console.error("Gagal inisialisasi card cache:", error);
  }
}

// memeriksa apakah titik berada di dalam poligon
// function pointInPolygon(point, polygon) {
//   let x = point.x,
//     y = point.y,
//     inside = false;
//   for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
//     let xi = polygon[i].x_px,
//       yi = polygon[i].y_px;
//     let xj = polygon[j].x_px,
//       yj = polygon[j].y_px;
//     let intersect =
//       yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
//     if (intersect) inside = !inside;
//   }
//   return inside;
// }

// function pointInPolygon(point, polygon) {
//   const { x, y } = point;
//   let inside = false;

//   for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
//     const xi = polygon[i].x_px,
//       yi = polygon[i].y_px;
//     const xj = polygon[j].x_px,
//       yj = polygon[j].y_px;

//     const intersect =
//       yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-10) + xi;

//     if (intersect) inside = !inside;
//   }

//   return inside;
// }

// function pointInPolygon(point, polygon) {
//   const { x, y } = point;
//   let inside = false;

//   for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
//     const xi = polygon[i].x_px,
//       yi = polygon[i].y_px;
//     const xj = polygon[j].x_px,
//       yj = polygon[j].y_px;

//     if (
//       yi > y !== yj > y &&
//       x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-10) + xi
//     ) {
//       inside = !inside;
//     }
//   }

//   return inside;
// }

function pointInPolygon(point, polygon) {
  if (!point || !polygon || !Array.isArray(polygon)) return false;
  const convertedPolygon = polygon.map((p) => [p.x_px, p.y_px]);
  const convertedPoint = [point.x, point.y];
  return inside(convertedPoint, convertedPolygon);
}

function isPointValid(point, floorplanId) {
  const floorplan = floorplans.get(floorplanId);
  if (!floorplan) {
    console.warn(`Floorplan ${floorplanId} not found`);
    return false;
  }
  const { maskedAreas } = floorplan;

  if (maskedAreas.length === 0) return false;

  return maskedAreas.some((area) => {
    try {
      const polygon = area.parsed_shape;
      return pointInPolygon(point, polygon);
    } catch {
      return false;
    }
  });
}

function isInRestrictedArea(point, floorplanId) {
  const floorplan = floorplans.get(floorplanId);
  if (!floorplan) return false;

  return floorplan.maskedAreas.some((area) => {
    if (area.restricted_status === "restrict") {
      const polygon = area.parsed_shape;
      // if (!polygon || !Array.isArray(polygon)) return false;
      // const polygon = JSON.parse(area.area_shape);
      return pointInPolygon(point, polygon);
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
    const scale = floorplans.get(floorplanId)?.scale;
    const avgDistMeter = (stats.totalDist / stats.count) * scale;
    const score = stats.count - avgDistMeter * 0.01;

    // const avgDist = stats.totalDist / stats.count;
    // const score = stats.count - avgDist * 0.001;

    if (score > maxScore) {
      maxScore = score;
      bestFloorplanId = floorplanId;
    }
  }

  return bestFloorplanId;
}

fetch("http://192.168.1.116:6099/tracking-ntfy", {
  method: "POST", // PUT works too
  headers: {
    Click: "https://home.nest.com/",
    Attach: "https://nest.com/view/yAxkasd.jpg",
    Actions: "http, Open door, https://api.nest.com/open/yAxkasd, clear=true",
    Email: "phil@example.com",
  },
  body: `There's someone at the door. 🐶

Please check if it's a good boy or a hooman. 
Doggies have been known to ring the doorbell.`,
});

async function handleAlarmTrigger(positions, floorplanId, timestamp) {
  if (!positions || positions.length === 0) return;

  const floorplan = floorplans.get(floorplanId);
  if (!floorplan) return;

  const alarmPositions = [];

  for (const pos of positions) {
    const matchedArea = getMaskedAreaFromPoint(pos.point, floorplan);
    if (!matchedArea) continue;

    const { id: maskedAreaId, name: maskedAreaName } = matchedArea;

    const isRestricted = isInRestrictedArea(pos.point, floorplanId);

    const isBlacklistArea =
      pos.visitorCardId &&
      visitorBlacklistCache.has(pos.visitorCardId) &&
      visitorBlacklistCache.get(pos.visitorCardId).has(maskedAreaId);

    if (isRestricted || isBlacklistArea) {
      pos.inRestrictedArea = true;
      pos.maskedAreaId = maskedAreaId;
      pos.maskedAreaName = maskedAreaName;
      alarmPositions.push(pos);
      sendTestNtfy();
    }
  }

  if (alarmPositions.length === 0) return;

  for (const pos of alarmPositions) {
    const { beaconId: dmac } = pos;
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
            floorplanName: floorplan.name,
          },
        ]),
        { qos: 1 }
      );

      await sendTestNtfy();

      console.log(
        `Alarm triggered for beacon ${dmac} on floorplan ${floorplanId}`
      );
    }
  }
}

function setupRealtimeStream() {
  if (!client) {
    client = startMqttClient((topic, filteredBeacon) => {
      try {
        const { dmac, gmac, calcDist: calcDistStr, time } = filteredBeacon;

        // const card = cardCache.get(dmac.toLowerCase());
        // if (card) {
        //   filteredBeacon.cardId = card.id;
        //   filteredBeacon.cardNumber = card.card_number;
        //   // filteredBeacon.cardType = card.card_type;
        //   filteredBeacon.qrCode = card.qr_code;
        //   filteredBeacon.cardName = card.name;
        //   filteredBeacon.visitorcard = card.visitor_id;
        //   filteredBeacon.membercard = card.member_id;
        // }

        // proses jika hanya dmac cocok
        // if (!cardCache.has(dmac.toLowerCase())) return;

        const calc_dist = parseFloat(calcDistStr);
        const timestamp = new Date(time + "Z");

        const now = Date.now();
        // console.log(timestamp, now);

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
            if (Array.isArray(pos)) {
              positions.push(...pos.map((p) => ({ ...p, floorplanId })));
            }
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
            // const validPositions = positions.filter(
            //   (p) => p.floorplanId === primaryFloorplanId && p.point
            // );

            const validPositions = positions.filter(
              (p) =>
                p.floorplanId === primaryFloorplanId &&
                isPointValid(p.point, primaryFloorplanId)
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
                // const dt = Math.max((currentTime - last.timestamp) / 1000, 0.1);
                const rawDt = (currentTime - last.timestamp) / 1000;
                const dt = Math.max(rawDt, 0.2);

                const dist = Math.sqrt(dx * dx + dy * dy) * floorplan.scale;
                // const dt = Math.max(rawDt, dist / maxSpeed);
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

                handleAlarmTrigger(
                  validPositions,
                  primaryFloorplanId,
                  currentTime
                );
                // const alarmPositions = validPositions.filter((p) =>
                //   isInRestrictedArea(p.point, primaryFloorplanId)
                // );
                // if (alarmPositions.length > 0) {
                //   client.publish(
                //     `alarm/${primaryFloorplanId}`,
                //     JSON.stringify(alarmPositions),
                //     { qos: 1 }
                //   );
                // }
              } else {
                beaconState.timestamp = currentTime;
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
        if (!Array.isArray(positions)) return;
        // const valid = positions.filter((p) => p.point);
        // if (valid.length > 0) await saveBeaconPositions(valid);
        const valid = positions.filter((p) => p.point);
        if (valid.length > 0) await saveTrackingTransactions(valid);
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
  refreshInterval = setInterval(async () => {
    try {
      await initializeAllFloorplans();
      await initializeBlacklistArea();
      await initializeCardCache();
    } catch (err) {
      console.error("Error in refreshInterval:", err);
    }
  }, 120000);
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
  // if (
  //   firstDist < 0 ||
  //   secondDist < 0 ||
  //   firstDist > lengthMeter * 1.5 ||
  //   secondDist > lengthMeter * 1.5 ||
  //   totalDist === 0 ||
  //   isNaN(totalDist)
  // ) {
  //   return null;
  // }
  // if (Math.abs(firstDist - secondDist) > 2 * lengthMeter) return null;

  // if (totalDist === 0) return null;

  let ratio = firstDist / totalDist;
  let ratioRiyal = Math.max(0, Math.min(1, ratio));
  // console.log(firstDist, secondDist, ratio);

  const distFromStartPx = ratioRiyal * lengthPx;
  if (distFromStartPx < 0 || distFromStartPx > lengthPx) return null;
  const baseX = start.x + ux * distFromStartPx;
  const baseY = start.y + uy * distFromStartPx;
  const perpX = -uy;
  const perpY = ux;

  const spreadLeft = 2 / scale;
  const spreadRight = 2 / scale;
  const spreadAlong = 1 / scale;
  const maxAttempts = 20;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const offsetPerp =
      Math.random() * (spreadRight + spreadLeft) -
      (spreadRight + spreadLeft) / 2;
    const offsetAlong = Math.random() * spreadAlong - spreadAlong / 2;

    const x = baseX + perpX * offsetPerp + ux * offsetAlong;
    const y = baseY + perpY * offsetPerp + uy * offsetAlong;

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

function getMaskedAreaFromPoint(point, floorplan) {
  for (const area of floorplan.maskedAreas) {
    const polygon = area.parsed_shape;
    if (!polygon) continue;

    if (pointInPolygon(point, polygon)) {
      return {
        name: area.name,
        id: area.area_id,
      };
    }
  }
  console.warn(
    `Point ${point.x},${point.y} not in any area of ${floorplan.name}`
  );
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

        // if (!point) return;
        // if (!start || !end || !first || !second) return;
        // if (!isPointValid(point, floorplanId)) return;

        if (!point) continue;
        if (!start || !end || !first || !second) continue;
        if (!isPointValid(point, floorplanId)) continue;

        let maskedAreaName = null;
        let maskedAreaId = null;
        const floorplan = floorplans.get(floorplanId);
        if (floorplan) {
          const maskedArea = getMaskedAreaFromPoint(point, floorplan);
          if (maskedArea) {
            maskedAreaName = maskedArea.name;
            maskedAreaId = maskedArea.id;
          }
        }

        const card = cardCache.get(dmac.toLowerCase()) ?? {};

        if (point) {
          const inRestrictedArea = isInRestrictedArea(point, floorplanId);

          //cek kalau visitor ada di blacklistarea
          // if (
          //   card.visitor_id &&
          //   visitorBlacklistCache.has(card.visitor_id) &&
          //   visitorBlacklistCache.get(card.visitor_id).has(maskedAreaId)
          // ) {
          //   inRestrictedArea = true;
          // }

          // if (!maskedAreaName) {
          //   // console.warn(
          //   //   `Skipping pair, no masked area matched for dmac ${dmac}`
          //   // );
          //   return;
          // }

          if (
            floorplans.get(floorplanId).name === null ||
            floorplans.get(floorplanId).name === undefined
          ) {
            return;
          }
          const pushedData = {
            beaconId: dmac,
            pair: `${first.gmac}_${second.gmac}`,
            first: first.gmac,
            second: second.gmac,
            firstDist: first.distance,
            secondDist: second.distance,
            point,
            inRestrictedArea,
            firstReaderCoord: {
              id: first.gmac,
              readerId: start.readerId,
              ...start,
            },
            secondReaderCoord: {
              id: second.gmac,
              readerId: end.readerId,
              ...end,
            },
            firstReaderId: start.readerId,
            secondReaderId: end.readerId,
            time: new Date(time).toISOString(),
            floorplanId,
            floorplanName: floorplans.get(floorplanId).name,
            maskedAreaName,
            maskedAreaId,
            cardId: card.id ?? null,
            cardNumber: card.card_number ?? null,
            qrCode: card.qr_code ?? null,
            cardName: card.name ?? null,
            visitorCardId: card.visitor_id ?? null,
            memberCardId: card.member_id ?? null,
          };

          pairs.push(pushedData);
          // console.log("New pair pushed:", pushedData);
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
  initializeCardCache,
  initializeBlacklistArea,
};
