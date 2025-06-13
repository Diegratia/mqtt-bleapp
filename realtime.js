const { startMqttClient } = require("./mqtt");
const { fetchAllFloorplans } = require("./database");

let realtimeBeaconPairs = new Map(); // floorplanId -> Map(dmac -> Map(timestamp -> distances))
const timeTolerance = 10000; // 10 detik
let client;
const floorplans = new Map(); // floorplanId -> { name, scale, gateways: Map(gmac -> { x, y }), maskedAreas: [] }
const gmacToFloorplan = new Map(); // gmac -> floorplanId

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
      if (
        floorplans.has(floorplan_id) &&
        gmac &&
        pos_px_x != null &&
        pos_px_y != null
      ) {
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
        floorplans
          .get(floorplan_id)
          .maskedAreas.push({ area_shape, restricted_status });
      }
    }

    console.log("Initialized floorplans:", {
      floorplans: [...floorplans.keys()],
      gmacToFloorplan: [...gmacToFloorplan],
      maskedAreas: [...floorplans.entries()].map(([id, data]) => ({
        floorplan_id: id,
        maskedAreas: data.maskedAreas,
      })),
    });

    return floorplans;
  } catch (error) {
    console.error("Failed to initialize floorplans:", error);
    throw error;
  }
}

function setupRealtimeStream() {
  if (!client) {
    client = startMqttClient((topic, beacon) => {
      console.log(`Received MQTT beacon on topic ${topic}:`, beacon);
      try {
        if (!beacon || typeof beacon !== "object") {
          console.error(
            "Invalid beacon: beacon is undefined or not an object",
            { topic, beacon }
          );
          return;
        }

        const { dmac, gmac, calcDist, time } = beacon;
        if (!dmac || !gmac || calcDist == null || !time) {
          console.error("Invalid beacon: missing required properties", {
            beacon,
          });
          return;
        }

        const calc_dist = Number(calcDist);
        if (isNaN(calc_dist)) {
          console.error("Invalid calcDist: not a valid number", { calcDist });
          return;
        }

        const timestamp = new Date(time.replace(",", ".")).getTime();
        if (isNaN(timestamp)) {
          console.error("Invalid timestamp:", time);
          return;
        }

        const floorplanId = gmacToFloorplan.get(gmac);
        if (!floorplanId) {
          console.error(`No floorplan found for GMAC: ${gmac}`);
          return;
        }

        if (!realtimeBeaconPairs.has(floorplanId)) {
          realtimeBeaconPairs.set(floorplanId, new Map());
        }
        const floorplanBeacons = realtimeBeaconPairs.get(floorplanId);

        const now = Date.now();
        for (let [dmacKey, timestamps] of floorplanBeacons) {
          for (let [t, distances] of timestamps) {
            if (now - t > timeTolerance) timestamps.delete(t);
          }
          if (timestamps.size === 0) floorplanBeacons.delete(dmacKey);
        }

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

        console.log(
          `Updated realtimeBeaconPairs for floorplan ${floorplanId}:`,
          [...floorplanBeacons]
        );

        const floorplan = floorplans.get(floorplanId);
        if (floorplan) {
          const positions = generateBeaconPositions(
            floorplanId,
            floorplan.gateways,
            floorplan.scale
          );
          if (positions.length > 0) {
            client.publish(
              `beacon/output/${floorplanId}`,
              JSON.stringify(positions),
              { qos: 1 },
              (err) => {
                if (err) {
                  console.error(
                    `Failed to publish to beacon/output/${floorplanId}:`,
                    err
                  );
                } else {
                  console.log(
                    `Published positions to beacon/output/${floorplanId}:`,
                    positions
                  );
                }
              }
            );
          } else {
            console.log(`No positions generated for floorplan ${floorplanId}`);
          }
        }
      } catch (error) {
        console.error("Error processing MQTT beacon:", error, beacon);
      }
    });
  }
}

function generateBeaconPointsBetweenReaders(
  start,
  end,
  firstDist,
  secondDist,
  scale
) {
  if (
    !start ||
    !end ||
    firstDist == null ||
    secondDist == null ||
    isNaN(firstDist) ||
    isNaN(secondDist)
  ) {
    console.log("Invalid inputs for generateBeaconPointsBetweenReaders:", {
      start,
      end,
      firstDist,
      secondDist,
      scale,
    });
    return null;
  }

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

  const spreadLeft = 1;
  const spreadRight = 1;
  const spreadAlong = 1;
  const offsetPerp =
    Math.random() * (spreadRight + spreadLeft) - (spreadRight + spreadLeft) / 2;
  const offsetAlong = Math.random() * spreadAlong - spreadAlong / 2;

  const x = Math.round(baseX + perpX * offsetPerp + ux * offsetAlong);
  const y = Math.round(baseY + perpY * offsetPerp + uy * offsetAlong);

  return { x, y };
}

function generateBeaconPositions(floorplanId, gateways, scale) {
  console.log("Generating beacon positions with:", {
    floorplanId,
    gateways: [...gateways],
    scale,
    beaconPairs: realtimeBeaconPairs.get(floorplanId) || new Map(),
  });

  const pairs = [];
  const floorplanBeacons = realtimeBeaconPairs.get(floorplanId) || new Map();

  const now = Date.now();
  for (let [dmac, timestamps] of floorplanBeacons) {
    for (let [t, distances] of timestamps) {
      if (now - t > timeTolerance) timestamps.delete(t);
    }
    if (timestamps.size === 0) floorplanBeacons.delete(dmac);
  }

  for (let [dmac, timestamps] of floorplanBeacons) {
    for (let [time, distances] of timestamps) {
      console.log(`Processing beacon ${dmac} at time ${time}:`, distances);
      const readerDistances = Array.from(gateways.keys())
        .map((gmac) => ({
          gmac,
          distance: distances[gmac] !== undefined ? distances[gmac] : Infinity,
        }))
        .sort((a, b) => a.distance - b.distance);

      console.log(`Sorted reader distances for ${dmac}:`, readerDistances);

      const validReaders = readerDistances.filter(
        (r) => r.distance !== Infinity
      );
      console.log(`Valid readers for ${dmac}:`, validReaders);
      if (validReaders.length >= 2) {
        const firstReader = validReaders[0].gmac;
        const secondReader = validReaders[1].gmac;
        const firstDist = validReaders[0].distance;
        const secondDist = validReaders[1].distance;

        console.log(`Pairing closest readers: ${firstReader}, ${secondReader}`);

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
          point: point || { x: null, y: null },
          firstReaderCoord: { id: firstReader, ...start },
          secondReaderCoord: { id: secondReader, ...end },
          time: new Date(time).toISOString(),
          floorplanId,
        });
      } else {
        console.log(
          `Insufficient valid readers for ${dmac}: ${validReaders.length}`
        );
      }
    }
  }

  console.log("Generated beacon positions:", pairs);
  return pairs;
}

module.exports = {
  setupRealtimeStream,
  generateBeaconPositions,
  initializeAllFloorplans,
};
