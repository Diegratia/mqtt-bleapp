// const { startMqttClient } = require("./mqtt");

// // Struktur untuk menyimpan data beacon real-time
// let realtimeBeaconPairs = new Map();
// const timeTolerance = 300000; // Toleransi waktu 5 menit (300000 ms)
// let client;

// const scale = 1;
// const spreadLeft = 3;
// const spreadRight = 3;
// const spreadAlong = 3;

// const gateways = {
//   "4CA38F691898": { x: 50, y: 150 },
//   "4CA38F691FBC": { x: 20, y: 100 },
//   "4CA38F6918C4": { x: 40, y: 120 },
// };

// function setupRealtimeStream() {
//   client = startMqttClient((beacon) => {
//     const { dmac, gmac, calc_dist: calcDist, time: timeStr } = beacon;
//     const timestamp = new Date(timeStr.replace(",", ".")).getTime(); // Konversi string waktu ke timestamp

//     // Bersihkan data lama
//     for (let [dmacKey, timestamps] of realtimeBeaconPairs) {
//       for (let [t, distances] of timestamps) {
//         if (timestamp - t > timeTolerance) timestamps.delete(t);
//       }
//       if (timestamps.size === 0) realtimeBeaconPairs.delete(dmacKey);
//     }

//     // Tambahkan data baru
//     if (!realtimeBeaconPairs.has(dmac))
//       realtimeBeaconPairs.set(dmac, new Map());
//     const dmacData = realtimeBeaconPairs.get(dmac);

//     let closestTime = null;
//     let minDiff = Infinity;
//     for (let [t, distances] of dmacData) {
//       const diff = Math.abs(timestamp - t);
//       if (diff < minDiff && diff <= timeTolerance) {
//         minDiff = diff;
//         closestTime = t;
//       }
//     }

//     if (!closestTime) closestTime = timestamp;
//     if (!dmacData.has(closestTime)) dmacData.set(closestTime, {});
//     dmacData.get(closestTime)[gmac] = calcDist; // Gunakan calcDist langsung sebagai float
//   });
// }

// function generateBeaconPointsBetweenReaders(start, end, firstDist, secondDist) {
//   const dx = end.x - start.x;
//   const dy = end.y - start.y;
//   const length = Math.sqrt(dx * dx + dy * dy);
//   if (length === 0) return null;

//   const ux = dx / length;
//   const uy = dy / length;
//   const lengthMeter = length * scale;

//   const totalDist = firstDist + secondDist;
//   if (totalDist === 0) return null;
//   const ratio = firstDist / totalDist;
//   const distFromStart = ratio * lengthMeter;

//   const baseX = start.x + ux * distFromStart;
//   const baseY = start.y + uy * distFromStart;
//   const perpX = -uy;
//   const perpY = ux;

//   const offsetPerp =
//     Math.random() * (spreadRight + spreadLeft) - (spreadRight + spreadLeft) / 2;
//   const offsetAlong = Math.random() * spreadAlong - spreadAlong / 2;

//   const x = Math.round(baseX + perpX * offsetPerp + ux * offsetAlong);
//   const y = Math.round(baseY + perpY * offsetPerp + uy * offsetAlong);

//   return { x, y };
// }

// function calculateDistanceInfo(start, end) {
//   const deltaX = end.x - start.x;
//   const deltaY = end.y - start.y;
//   const jarakPixel = Math.hypot(deltaX, deltaY);
//   const jarakMeter = jarakPixel * scale;

//   return {
//     jarakPixel: +jarakPixel.toFixed(2),
//     jarakMeter: +jarakMeter.toFixed(2),
//   };
// }

// function generateBeaconPositions() {
//   const pairs = [];
//   const gatewayPairs = [
//     ["4CA38F691898", "4CA38F691FBC"],
//     ["4CA38F691FBC", "4CA38F6918C4"],
//     ["4CA38F6918C4", "4CA38F691898"],
//   ];

