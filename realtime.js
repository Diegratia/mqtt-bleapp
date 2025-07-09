// realtime.js
const { startMqttClient } = require("./mqtt");
const { fetchDynamicData } = require("./database");

let realtimeBeaconPairs = new Map();
const timeTolerance = 10000;
let client;

async function initializeRealtimeData(floorplanId) {
  try {
    const data = await fetchDynamicData(floorplanId);
    console.log(`Initialized data for FloorplanId: ${floorplanId}`, {
      gateways: [...data.gateways],
      scale: data.scale,
    });
    return data;
  } catch (error) {
    console.error("Failed to initialize realtime data:", error);
    throw error;
  }
}

function setupRealtimeStream(floorplanId) {
  if (!client) {
    client = startMqttClient((beacon) => {
      console.log("Received MQTT beacon:", beacon);
      const { dmac, gmac, calcDist: calcDistStr, time: timeStr } = beacon;
      const calc_dist = parseFloat(calcDistStr);
      const timestamp = new Date(timeStr.replace(",", ".")).getTime();

      // Bersihkan data lama
      for (let [dmacKey, timestamps] of realtimeBeaconPairs) {
        for (let [t, distances] of timestamps) {
          if (timestamp - t > timeTolerance) timestamps.delete(t);
        }
        if (timestamps.size === 0) realtimeBeaconPairs.delete(dmacKey);
      }

      if (!realtimeBeaconPairs.has(dmac))
        realtimeBeaconPairs.set(dmac, new Map());
      const dmacData = realtimeBeaconPairs.get(dmac);

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

      console.log("Updated realtimeBeaconPairs:", [...realtimeBeaconPairs]);
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

// function calculateDistanceInfo(start, end, scale) {
//   const deltaX = end.x - start.x;
//   const deltaY = end.y - start.y;
//   const jarakPixel = Math.hypot(deltaX, deltaY);
//   const jarakMeter = jarakPixel * scale;

//   return {
//     jarakPixel: +jarakPixel.toFixed(2),
//     jarakMeter: +jarakMeter.toFixed(2),
//   };
// }

function generateBeaconPositions(floorplanId, gateways, scale) {
  console.log("Generating beacon positions with:", {
    floorplanId,
    gateways: [...gateways],
    scale,
    beaconPairs: [...realtimeBeaconPairs],
  });

  const pairs = [];

  for (let [dmac, timestamps] of realtimeBeaconPairs) {
    for (let [time, distances] of timestamps) {
      console.log(`Processing beacon ${dmac} at time ${time}:`, distances);
      // Dapatkan semua reader dengan jarak
      const readerDistances = Array.from(gateways.keys())
        .map((gmac) => ({
          gmac,
          distance: distances[gmac] !== undefined ? distances[gmac] : Infinity,
        }))
        .sort((a, b) => a.distance - b.distance); // Urutkan berdasarkan jarak terdekat

      console.log(`Sorted reader distances for ${dmac}:`, readerDistances);

      // Ambil dua reader terdekat dengan jarak valid
      const validReaders = readerDistances.filter(
        (r) => r.distance !== Infinity
      );
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
        // const { jarakPixel, jarakMeter } = calculateDistanceInfo(
        //   start,
        //   end,
        //   scale
        // );

        pairs.push({
          beaconId: dmac,
          pair: `${firstReader}_${secondReader}`,
          first: firstReader,
          second: secondReader,
          firstDist: firstDist,
          secondDist: secondDist,
          // jarakPixel,
          // jarakMeter,
          point,
          firstReaderCoord: { id: firstReader, ...start },
          secondReaderCoord: { id: secondReader, ...end },
          time: new Date(time).toISOString(),
          floorplanId,
        });
      }
    }
  }

  console.log("Generated beacon positions:", pairs);
  return pairs;
}

module.exports = {
  setupRealtimeStream,
  generateBeaconPositions,
  initializeRealtimeData,
};
