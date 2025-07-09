const express = require("express");
const cors = require("cors");
const app = express();
const port = 3030; // Port berbeda dari index.js (3000) untuk menghindari konflik

app.use(cors({ origin: "*" }));
app.use(express.json());

// Data statis untuk pengujian (berdasarkan format MQTT yang Anda berikan)
// const testBeaconData = [
//   {
//     id: 3,
//     gateway_id: 1,
//     type: 4,
//     dmac: "BC572905DB80",
//     refpower: -59,
//     rssi: -65,
//     vbatt: "N",
//     temp: "N",
//     time: "2025-06-10 08:35:00,000", // Waktu dekat dengan sekarang (08:36 AM WIB)
//     meter: "1,88005408984861",
//     calc_dist: "5,50",
//     gmac: "282C02227F53",
//     measure: -59,
//   },
//   {
//     id: 1003,
//     gateway_id: 2,
//     type: 4,
//     dmac: "BC572905DB80",
//     refpower: -59,
//     rssi: -66,
//     vbatt: "N",
//     temp: "N",
//     time: "2025-06-10 08:35:00,000",
//     meter: "2,000",
//     calc_dist: "3,20",
//     gmac: "282C02227FDD",
//     measure: -59,
//   },
//   {
//     id: 2003,
//     gateway_id: 3,
//     type: 4,
//     dmac: "BC572905DB80",
//     refpower: -59,
//     rssi: -67,
//     vbatt: "N",
//     temp: "N",
//     time: "2025-06-10 08:35:05,000", // 5 detik setelah data sebelumnya
//     meter: "2,200",
//     calc_dist: "4,10",
//     gmac: "282C02227F1A",
//     measure: -59,
//   },
//   {
//     id: 7,
//     gateway_id: 1,
//     type: 4,
//     dmac: "BC572905DB81", // DMAC berbeda untuk tes tambahan
//     refpower: -59,
//     rssi: -65,
//     vbatt: "N",
//     temp: "N",
//     time: "2025-06-10 08:35:00,000",
//     meter: "2,09721437756176",
//     calc_dist: "6,75",
//     gmac: "282C02227F53",
//     measure: -59,
//   },
// ];

