const express = require("express");
const cors = require("cors");
const app = express();
const port = 3030;

app.use(cors({ origin: "*" }));
app.use(express.json());

// Koordinat gateway (sinkron dengan frontend)
const gateways = {
  "282C02227F53": { x: 50, y: 150 },
  "282C02227FDD": { x: 20, y: 100 },
  "282C02227F1A": { x: 40, y: 120 },
};

const scale = 0.1; // pixel per meter (bisa disesuaikan)
const spread = 10; // pixel sebaran kiri-kanan
const numPoints = 2; // Meningkatkan untuk simulasi yang lebih mirip gambar

// Data beacon sebagai objek JavaScript
const beaconData = [
  // Entri untuk ID 3
  {
    id: 3,
    gateway_id: 1,
    type: 4,
    dmac: "BC572905DB80",
    refpower: -59,
    rssi: -65,
    vbatt: "N",
    temp: "N",
    time: "2025-05-29 05:47:56,880",
    meter: "1,88005408984861",
    calc_dist: "7,14420554142471",
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
    time: "2025-05-29 05:47:56,880",
    meter: "2,000",
    calc_dist: "7,6",
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
    time: "2025-05-29 05:47:56,880",
    meter: "2,200",
    calc_dist: "8,36",
    gmac: "282C02227F1A",
    measure: -59,
  },
  // Entri untuk ID 7
  {
    id: 7,
    gateway_id: 1,
    type: 4,
    dmac: "BC572905DB80",
    refpower: -59,
    rssi: -65,
    vbatt: "N",
    temp: "N",
    time: "2025-05-29 05:48:05,580",
    meter: "2,09721437756176",
    calc_dist: "7,96941463473468",
    gmac: "282C02227F53",
    measure: -59,
  },
  {
    id: 1007,
    gateway_id: 2,
    type: 4,
    dmac: "BC572905DB80",
    refpower: -59,
    rssi: -66,
    vbatt: "N",
    temp: "N",
    time: "2025-05-29 05:48:05,580",
    meter: "2,200",
    calc_dist: "8,36",
    gmac: "282C02227FDD",
    measure: -59,
  },
  {
    id: 2007,
    gateway_id: 3,
    type: 4,
    dmac: "BC572905DB80",
    refpower: -59,
    rssi: -67,
    vbatt: "N",
    temp: "N",
    time: "2025-05-29 05:48:05,580",
    meter: "2,400",
    calc_dist: "9,12",
    gmac: "282C02227F1A",
    measure: -59,
  },
  // Entri untuk ID 278
  {
    id: 278,
    gateway_id: 1,
    type: 4,
    dmac: "BC572905DB80",
    refpower: -59,
    rssi: -65,
    vbatt: "N",
    temp: "N",
    time: "2025-05-29 05:58:32,630",
    meter: "2,03661840475793",
    calc_dist: "7,73914993808014",
    gmac: "282C02227F53",
    measure: -59,
  },
  {
    id: 1278,
    gateway_id: 2,
    type: 4,
    dmac: "BC572905DB80",
    refpower: -59,
    rssi: -66,
    vbatt: "N",
    temp: "N",
    time: "2025-05-29 05:58:32,630",
    meter: "2,150",
    calc_dist: "8,17",
    gmac: "282C02227FDD",
    measure: -59,
  },
  {
    id: 2278,
    gateway_id: 3,
    type: 4,
    dmac: "BC572905DB80",
    refpower: -59,
    rssi: -67,
    vbatt: "N",
    temp: "N",
    time: "2025-05-29 05:58:32,630",
    meter: "2,350",
    calc_dist: "8,93",
    gmac: "282C02227F1A",
    measure: -59,
  },
];

function generateBeaconPointsBetweenReaders(start, end, distA, distB) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length === 0) return [];

  const ux = dx / length;
  const uy = dy / length;

  // Gunakan rasio berdasarkan jarak (distA / (distA + distB))
  const totalDist = distA + distB;
  const ratio = distA / totalDist;

  // Hitung posisi dasar beacon di sepanjang garis
  const baseX = start.x + ux * (ratio * length);
  const baseY = start.y + uy * (ratio * length);

  // Vektor tegak lurus untuk sebaran
  const perpX = -uy;
  const perpY = ux;

  const points = [];
  for (let i = 0; i < numPoints; i++) {
    // Offset tegak lurus dan sepanjang garis untuk distribusi yang lebih realistis
    const offsetPerp = (Math.random() * 2 - 1) * spread; // -10 hingga +10
    const offsetAlong = (Math.random() * 2 - 1) * (spread / 2); // -5 hingga +5
    const x = Math.round(baseX + perpX * offsetPerp + ux * offsetAlong);
    const y = Math.round(baseY + perpY * offsetPerp + uy * offsetAlong);
    points.push({ x, y });
  }

  return points;
}

function calculateDistanceInfo(start, end) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;

  const jarakPixel = Math.hypot(deltaX, deltaY);
  const gate1_x = start.x * scale;
  const gate1_y = start.y * scale;
  const gate2_x = end.x * scale;
  const gate2_y = end.y * scale;
  const jarakMeter = Math.hypot(gate2_x - gate1_x, gate2_y - gate1_y);

  return {
    jarakPixel: +jarakPixel.toFixed(2),
    jarakMeter: +jarakMeter.toFixed(2),
  };
}

function generateSimulatedBeaconData() {
  const beaconId = "BC572905DB80";

  // Kelompokkan data berdasarkan waktu
  const timeGroups = {};
  beaconData.forEach((entry) => {
    const time = entry.time;
    if (!timeGroups[time]) timeGroups[time] = {};
    timeGroups[time][entry.gmac] = parseFloat(entry.calc_dist);
  });

  // Buat simulasi untuk semua pasangan gateway
  const simulations = [];
  Object.entries(timeGroups).forEach(([time, distances]) => {
    const gatewayIds = Object.keys(distances);
    for (let i = 0; i < gatewayIds.length; i++) {
      for (let j = i + 1; j < gatewayIds.length; j++) {
        const readerA = gatewayIds[i];
        const readerB = gatewayIds[j];
        simulations.push({
          readerA,
          readerB,
          distA: distances[readerA],
          distB: distances[readerB],
          time,
        });
      }
    }
  });

  return simulations.map(({ readerA, readerB, distA, distB, time }) => {
    const start = gateways[readerA];
    const end = gateways[readerB];

    const points = generateBeaconPointsBetweenReaders(start, end, distA, distB);
    const { jarakPixel, jarakMeter } = calculateDistanceInfo(start, end);

    return {
      beaconId,
      pair: `${readerA}_${readerB}`,
      from: readerA,
      to: readerB,
      distA,
      distB,
      jarakPixel,
      jarakMeter,
      points,
      time,
    };
  });
}

app.get("/api/beacons", (req, res) => {
  const beaconData = generateSimulatedBeaconData();
  res.json(beaconData);
});

app.listen(port, () => {
  console.log(`📡 Beacon Distance Simulator ready → http://localhost:${port}`);
});
