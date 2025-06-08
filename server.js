const express = require("express");
const cors = require("cors");
const app = express();
const port = 3030;

app.use(cors({ origin: "*" }));
app.use(express.json());

const scaleFactor = 1;

const gateways = {
  "282C02227F53": { x: 50 * scaleFactor, y: 150 * scaleFactor },
  "282C02227FDD": { x: 20 * scaleFactor, y: 100 * scaleFactor },
  "282C02227F1A": { x: 40 * scaleFactor, y: 120 * scaleFactor },
};

const scale = 1;
const spreadLeft = 3;
const spreadRight = 3;
const spreadAlong = 3;

const beaconData = [
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
    calc_dist: (Math.random() * 10).toFixed(2).replace(".", ","),
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
    calc_dist: (Math.random() * 10).toFixed(2).replace(".", ","),
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
    calc_dist: (Math.random() * 10).toFixed(2).replace(".", ","),
    gmac: "282C02227F1A",
    measure: -59,
  },
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
    calc_dist: (Math.random() * 10).toFixed(2).replace(".", ","),
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
    calc_dist: (Math.random() * 10).toFixed(2).replace(".", ","),
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
    calc_dist: (Math.random() * 10).toFixed(2).replace(".", ","),
    gmac: "282C02227F1A",
    measure: -59,
  },
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
    calc_dist: (Math.random() * 10).toFixed(2).replace(".", ","),
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
    calc_dist: (Math.random() * 10).toFixed(2).replace(".", ","),
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
    calc_dist: (Math.random() * 10).toFixed(2).replace(".", ","),
    gmac: "282C02227F1A",
    measure: -59,
  },
];

function generateBeaconPointsBetweenReaders(start, end, firstDist, secondDist) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length === 0) return null;

  const ux = dx / length;
  const uy = dy / length;

  const lengthMeter = length * scale;


  firstDist = Math.random() * 10;
  secondDist = Math.random() * 10;
  
  const totalDist = firstDist + secondDist;

  if (totalDist === 0) return null;
  const ratio = firstDist / totalDist;
  const distFromStart = ratio * lengthMeter;

  const baseX = start.x + ux * distFromStart;
  const baseY = start.y + uy * distFromStart;

  const perpX = -uy;
  const perpY = ux;


  const offsetPerp =
    Math.random() * (spreadRight + spreadLeft) - (spreadRight + spreadLeft) / 2;
  const offsetAlong = Math.random() * spreadAlong - spreadAlong / 2;

  const x = Math.round(baseX + perpX * offsetPerp + ux * offsetAlong);
  const y = Math.round(baseY + perpY * offsetPerp + uy * offsetAlong);

  return { x, y };

}
function calculateDistanceInfo(start, end) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;

  const jarakPixel = Math.hypot(deltaX, deltaY);
  const jarakMeter = jarakPixel * scale;

  return {
    jarakPixel: +jarakPixel.toFixed(2),
    jarakMeter: +jarakMeter.toFixed(2),
  };
}

function generateSimulatedBeaconData() {
  const beaconId = "BC572905DB80";

  const timeGroups = {};
  beaconData.forEach((entry) => {
    const time = entry.time;
    const dmac = entry.dmac;
    if (!timeGroups[time]) timeGroups[time] = {};
    if (!timeGroups[time][dmac]) timeGroups[time][dmac] = {};
    timeGroups[time][dmac][entry.gmac] = parseFloat(entry.calc_dist);
  });

  const gatewayPairs = [
    ["282C02227F53", "282C02227FDD"],
    ["282C02227FDD", "282C02227F1A"],
    ["282C02227F1A", "282C02227F53"],
  ];

  const simulations = [];
  Object.entries(timeGroups).forEach(([time, tags]) => {
    Object.entries(tags).forEach(([dmac, distances]) => {
      gatewayPairs.forEach(([firstReader, secondReader]) => {
        if (distances[firstReader] && distances[secondReader]) {
          simulations.push({
            dmac,
            firstReader,
            secondReader,
            firstDist: distances[firstReader],
            secondDist: distances[secondReader],
            time,
          });
        }
      });
    });
  });

  return simulations.map(
    ({ dmac, firstReader, secondReader, firstDist, secondDist, time }) => {
      const start = gateways[firstReader];
      const end = gateways[secondReader];

      const point = generateBeaconPointsBetweenReaders(
        start,
        end,
        firstDist,
        secondDist
      );
      const { jarakPixel, jarakMeter } = calculateDistanceInfo(start, end);

      return {
        beaconId: dmac,
        pair: `${firstReader}_${secondReader}`,
        first: firstReader,
        second: secondReader,
        firstDist,
        secondDist,
        jarakPixel,
        jarakMeter,
        point,
        firstReaderCoord: { id: firstReader, ...gateways[firstReader] },
        secondReaderCoord: { id: secondReader, ...gateways[secondReader] },
        time,
      };
    }
  );
}

app.get("/api/beacons", (req, res) => {
  const beaconData = generateSimulatedBeaconData();
  res.json(beaconData);
});

app.listen(port, () => {
  console.log(`📡 Beacon Distance Simulator ready → http://localhost:${port}`);
});