const testBeaconData = [
  {
    id: 3,
    gateway_id: 1,
    type: 4,
    dmac: "BC572905DB80",
    refpower: -59,
    rssi: -65,
    vbatt: "\\N",
    temp: "\\N",
    time: "2025-05-29 05:47:56,880",
    meter: 1.88005408984861,
    calc_dist: 7.14420554142471,
    gmac: "282C02227F53",
    measure: -59,
  },
  {
    id: 7,
    gateway_id: 1,
    type: 4,
    dmac: "BC572905DB80",
    refpower: -59,
    rssi: -65,
    vbatt: "\\N",
    temp: "\\N",
    time: "2025-05-29 05:48:05,580",
    meter: 2.09721437756176,
    calc_dist: 7.96941463473468,
    gmac: "282C02227F53",
    measure: -59,
  },
  {
    id: 11,
    gateway_id: 1,
    type: 4,
    dmac: "BC572905DB80",
    refpower: -59,
    rssi: -65,
    vbatt: "\\N",
    temp: "\\N",
    time: "2025-05-29 05:48:14,893",
    meter: 2.01063958237826,
    calc_dist: 7.64043041303738,
    gmac: "282C02227F53",
    measure: -59,
  },
  {
    id: 15,
    gateway_id: 1,
    type: 4,
    dmac: "BC572905DB80",
    refpower: -59,
    rssi: -65,
    vbatt: "\\N",
    temp: "\\N",
    time: "2025-05-29 05:48:23,517",
    meter: 2.09319362449555,
    calc_dist: 7.9541357730831,
    gmac: "282C02227F53",
    measure: -59,
  },
  {
    id: 18,
    gateway_id: 1,
    type: 4,
    dmac: "BC572905DB80",
    refpower: -59,
    rssi: -65,
    vbatt: "\\N",
    temp: "\\N",
    time: "2025-05-29 05:48:32,537",
    meter: 2.27315234857874,
    calc_dist: 8.6379789245992,
    gmac: "282C02227F53",
    measure: -59,
  },
  {
    id: 23,
    gateway_id: 1,
    type: 4,
    dmac: "BC572905DB80",
    refpower: -59,
    rssi: -66,
    vbatt: "\\N",
    temp: "\\N",
    time: "2025-05-29 05:48:41,547",
    meter: 2.29581293207296,
    calc_dist: 8.72408914187726,
    gmac: "282C02227F53",
    measure: -59,
  },
  {
    id: 26,
    gateway_id: 1,
    type: 4,
    dmac: "BC572905DB80",
    refpower: -59,
    rssi: -70,
    vbatt: "\\N",
    temp: "\\N",
    time: "2025-05-29 05:48:50,797",
    meter: 3.11213138182335,
    calc_dist: 11.8260992509287,
    gmac: "282C02227F53",
    measure: -59,
  },
  {
    id: 30,
    gateway_id: 1,
    type: 4,
    dmac: "BC572905DB80",
    refpower: -59,
    rssi: -65,
    vbatt: "\\N",
    temp: "\\N",
    time: "2025-05-29 05:49:00,267",
    meter: 2.42015684885155,
    calc_dist: 9.19659602563588,
    gmac: "282C02227F53",
    measure: -59,
  },
  {
    id: 35,
    gateway_id: 1,
    type: 4,
    dmac: "BC572905DB80",
    refpower: -59,
    rssi: -65,
    vbatt: "\\N",
    temp: "\\N",
    time: "2025-05-29 05:49:08,867",
    meter: 2.03915881677304,
    calc_dist: 7.74880350373757,
    gmac: "282C02227F53",
    measure: -59,
  },
  {
    id: 38,
    gateway_id: 1,
    type: 4,
    dmac: "BC572905DB80",
    refpower: -59,
    rssi: -71,
    vbatt: "\\N",
    temp: "\\N",
    time: "2025-05-29 05:49:17,790",
    meter: 3.57649028013115,
    calc_dist: 13.5906630644984,
    gmac: "282C02227F53",
    measure: -59,
  },
  {
    id: 43,
    gateway_id: 1,
    type: 4,
    dmac: "BC572905DB80",
    refpower: -59,
    rssi: -68,
    vbatt: "\\N",
    temp: "\\N",
    time: "2025-05-29 05:49:26,907",
    meter: 2.89331367469242,
    calc_dist: 10.9945919638312,
    gmac: "282C02227F53",
    measure: -59,
  },
  {
    id: 46,
    gateway_id: 1,
    type: 4,
    dmac: "BC572905DB80",
    refpower: -59,
    rssi: -69,
    vbatt: "\\N",
    temp: "\\N",
    time: "2025-05-29 05:49:37,370",
    meter: 2.65193197675801,
    calc_dist: 10.0773415116804,
    gmac: "282C02227F53",
    measure: -59,
  },
  {
    id: 51,
    gateway_id: 1,
    type: 4,
    dmac: "BC572905DB80",
    refpower: -59,
    rssi: -66,
    vbatt: "\\N",
    temp: "\\N",
    time: "2025-05-29 05:49:45,363",
    meter: 2.2608297895021,
    calc_dist: 8.59115320010796,
    gmac: "282C02227F53",
    measure: -59,
  },
  {
    id: 55,
    gateway_id: 1,
    type: 4,
    dmac: "BC572905DB80",
    refpower: -59,
    rssi: -67,
    vbatt: "\\N",
    temp: "\\N",
    time: "2025-05-29 05:49:54,270",
    meter: 2.49775085436145,
    calc_dist: 9.49145324657351,
    gmac: "282C02227F53",
    measure: -59,
  },
  {
    id: 60,
    gateway_id: 1,
    type: 4,
    dmac: "BC572905DB80",
    refpower: -59,
    rssi: -65,
    vbatt: "\\N",
    temp: "\\N",
    time: "2025-05-29 05:50:04,087",
    meter: 2.28682068096582,
    calc_dist: 8.6899185876701,
    gmac: "282C02227F53",
    measure: -59,
  },
  {
    id: 64,
    gateway_id: 1,
    type: 4,
    dmac: "BC572905DB80",
    refpower: -59,
    rssi: -65,
    vbatt: "\\N",
    temp: "\\N",
    time: "2025-05-29 05:50:12,973",
    meter: 2.01786145809846,
    calc_dist: 7.66787354077416,
    gmac: "282C02227F53",
    measure: -59,
  },
  {
    id: 67,
    gateway_id: 1,
    type: 4,
    dmac: "BC572905DB80",
    refpower: -59,
    rssi: -66,
    vbatt: "\\N",
    temp: "\\N",
    time: "2025-05-29 05:50:21,603",
    meter: 3.36236371518425,
    calc_dist: 12.7769821177002,
    gmac: "282C02227F53",
    measure: -59,
  },
  {
    id: 72,
    gateway_id: 1,
    type: 4,
    dmac: "BC572905DB80",
    refpower: -59,
    rssi: -70,
    vbatt: "\\N",
    temp: "\\N",
    time: "2025-05-29 05:50:29,800",
    meter: 2.84208980128881,
    calc_dist: 10.7999412448975,
    gmac: "282C02227F53",
    measure: -59,
  },
  {
    id: 75,
    gateway_id: 1,
    type: 4,
    dmac: "BC572905DB80",
    refpower: -59,
    rssi: -70,
    vbatt: "\\N",
    temp: "\\N",
    time: "2025-05-29 05:50:38,687",
    meter: 3.19461895022642,
    calc_dist: 12.1395520108604,
    gmac: "282C02227F53",
    measure: -59,
  },
  {
    id: 79,
    gateway_id: 1,
    type: 4,
    dmac: "BC572905DB80",
    refpower: -59,
    rssi: -65,
    vbatt: "\\N",
    temp: "\\N",
    time: "2025-05-29 05:50:47,387",
    meter: 1.98641092507364,
    calc_dist: 7.54836151527984,
    gmac: "282C02227F53",
    measure: -59,
  },
  {
    id: 82,
    gateway_id: 1,
    type: 4,
    dmac: "BC572905DB80",
    refpower: -59,
    rssi: -64,
    vbatt: "\\N",
    temp: "\\N",
    time: "2025-05-29 05:50:56,213",
    meter: 2.00267179659615,
    calc_dist: 7.61015282706536,
    gmac: "282C02227F53",
    measure: -59,
  },
  {
    id: 87,
    gateway_id: 1,
    type: 4,
    dmac: "BC572905DB80",
    refpower: -59,
    rssi: -65,
    vbatt: "\\N",
    temp: "\\N",
    time: "2025-05-29 05:51:03,950",
    meter: 2.01754771215098,
    calc_dist: 7.66668130617371,
    gmac: "282C02227F53",
    measure: -59,
  },
  {
    id: 90,
    gateway_id: 1,
    type: 4,
    dmac: "BC572905DB80",
    refpower: -59,
    rssi: -65,
    vbatt: "\\N",
    temp: "\\N",
    time: "2025-05-29 05:51:13,363",
    meter: 2.35557410789372,
    calc_dist: 8.95118160999612,
    gmac: "282C02227F53",
    measure: -59,
  },
  {
    id: 94,
    gateway_id: 1,
    type: 4,
    dmac: "BC572905DB80",
    refpower: -59,
    rssi: -66,
    vbatt: "\\N",
    temp: "\\N",
    time: "2025-05-29 05:51:22,117",
    meter: 2.34872483354516,
    calc_dist: 8.9251543674716,
    gmac: "282C02227F53",
  },
  {
    id: 3,
    gateway_id: 1,
    type: 4,
    dmac: "BC572905DB80",
    refpower: -59,
    rssi: -65,
    vbatt: "N",
    temp: "N",
    time: "2025-06-11 06:09:00,000", // Disinkronkan dengan waktu saat ini (06:09 AM WIB)
    meter: 1.88005408984861,
    calc_dist: 5.5,
    gmac: "282C02227F53",
    measure: -59,
  },
  {
    id: 1003,
    gateway_id: 2,
    type: 4,
    dmac: "BC572905DB80",
    refpower: -59,
    rssi: -66,
    vbatt: "N",
    temp: "N",
    time: "2025-06-11 06:09:00,000",
    meter: 2.0,
    calc_dist: 3.2,
    gmac: "282C02227FDD",
    measure: -59,
  },
  {
    id: 2003,
    gateway_id: 3,
    type: 4,
    dmac: "BC572905DB80",
    refpower: -59,
    rssi: -67,
    vbatt: "N",
    temp: "N",
    time: "2025-06-11 06:09:05,000", // 5 detik setelah
    meter: 2.2,
    calc_dist: 4.1,
    gmac: "282C02227F1A",
    measure: -59,
  },
  {
    id: 7,
    gateway_id: 1,
    type: 4,
    dmac: "BC572905DB81",
    refpower: -59,
    rssi: -65,
    vbatt: "N",
    temp: "N",
    time: "2025-06-11 06:09:00,000",
    meter: 2.09721437756176,
    calc_dist: 6.75,
    gmac: "282C02227F53",
    measure: -59,
  },
];

