const { startMqttClient } = require("./mqtt");
const { fetchAllFloorplans } = require("./database");

let realtimeBeaconPairs = new Map();
const timeTolerance = 50000000000; // 10 detik untuk jendela waktu lebih besar
let client;
const floorplans = new Map();
const gmacToFloorplan = new Map();

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
        scale: Number(scale),
        gateways: new Map(),
        maskedAreas: [],
      });
    }

    for (const { floorplan_id, gmac, pos_px_x, pos_px_y } of gateways) {
      if (floorplans.has(floorplan_id)) {
        floorplans
          .get(floorplan_id)
          .gateways.set(gmac, { x: Number(pos_px_x), y: Number(pos_px_y) });
        gmacToFloorplan.set(gmac, floorplan_id);
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
      gateways: [...floorplans.entries()].map(([id, data]) => ({
        floorplan_id: id,
        gateways: [...data.gateways],
      })),
      gmacToFloorplan: [...gmacToFloorplan],
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
      console.log(`Received MQTT beacon on ${topic}:`, beacon);
      try {
        if (!beacon || typeof beacon !== "object") {
          console.error("Invalid beacon: not an object", { topic, beacon });
          return;
        }

        const { dmac, gmac, calcDist: calcDistStr, time } = beacon;
        if (!dmac || !gmac || calcDistStr == null || !time) {
          console.error("Invalid beacon: missing properties", { beacon });
          return;
        }

        const calc_dist = parseFloat(calcDistStr);
        if (isNaN(calc_dist)) {
          console.error("Invalid calcDist: not a number", { calcDistStr });
          return;
        }

        const timestamp = new Date(time.replace(",", ".")).getTime();
        if (isNaN(timestamp)) {
          console.error("Invalid timestamp:", time);
          return;
        }

        let floorplanId = gmacToFloorplan.get(gmac);
        let floorplanBeacons;

        if (!floorplanId) {
          console.warn(`No floorplan for GMAC: ${gmac}, using global storage`);
          floorplanId = "global";
          if (!realtimeBeaconPairs.has(floorplanId)) {
            realtimeBeaconPairs.set(floorplanId, new Map());
          }
          floorplanBeacons = realtimeBeaconPairs.get(floorplanId);
        } else {
          if (!realtimeBeaconPairs.has(floorplanId)) {
            realtimeBeaconPairs.set(floorplanId, new Map());
          }
          floorplanBeacons = realtimeBeaconPairs.get(floorplanId);
        }

        const now = Date.now();
        for (const [dmacKey, timestamps] of floorplanBeacons) {
          for (const [t] of timestamps) {
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
        for (const [t] of dmacData) {
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

        const floorplan = floorplans.get(
          floorplanId === "global" ? [...floorplans.keys()][0] : floorplanId
        );
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
                if (err)
                  console.error(
                    `Failed to publish to beacon/output/${floorplanId}:`,
                    err
                  );
                else
                  console.log(
                    `Published to beacon/output/${floorplanId}:`,
                    positions
                  );
              }
            );
          } else {
            console.log(`No positions generated for floorplan ${floorplanId}`);
          }
        } else {
          console.warn(`No floorplan data for ${floorplanId}`);
        }
      } catch (error) {
        console.error("Error processing MQTT beacon:", error, { beacon });
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
    isNaN(secondDist) ||
    !scale
  ) {
    console.error("Invalid inputs for generateBeaconPointsBetweenReaders:", {
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
  if (length === 0) {
    console.warn("Zero distance between readers:", { start, end });
    return null;
  }

  const ux = dx / length;
  const uy = dy / length;
  const lengthMeter = length * scale;

  const totalDist = firstDist + secondDist;
  if (totalDist === 0) {
    console.warn("Zero total distance:", { firstDist, secondDist });
    return null;
  }

  const ratio = firstDist / totalDist;
  const distFromStart = ratio * lengthMeter;

  const baseX = start.x + ux * distFromStart;
  const baseY = start.y + uy * distFromStart;
  const perpX = -uy;
  const perpY = ux;

  const spread = 1;
  const offsetPerp = Math.random() * spread * 2 - spread;
  const offsetAlong = Math.random() * spread * 2 - spread;

  const x = Math.round(baseX + perpX * offsetPerp + ux * offsetAlong);
  const y = Math.round(baseY + perpY * offsetPerp + uy * offsetAlong);

  return { x, y };
}

function generateSingleReaderPoint(reader, dist, scale) {
  if (!reader || dist == null || isNaN(dist) || !scale) {
    console.error("Invalid inputs for generateSingleReaderPoint:", {
      reader,
      dist,
      scale,
    });
    return null;
  }

  const spread = dist * scale * 0.5;
  const x = Math.round(reader.x + (Math.random() - 0.5) * spread);
  const y = Math.round(reader.y + (Math.random() - 0.5) * spread);
  return { x, y };
}

function calculateDistanceInfo(start, end, scale) {
  if (!start || !end || !scale) {
    return { jarakPixel: 0, jarakMeter: 0 };
  }
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const jarakPixel = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  const jarakMeter = jarakPixel * scale;
  return {
    jarakPixel: +jarakPixel.toFixed(2),
    jarakMeter: +jarakMeter.toFixed(2),
  };
}

function generateBeaconPositions(floorplanId, gateways, scale) {
  console.log("Generating beacon positions:", {
    floorplanId,
    gateways: [...gateways],
    scale,
  });

  const pairs = [];
  const floorplanBeacons =
    realtimeBeaconPairs.get(floorplanId) ||
    realtimeBeaconPairs.get("global") ||
    new Map();

  const now = Date.now();
  for (const [dmac, timestamps] of floorplanBeacons) {
    for (const [t] of timestamps) {
      if (now - t > timeTolerance) timestamps.delete(t);
    }
    if (timestamps.size === 0) floorplanBeacons.delete(dmac);
  }

  for (const [dmac, timestamps] of floorplanBeacons) {
    for (const [time, distances] of timestamps) {
      console.log(`Processing beacon ${dmac} at time ${time}:`, distances);
      const readerDistances = [...gateways.keys()]
        .map((gmac) => ({
          gmac,
          distance: distances[gmac] != null ? distances[gmac] : Infinity,
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

        console.log(`Pairing readers: ${firstReader}, ${secondReader}`);

        const start = gateways.get(firstReader);
        const end = gateways.get(secondReader);
        const point = generateBeaconPointsBetweenReaders(
          start,
          end,
          firstDist,
          secondDist,
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
          firstDist,
          secondDist,
          jarakPixel,
          jarakMeter,
          point: point || { x: null, y: null },
          firstReaderCoord: { id: firstReader, ...start },
          secondReaderCoord: { id: secondReader, ...end },
          time: new Date(time).toISOString(),
          floorplanId,
        });
      } else if (
        validReaders.length === 1 &&
        process.env.ALLOW_SINGLE_READER === "true"
      ) {
        const reader = validReaders[0].gmac;
        const dist = validReaders[0].distance;
        const coord = gateways.get(reader);
        const point = generateSingleReaderPoint(coord, dist, scale);

        console.log(`Using single reader ${reader} for ${dmac}`);

        pairs.push({
          beaconId: dmac,
          pair: `${reader}_single`,
          first: reader,
          second: null,
          firstDist: dist,
          secondDist: null,
          jarakPixel: 0,
          jarakMeter: 0,
          point: point || { x: null, y: null },
          firstReaderCoord: { id: reader, ...coord },
          secondReaderCoord: null,
          time: new Date(time).toISOString(),
          floorplanId,
        });
      } else {
        console.log(`Insufficient readers for ${dmac}: ${validReaders.length}`);
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

// const { startMqttClient } = require("./mqtt");
// const { fetchAllFloorplans } = require("./database");
// const { saveBeaconPositions } = require("./beaconStorage");

// let realtimeBeaconPairs = new Map(); // floorplanId -> Map(dmac -> Map(timestamp -> { gmac: calcDist }))
// const timeTolerance = 5000;
// let client;
// const floorplans = new Map(); // floorplanId -> { name, scale, gateways: Map(gmac -> { x, y }), maskedAreas: [] }
// const gmacToFloorplan = new Map(); // gmac -> floorplanId
// let interval;

// async function initializeAllFloorplans() {
//   try {
//     const {
//       floorplans: floorplanData,
//       gateways,
//       maskedAreas,
//     } = await fetchAllFloorplans();
//     floorplans.clear();
//     gmacToFloorplan.clear();

//     for (const { floorplan_id, name, scale } of floorplanData) {
//       floorplans.set(floorplan_id, {
//         name,
//         scale,
//         gateways: new Map(),
//         maskedAreas: [],
//       });
//     }

//     for (const { floorplan_id, gmac, pos_px_x, pos_px_y } of gateways) {
//       if (floorplans.has(floorplan_id)) {
//         floorplans
//           .get(floorplan_id)
//           .gateways.set(gmac, { x: Number(pos_px_x), y: Number(pos_px_y) });
//         if (!gmacToFloorplan.has(gmac)) {
//           gmacToFloorplan.set(gmac, floorplan_id);
//         } else if (gmacToFloorplan.get(gmac) !== floorplan_id) {
//           console.error(`GMAC ${gmac} associated with multiple floorplans`);
//         }
//       }
//     }

//     for (const { floorplan_id, area_shape, restricted_status } of maskedAreas) {
//       if (floorplans.has(floorplan_id) && area_shape) {
//         const polygon = JSON.parse(area_shape);
//         // Validasi minimal 3 node untuk poligon
//         if (polygon.length < 3) {
//           console.warn(
//             `Polygon for floorplan ${floorplan_id} has less than 3 nodes, skipping.`
//           );
//           continue;
//         }
//         // Verifikasi arah berlawanan jarum jam (opsional, untuk debugging)
//         const area = calculatePolygonArea(polygon);
//         if (area > 0) {
//           console.warn(
//             `Polygon for floorplan ${floorplan_id} may not be counterclockwise, area: ${area}`
//           );
//         }
//         floorplans
//           .get(floorplan_id)
//           .maskedAreas.push({ area_shape, restricted_status });
//       }
//     }

//     console.log(`Initialized ${floorplans.size} floorplans`);
//     return floorplans;
//   } catch (error) {
//     console.error("Inisialisasi floorplan gagal:", error);
//     throw error;
//   }
// }

// // Fungsi untuk menghitung area poligon (untuk memverifikasi arah)
// function calculatePolygonArea(polygon) {
//   let area = 0;
//   for (let i = 0; i < polygon.length; i++) {
//     let j = (i + 1) % polygon.length;
//     area += (polygon[j].x - polygon[i].x) * (polygon[j].y + polygon[i].y);
//   }
//   return area / 2;
// }

// // Fungsi untuk memeriksa apakah titik berada di dalam poligon
// function pointInPolygon(point, polygon) {
//   let x = point.x,
//     y = point.y;
//   let inside = false;
//   for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
//     let xi = polygon[i].x,
//       yi = polygon[i].y;
//     let xj = polygon[j].x,
//       yj = polygon[j].y;
//     let intersect =
//       yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
//     if (intersect) inside = !inside;
//   }
//   console.log(
//     `Point (${x}, ${y}) checked against polygon with IDs: [${polygon
//       .map((p) => p.id)
//       .join(", ")}], Result: ${inside}`
//   );
//   return inside;
// }

// // Fungsi untuk memeriksa apakah titik valid berdasarkan maskedAreas
// function isPointValid(point, floorplanId) {
//   const floorplan = floorplans.get(floorplanId);
//   if (!floorplan) return false;

//   const { maskedAreas } = floorplan;

//   // Periksa apakah ada area restrict
//   const isInRestrictedArea = maskedAreas.some((area) => {
//     if (area.restricted_status === "restrict") {
//       try {
//         const polygon = JSON.parse(area.area_shape);
//         return pointInPolygon(point, polygon);
//       } catch (error) {
//         console.error(
//           `Error parsing area_shape for floorplan ${floorplanId}:`,
//           error
//         );
//         return false;
//       }
//     }
//     return false;
//   });

//   if (isInRestrictedArea) return false;

//   // Periksa apakah ada area non-restrict dan apakah titik berada di dalamnya
//   const hasNonRestrictAreas = maskedAreas.some(
//     (area) => area.restricted_status === "non-restrict"
//   );
//   if (hasNonRestrictAreas) {
//     const isInNonRestrictArea = maskedAreas.some((area) => {
//       if (area.restricted_status === "non-restrict") {
//         try {
//           const polygon = JSON.parse(area.area_shape);
//           return pointInPolygon(point, polygon);
//         } catch (error) {
//           console.error(
//             `Error parsing area_shape for floorplan ${floorplanId}:`,
//             error
//           );
//           return false;
//         }
//       }
//       return false;
//     });
//     return isInNonRestrictArea;
//   }

//   // Jika tidak ada area non-restrict, anggap valid (kecuali di restrict)
//   return true;
// }

// function setupRealtimeStream() {
//   if (!client) {
//     client = startMqttClient((topic, beacon) => {
//       try {
//         const { dmac, gmac, calcDist: calcDistStr, time } = beacon;
//         const calc_dist = parseFloat(calcDistStr);
//         const timestamp = new Date(time.replace(",", ".") + "Z").getTime();
//         const floorplanId = gmacToFloorplan.get(gmac);

//         if (!floorplanId) {
//           console.error(`No floorplan found for GMAC: ${gmac}`);
//           return;
//         }

//         if (!realtimeBeaconPairs.has(floorplanId)) {
//           realtimeBeaconPairs.set(floorplanId, new Map());
//         }
//         const floorplanBeacons = realtimeBeaconPairs.get(floorplanId);

//         if (!floorplanBeacons.has(dmac)) {
//           floorplanBeacons.set(dmac, new Map());
//         }
//         const dmacData = floorplanBeacons.get(dmac);

//         let closestTime = null;
//         let minDiff = Infinity;
//         for (let [t, distances] of dmacData) {
//           const diff = Math.abs(timestamp - t);
//           if (diff < minDiff && diff <= timeTolerance) {
//             minDiff = diff;
//             closestTime = t;
//           }
//         }

//         if (!closestTime) closestTime = timestamp;
//         if (!dmacData.has(closestTime)) dmacData.set(closestTime, {});
//         dmacData.get(closestTime)[gmac] = calc_dist;

//         const floorplan = floorplans.get(floorplanId);
//         if (floorplan) {
//           const positions = generateBeaconPositions(
//             floorplanId,
//             floorplan.gateways,
//             floorplan.scale
//           );

//           // Filter posisi berdasarkan masked area
//           const validPositions = positions.filter((pos) => {
//             const { point, beaconId, floorplanId } = pos;
//             if (!point) return false;

//             return isPointValid(point, floorplanId);
//           });

//           if (validPositions.length > 0) {
//             client.publish(
//               `${floorplanId}`,
//               JSON.stringify(validPositions),
//               { qos: 1 },
//               (err) => {
//                 if (err) {
//                   console.error(`Failed to publish to ${floorplanId}:`, err);
//                 }
//               }
//             );
//           }
//         }
//       } catch (error) {
//         console.error("Error processing beacon:", error, beacon);
//       }
//     });
//   }

//   if (interval) {
//     clearInterval(interval);
//   }

//   interval = setInterval(async () => {
//     const now = Date.now();

//     for (const [floorplanId, floorplanBeacons] of realtimeBeaconPairs) {
//       const floorplan = floorplans.get(floorplanId);
//       if (floorplan) {
//         const positions = generateBeaconPositions(
//           floorplanId,
//           floorplan.gateways,
//           floorplan.scale
//         );

//         // Filter posisi untuk penyimpanan
//         const validPositions = positions.filter((pos) => {
//           const { point, beaconId, floorplanId } = pos;
//           if (!point) return false;

//           return isPointValid(point, floorplanId);
//         });

//         if (validPositions.length > 0) {
//           await saveBeaconPositions(validPositions);
//         }
//       }

//       // Bersihkan data lama
//       for (const [dmac, timestamps] of floorplanBeacons) {
//         for (const [t] of timestamps) {
//           if (now - t > timeTolerance) {
//             timestamps.delete(t);
//           }
//         }
//         if (timestamps.size === 0) {
//           floorplanBeacons.delete(dmac);
//         }
//       }
//       if (floorplanBeacons.size === 0) {
//         realtimeBeaconPairs.delete(floorplanId);
//       }
//     }
//   }, 5000);
// }

// function generateBeaconPointsBetweenReaders(
//   start,
//   end,
//   firstDist,
//   secondDist,
//   scale,
//   floorplanId
// ) {
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

//   const spreadLeft = 10;
//   const spreadRight = 10;
//   const spreadAlong = 10;
//   const maxAttempts = 10;

//   for (let attempt = 0; attempt < maxAttempts; attempt++) {
//     const offsetPerp =
//       Math.random() * (spreadRight + spreadLeft) -
//       (spreadRight + spreadLeft) / 2;
//     const offsetAlong = Math.random() * spreadAlong - spreadAlong / 2;

//     const x = Math.round(baseX + perpX * offsetPerp + ux * offsetAlong);
//     const y = Math.round(baseY + perpY * offsetPerp + uy * offsetAlong);

//     const point = { x, y };

//     if (isPointValid(point, floorplanId)) {
//       console.log(
//         `Valid point generated: (${x}, ${y}) for floorplan ${floorplanId}`
//       );
//       return point;
//     }
//   }

//   console.log(
//     `No valid point found after ${maxAttempts} attempts for floorplan ${floorplanId}`
//   );
//   return null;
// }

// function generateBeaconPositions(floorplanId, gateways, scale) {
//   const pairs = [];
//   const floorplanBeacons = realtimeBeaconPairs.get(floorplanId) || new Map();

//   for (let [dmac, timestamps] of floorplanBeacons) {
//     for (let [time, distances] of timestamps) {
//       const readerDistances = Array.from(gateways.keys())
//         .map((gmac) => ({
//           gmac,
//           distance: distances[gmac] !== undefined ? distances[gmac] : Infinity,
//         }))
//         .sort((a, b) => a.distance - b.distance);

//       const validReaders = readerDistances.filter(
//         (r) =>
//           r.distance !== Infinity && gmacToFloorplan.get(r.gmac) === floorplanId
//       );

//       if (validReaders.length >= 2) {
//         const firstReader = validReaders[0].gmac;
//         const secondReader = validReaders[1].gmac;
//         const firstDist = validReaders[0].distance;
//         const secondDist = validReaders[1].distance;

//         const start = gateways.get(firstReader);
//         const end = gateways.get(secondReader);
//         const point = generateBeaconPointsBetweenReaders(
//           start,
//           end,
//           firstDist,
//           secondDist,
//           scale,
//           floorplanId
//         );

//         if (point) {
//           pairs.push({
//             beaconId: dmac,
//             pair: `${firstReader}_${secondReader}`,
//             first: firstReader,
//             second: secondReader,
//             firstDist: firstDist,
//             secondDist: secondDist,
//             point,
//             firstReaderCoord: { id: firstReader, ...start },
//             secondReaderCoord: { id: secondReader, ...end },
//             time: new Date(time).toISOString(),
//             floorplanId,
//           });
//         }
//       }
//     }
//   }

//   return pairs;
// }

// module.exports = {
//   setupRealtimeStream,
//   generateBeaconPositions,
//   initializeAllFloorplans,
// };
