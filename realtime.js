const { startMqttClient } = require("./mqtt");

// Struktur untuk menyimpan data beacon real-time
let realtimeBeaconPairs = new Map();
const timeTolerance = 5000; // Toleransi waktu 5 detik (dalam milidetik)
let client;

const gateways = {
  "282C02227F53": { x: 50, y: 150 },
  "282C02227FDD": { x: 20, y: 100 },
  "282C02227F1A": { x: 40, y: 120 },
};

function setupRealtimeStream() {
  client = startMqttClient((beacon) => {
    const { dmac, gmac, calc_dist: calcDistStr, time: timeStr } = beacon;
    const timestamp = new Date(timeStr.replace(",", ".")).getTime(); // Ganti koma dengan titik untuk parsing Date
    const calcDist = parseFloat(calcDistStr.replace(",", ".")); // Ganti koma dengan titik untuk konversi float

    // Bersihkan data lama
    for (let [dmacKey, timestamps] of realtimeBeaconPairs) {
      for (let [t, distances] of timestamps) {
        if (timestamp - t > timeTolerance) timestamps.delete(t);
      }
      if (timestamps.size === 0) realtimeBeaconPairs.delete(dmacKey);
    }

    // Tambahkan data baru
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

function generateBeaconPointsBetweenReaders(start, end, firstDist, secondDist) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length === 0) return null;

  const ux = dx / length;
  const uy = dy / length;
  const lengthMeter = length * 1; // Skala default

  const totalDist = firstDist + secondDist;
  if (totalDist === 0) return null;
  const ratio = firstDist / totalDist;
  const distFromStart = ratio * lengthMeter;

  const baseX = start.x + ux * distFromStart;
  const baseY = start.y + uy * distFromStart;
  const perpX = -uy;
  const perpY = ux;

  const offsetPerp = Math.random() * (3 + 3) - (3 + 3) / 2; // spreadLeft + spreadRight
  const offsetAlong = Math.random() * 3 - 3 / 2; // spreadAlong

  const x = Math.round(baseX + perpX * offsetPerp + ux * offsetAlong);
  const y = Math.round(baseY + perpY * offsetPerp + uy * offsetAlong);

  return { x, y };
}

function calculateDistanceInfo(start, end) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const jarakPixel = Math.hypot(deltaX, deltaY);
  const jarakMeter = jarakPixel * 1; // Skala default

  return {
    jarakPixel: +jarakPixel.toFixed(2),
    jarakMeter: +jarakMeter.toFixed(2),
  };
}

function generateBeaconPositions() {
  const pairs = [];
  const gatewayPairs = [
    ["282C02227F53", "282C02227FDD"],
    ["282C02227FDD", "282C02227F1A"],
    ["282C02227F1A", "282C02227F53"],
  ];

  for (let [dmac, timestamps] of realtimeBeaconPairs) {
    for (let [time, distances] of timestamps) {
      gatewayPairs.forEach(([firstReader, secondReader]) => {
        if (distances[firstReader] && distances[secondReader]) {
          const start = gateways[firstReader];
          const end = gateways[secondReader];
          const point = generateBeaconPointsBetweenReaders(
            start,
            end,
            distances[firstReader],
            distances[secondReader]
          );
          const { jarakPixel, jarakMeter } = calculateDistanceInfo(start, end);

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
            firstReaderCoord: { id: firstReader, ...gateways[firstReader] },
            secondReaderCoord: { id: secondReader, ...gateways[secondReader] },
            time: new Date(time).toISOString(),
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
};