// Struktur untuk menyimpan data beacon real-time
let realtimeBeaconPairs = new Map();
const timeTolerance = 5000; // Toleransi waktu 5 detik (dalam milidetik)

const gateways = {
  "282C02227F53": { x: 50, y: 150 },
  "282C02227FDD": { x: 20, y: 100 },
  "282C02227F1A": { x: 40, y: 120 },
};

// Fungsi untuk mensimulasikan pemrosesan data statis
function setupTestRealtimeStream() {
  testBeaconData.forEach((beacon) => {
    const { dmac, gmac, calc_dist: calcDistStr, time: timeStr } = beacon;
    const timestamp = new Date(timeStr.replace(",", ".")).getTime();

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
    dmacData.get(closestTime)[gmac] = parseFloat(calcDistStr);
  });
}

function setupTestRealtimeStream() {
  testBeaconData.forEach((beacon) => {
    const { dmac, gmac, calc_dist: calcDist, time: timeStr } = beacon;
    const timestamp = new Date(timeStr.replace(",", ".")).getTime();

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
    dmacData.get(closestTime)[gmac] = calcDist; // Karena sudah float
  });
}

function generateBeaconPointsBetweenReaders(start, end, firstDist, secondDist) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length === 0) return null;

  const ux = dx / length;
  const uy = dy / length;
  const lengthMeter = length * 1;

  const totalDist = firstDist + secondDist;
  if (totalDist === 0) return null;
  const ratio = firstDist / totalDist;
  const distFromStart = ratio * lengthMeter;

  const baseX = start.x + ux * distFromStart;
  const baseY = start.y + uy * distFromStart;
  const perpX = -uy;
  const perpY = ux;

  const offsetPerp = Math.random() * (3 + 3) - (3 + 3) / 2;
  const offsetAlong = Math.random() * 3 - 3 / 2;

  const x = Math.round(baseX + perpX * offsetPerp + ux * offsetAlong);
  const y = Math.round(baseY + perpY * offsetPerp + uy * offsetAlong);

  return { x, y };
}

