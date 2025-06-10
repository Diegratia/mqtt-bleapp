const express = require("express");
const cors = require("cors");
const app = express();
const port = 3030; // Port berbeda dari index.js (3000) untuk menghindari konflik

app.use(cors({ origin: "*" }));
app.use(express.json());

// Data statis untuk pengujian (berdasarkan format MQTT yang Anda berikan)
const testBeaconData = [
  {
    id: 3,
    gateway_id: 1,
    type: 4,
    dmac: "BC572905DB80",
    refpower: -59,
    rssi: -65,
    vbatt: "N",
    temp: "N",
    time: "2025-06-10 08:35:00,000", // Waktu dekat dengan sekarang (08:36 AM WIB)
    meter: "1,88005408984861",
    calc_dist: "5,50",
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
    time: "2025-06-10 08:35:00,000",
    meter: "2,000",
    calc_dist: "3,20",
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
    time: "2025-06-10 08:35:05,000", // 5 detik setelah data sebelumnya
    meter: "2,200",
    calc_dist: "4,10",
    gmac: "282C02227F1A",
    measure: -59,
  },
  {
    id: 7,
    gateway_id: 1,
    type: 4,
    dmac: "BC572905DB81", // DMAC berbeda untuk tes tambahan
    refpower: -59,
    rssi: -65,
    vbatt: "N",
    temp: "N",
    time: "2025-06-10 08:35:00,000",
    meter: "2,09721437756176",
    calc_dist: "6,75",
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
    if (!realtimeBeaconPairs.has(dmac)) realtimeBeaconPairs.set(dmac, new Map());
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
    dmacData.get(closestTime)[gmac] = parseFloat(calcDistStr.replace(",", "."));
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
          const point = generateBeaconPointsBetweenReaders(start, end, distances[firstReader], distances[secondReader]);
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

  // Simulasi pembaruan data setiap 5 detik (sesuai timeTolerance)
  const intervalId = setInterval(() => {
    // Tambahkan data baru secara statis untuk simulasi (bisa diubah untuk tes)
    const newBeacon = {
      id: Math.floor(Math.random() * 10000),
      gateway_id: 1,
      type: 4,
      dmac: "BC572905DB82",
      refpower: -59,
      rssi: -65,
      vbatt: "N",
      temp: "N",
      time: new Date().toISOString().replace("T", " ").replace("Z", "") + ",000",
      meter: (Math.random() * 2).toFixed(2).replace(".", ","),
      calc_dist: (Math.random() * 10).toFixed(2).replace(".", ","),
      gmac: "282C02227F53",
      measure: -59,
    };

    // Proses data baru
    const { dmac, gmac, calc_dist: calcDistStr, time: timeStr } = newBeacon;
    const timestamp = new Date(timeStr.replace(",", ".")).getTime();

    // Bersihkan data lama
    for (let [dmacKey, timestamps] of realtimeBeaconPairs) {
      for (let [t, distances] of timestamps) {
        if (timestamp - t > timeTolerance) timestamps.delete(t);
      }
      if (timestamps.size === 0) realtimeBeaconPairs.delete(dmacKey);
    }

    // Tambahkan data baru
    if (!realtimeBeaconPairs.has(dmac)) realtimeBeaconPairs.set(dmac, new Map());
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
    dmacData.get(closestTime)[gmac] = parseFloat(calcDistStr.replace(",", "."));

    // Kirim pembaruan posisi
    const updatedPositions = generateBeaconPositions();
    res.write(`data: ${JSON.stringify(updatedPositions)}\n\n`);
  }, 5000); // Pembaruan setiap 5 detik

  // Hentikan interval saat koneksi ditutup
  req.on("close", () => {
    clearInterval(intervalId);
    res.end();
  });
});

// Endpoint statis untuk data awal (opsional)
app.get("/api/beacons", (req, res) => {
  const positions = generateBeaconPositions();
  res.json(positions);
});

app.listen(port, () => {
  console.log(`📡 Beacon Stream Simulator ready → http://localhost:${port}`);
});