//   for (let [dmac, timestamps] of realtimeBeaconPairs) {
//     for (let [time, distances] of timestamps) {
//       gatewayPairs.forEach(([firstReader, secondReader]) => {
//         if (distances[firstReader] && distances[secondReader]) {
//           const start = gateways[firstReader];
//           const end = gateways[secondReader];
//           const point = generateBeaconPointsBetweenReaders(
//             start,
//             end,
//             distances[firstReader],
//             distances[secondReader]
//           );
//           const { jarakPixel, jarakMeter } = calculateDistanceInfo(start, end);

//           pairs.push({
//             beaconId: dmac,
//             pair: `${firstReader}_${secondReader}`,
//             first: firstReader,
//             second: secondReader,
//             firstDist: distances[firstReader],
//             secondDist: distances[secondReader],
//             jarakPixel,
//             jarakMeter,
//             point,
//             firstReaderCoord: { id: firstReader, ...gateways[firstReader] },
//             secondReaderCoord: { id: secondReader, ...gateways[secondReader] },
//             time: new Date(time).toISOString(),
//           });
//         }
//       });
//     }
//   }

//   return pairs;
// }

// module.exports = {
//   setupRealtimeStream,
//   generateBeaconPositions,
// };

// realtime.js
const { startMqttClient } = require("./mqtt");
const { fetchDynamicData } = require("./database");

let realtimeBeaconPairs = new Map();
const timeTolerance = 300000;
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
  client = startMqttClient((beacon) => {
    const { dmac, gmac, calc_dist: calcDist, time: timeStr } = beacon;
    const timestamp = new Date(timeStr.replace(",", ".")).getTime();

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
    dmacData.get(closestTime)[gmac] = calcDist;
  });
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

  const spreadLeft = 3;
  const spreadRight = 3;
  const spreadAlong = 3;
  const offsetPerp =
    Math.random() * (spreadRight + spreadLeft) - (spreadRight + spreadLeft) / 2;
  const offsetAlong = Math.random() * spreadAlong - spreadAlong / 2;

  const x = Math.round(baseX + perpX * offsetPerp + ux * offsetAlong);
  const y = Math.round(baseY + perpY * offsetPerp + uy * offsetAlong);

  return { x, y };
}

function calculateDistanceInfo(start, end, scale) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const jarakPixel = Math.hypot(deltaX, deltaY);
  const jarakMeter = jarakPixel * scale;

  return {
    jarakPixel: +jarakPixel.toFixed(2),
    jarakMeter: +jarakMeter.toFixed(2),
  };
}

function generateBeaconPositions(floorplanId, gateways, scale) {
  const pairs = [];
  const gatewayPairs = [
    ...Array.from(gateways.keys()).flatMap((g1, i) =>
      Array.from(gateways.keys())
        .slice(i + 1)
        .map((g2) => [g1, g2])
    ),
  ];

  for (let [dmac, timestamps] of realtimeBeaconPairs) {
    for (let [time, distances] of timestamps) {
      gatewayPairs.forEach(([firstReader, secondReader]) => {
        if (distances[firstReader] && distances[secondReader]) {
          const start = gateways.get(firstReader);
          const end = gateways.get(secondReader);
          const point = generateBeaconPointsBetweenReaders(
            start,
            end,
            distances[firstReader],
            distances[secondReader],
            scale
          );
          const { jarakPixel, jarakMeter } = calculateDistanceInfo(
            start,
            end,
            scale
          );

          pairs.push({
            beaconId: dmac,
            pair: `${firstReader}_${secondReader}`,
            first: firstReader,
            second: secondReader,
            firstDist: distances[firstReader],
            secondDist: distances[secondReader],
            jarakPixel,
            jarakMeter,
            point,
            firstReaderCoord: { id: firstReader, ...start },
            secondReaderCoord: { id: secondReader, ...end },
            time: new Date(time).toISOString(),
            floorplanId,
          });
        }
      });
    }
  }

  return pairs;
}

module.exports = {
  setupRealtimeStream,
  generateBeaconPositions,
  initializeRealtimeData,
};