function calculateDistanceInfo(start, end) {
  const deltaX = end.x - start.x;
  const dy = end.y - start.y;
  const jarakPixel = Math.hypot(deltaX, dy);
  const jarakMeter = jarakPixel * 1;

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

// Inisialisasi data statis saat server mulai
setupTestRealtimeStream();

// Endpoint untuk streaming data posisi beacon
app.get("/api/beacons/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Kirim data awal
  const initialPositions = generateBeaconPositions();
  res.write(`data: ${JSON.stringify(initialPositions)}\n\n`);

  // Simulasi pembaruan data setiap 5 detik
  const intervalId = setInterval(() => {
    const newBeacon = {
      id: Math.floor(Math.random() * 10000),
      gateway_id: 1,
      type: 4,
      dmac: `BC572905DB8${Math.floor(Math.random() * 10)}`,
      refpower: -59,
      rssi: -65,
      vbatt: "N",
      temp: "N",
      time:
        new Date().toISOString().replace("T", " ").replace("Z", "") + ",000",
      meter: parseFloat((Math.random() * 2).toFixed(2)),
      calc_dist: parseFloat((Math.random() * 10).toFixed(2)),
      gmac: "282C02227F53",
      measure: -59,
    };

    // Proses data baru
    const { dmac, gmac, calc_dist, time: timeStr } = newBeacon;
    const timestamp = new Date(timeStr.replace(",", ".")).getTime();

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
    dmacData.get(closestTime)[gmac] = calc_dist;

    // Kirim pembaruan posisi
    const updatedPositions = generateBeaconPositions();
    res.write(`data: ${JSON.stringify(updatedPositions)}\n\n`);
  }, 5000);

  req.on("close", () => {
    clearInterval(intervalId);
    res.end();
  });
});

// Endpoint statis untuk data awal
app.get("/api/beacons", (req, res) => {
  const positions = generateBeaconPositions();
  res.json(positions);
});

app.listen(port, () => {
  console.log(`📡 Beacon Stream Simulator ready → http://localhost:${port}`);
});
