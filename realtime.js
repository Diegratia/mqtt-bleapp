const { startMqttClient } = require("./mqtt");
const { fetchAllFloorplans } = require("./database");

let realtimeBeaconPairs = new Map();
const timeTolerance = 2000;
let client;
const floorplans = new Map();
const gmacToFloorplan = new Map();
let interval;

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
      floorplans
        .get(floorplan_id)
        .gateways.set(gmac, { x: Number(pos_px_x), y: Number(pos_px_y) });
      if (!gmacToFloorplan.has(gmac)) {
        gmacToFloorplan.set(gmac, floorplan_id);
      }
      // else if (gmacToFloorplan.get(gmac) !== floorplan_id) {
      //   console.error(`GMAC ${gmac} associated with multiple floorplans`);
      // }
    }

    for (const { floorplan_id, area_shape, restricted_status } of maskedAreas) {
      if (floorplans.has(floorplan_id) && area_shape) {
        floorplans
          .get(floorplan_id)
          .maskedAreas.push({ area_shape, restricted_status });
      }
    }

    return floorplans;
  } catch (error) {
    console.error("inisialisasi floorplan gagal:", error);
    throw error;
  }
}

function setupStream() {
  if (!client) {
    client = startMqttClient((topic, beacon) => {
      try {
        const { dmac, gmac, calcDist, time } = beacon;
        const calc_dist = parseFloat(calcDist);
        const timestamp = new Date(time.replace(",", ".")).getTime();
        const floorplanId = gmacToFloorplan.get(gmac);
        if (!floorplanId) {
          console.error(`floorplan ot found ${gmac}`);
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
        // interval = setInterval(() => {
        //   for (const [floorplanId, floorplanBeacons] of realtimeBeaconPairs) {
        //     const floorplan = floorplans.get(floorplanId);
        //     if (floorplan) {
        //       const positions = generateBeaconPositions(floorplanId, floorplan.gateways, floorplan.scale);
        //       if (positions.length > 0) {
        //         client.publish(`${floorplanId}`, JSON.stringify(positions), { qos: 1 }, ...);
        //       }
        //     }
        //   }
        // }, 5000);
        const floorplan = floorplans.get(floorplanId);
        if (floorplan) {
          const positions = generateBeaconPositions(
            floorplanId,
            floorplan.gateways,
            floorplan.scale
          );
          if (positions.length > 0) {
            client.publish(
              `${floorplanId}`.toUpperCase(),
              JSON.stringify(positions),
              { qos: 1 },
              (err) => {
                if (err) {
                  console.error(`publish fail`, err);
                } else {
                  // console.log(
                  //   `Published positions to ${floorplanId}:`,
                  //   positions
                  // );
                }
              }
            );
          } else {
            // console.log(`No positions generated for floorplan ${floorplanId}`);
          }
        }
      } catch (error) {
        console.error(error, beacon);
      }
    });
  }

  if (interval) {
    clearInterval(interval);
  }

  interval = setInterval(() => {
    const now = Date.now();
    // const timestamp = new Date(time.replace(",", ".")).getTime();
    for (const [floorplanId, floorplanBeacons] of realtimeBeaconPairs) {
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
  }, timeTolerance);
}

function generateBeaconPointsBetweenReaders(
  start,
  end,
  firstDist,
  secondDist,
  scale
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length === 0) return null;

  const ux = dx / length;
  const uy = dy / length;
  const lengthMeter = length * scale;

  const totalDist = firstDist + secondDist;
  if (totalDist === 0) return null;
  const ratio = firstDist / totalDist;
  const distFromStart = ratio * lengthMeter;

  const baseX = start.x + ux * distFromStart;
  const baseY = start.y + uy * distFromStart;
  const perpX = -uy;
  const perpY = ux;

  const spreadLeft = 10;
  const spreadRight = 10;
  const spreadAlong = 10;
  const offsetPerp =
    Math.random() * (spreadRight + spreadLeft) - (spreadRight + spreadLeft) / 2;
  const offsetAlong = Math.random() * spreadAlong - spreadAlong / 2;

  const x = Math.round(baseX + perpX * offsetPerp + ux * offsetAlong);
  const y = Math.round(baseY + perpY * offsetPerp + uy * offsetAlong);

  return { x, y };
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
        (r) => r.distance !== Infinity
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
          scale
        );

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

  return pairs;
}

module.exports = {
  setupStream,
  generateBeaconPositions,
  initializeAllFloorplans,
};
